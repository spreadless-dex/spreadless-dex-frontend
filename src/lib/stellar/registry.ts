// The seam between "one hard-coded pool" and "whatever the Factory has
// deployed". Everything downstream (the router, the hook, the graph) asks
// this module for the set of vaults and never learns where the list came from.
//
// FACTORY_CONTRACT_ID is set, so listVaults() reports the Router's registry
// plus the live pool from config, which predates the Router and is in no
// registry. No caller changed when that switched over.

import { FACTORY_CONTRACT_ID, POOL_CONTRACT_ID, RPC_URL, NETWORK_PASSPHRASE, TOKENS } from "./config";
import { DEMO_VAULTS, isRoutingDemo } from "./demo";
import { listLocalPools } from "./localPools";
import { listPoolIds, routerClient } from "./routerClient";
import { feeScaleToPercent, percentToBps } from "./poolParams";

export interface VaultInfo {
  /** Pool contract address: the id every swap simulation is sent to. */
  address: string;
  /** Token contract addresses in the vault's canonical order. */
  tokens: string[];
  /** Human label for the graph. Falls back to a truncated address. */
  label: string;
  /**
   * Swap fee in basis points, when the source knows it. Router pools answer
   * `get_swap_fee`; the config-backed vault predates that getter, so its fee
   * stays undefined rather than guessed. The UI omits the fee label instead
   * of showing a number nobody verified.
   */
  feeBps?: number;
  /** Amplification, when the source knows it. Same caveat as `feeBps`. */
  amp?: number;
  /**
   * The Router's registry id. Multi-hop `swap_exact_in` addresses pools by this
   * and not by contract address, so a vault without one can only ever be a
   * single hop: the live pool, and anything deployed outside the Router.
   */
  poolId?: number;
  /** Current owner, when read from the chain. Undefined once renounced or unread. */
  owner?: string;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Display symbol for a token contract address, or a truncated address. */
export function tokenSymbol(address: string): string {
  return TOKENS.find((t) => t.contractId === address)?.symbol ?? shortAddress(address);
}

/** Token decimals for a contract address. Defaults to 7, the testnet norm. */
export function tokenDecimals(address: string): number {
  return TOKENS.find((t) => t.contractId === address)?.decimals ?? 7;
}

// The vault set changes only on a deploy, so it is worth caching, but not
// forever, or a freshly created vault stays invisible until reload.
//
// Two layers. In memory, a list younger than CACHE_TTL_MS is simply returned.
// In localStorage, the last list read survives the reload, so a returning
// visitor sees the pools at once rather than after the registry's chain of
// round trips. Anything older than the TTL is still served: it answers
// immediately while a fresh read runs behind it, and onVaultsChanged() tells
// whoever rendered it when that read lands (stale-while-revalidate).
//
// Serving a stale list is safe because nothing in a VaultInfo moves money. A
// pool's address and tokens never change; A, fee and owner can, and here they
// are labels, since every swap is quoted by simulation regardless. A pool
// created since the stored read is missing until the refresh, seconds later.
const CACHE_TTL_MS = 60_000;
const STORAGE_KEY = "spreadless-vaults-v1";
// Tied to the contracts it was read from, so a build pointed at another Router
// or pool never shows the previous deployment's list.
const STORAGE_SCOPE = `${FACTORY_CONTRACT_ID ?? "-"}|${POOL_CONTRACT_ID}`;

type CacheEntry = { at: number; vaults: VaultInfo[] };
let cache: CacheEntry | null = null;
let inflight: Promise<VaultInfo[]> | null = null;
const listeners = new Set<() => void>();

/** Mark the cached vault set stale. Call after a deploy or on an explicit refresh. */
export function invalidateVaults(): void {
  // Stale, not dropped: the next read still answers at once from what is known
  // and refreshes behind it, instead of blanking every list for a full read.
  const known = currentCache();
  if (known) cache = { ...known, at: 0 };
}

/**
 * Call `fn` whenever a read lands that differs from what was served, so a view
 * that rendered the stored list can ask again. Returns the unsubscribe.
 */
export function onVaultsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function listVaults(): Promise<VaultInfo[]> {
  const live = [...(await listLiveVaults()), ...listDeployedLocally()];
  // Demo vaults are appended, never cached: flipping the switch has to show
  // up on the next keystroke, and they cost nothing to build.
  if (!isRoutingDemo()) return live;
  return [
    ...live,
    ...DEMO_VAULTS.map((v) => ({
      address: v.address,
      tokens: v.tokens,
      label: v.label,
      feeBps: v.feeBps,
    })),
  ];
}

async function listLiveVaults(): Promise<VaultInfo[]> {
  const known = currentCache();
  if (known && Date.now() - known.at < CACHE_TTL_MS) return known.vaults;
  if (known) {
    refreshLiveVaults().catch((err) => console.error("Registry: background refresh failed:", err));
    return known.vaults;
  }
  return refreshLiveVaults();
}

// One read at a time: the register, the swap form and the pathfinder all ask
// on the same page load, and they share it.
function refreshLiveVaults(): Promise<VaultInfo[]> {
  if (!inflight) {
    inflight = (FACTORY_CONTRACT_ID ? readFactoryVaults(FACTORY_CONTRACT_ID) : readSingleVault())
      .then((vaults) => {
        const changed = !cache || fingerprint(cache.vaults) !== fingerprint(vaults);
        cache = { at: Date.now(), vaults };
        writeStored(cache);
        if (changed) listeners.forEach((fn) => fn());
        return vaults;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function currentCache(): CacheEntry | null {
  if (!cache) cache = readStored();
  return cache;
}

// Storage can be missing (SSR), blocked (some private modes) or full. Each of
// those only costs the head start, never the list, so every failure is silent.
function readStored(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scope?: unknown; at?: unknown; vaults?: unknown };
    if (parsed.scope !== STORAGE_SCOPE || typeof parsed.at !== "number" || !Array.isArray(parsed.vaults)) {
      return null;
    }
    const vaults = parsed.vaults.filter(isVaultInfo);
    return vaults.length > 0 ? { at: parsed.at, vaults } : null;
  } catch {
    return null;
  }
}

function writeStored(entry: CacheEntry): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scope: STORAGE_SCOPE, ...entry }));
  } catch {
    // The in-memory cache still has it; the next visit reads the chain.
  }
}

function isVaultInfo(value: unknown): value is VaultInfo {
  const v = value as Partial<VaultInfo> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.address === "string" &&
    typeof v.label === "string" &&
    Array.isArray(v.tokens) &&
    v.tokens.every((t) => typeof t === "string")
  );
}

function fingerprint(vaults: VaultInfo[]): string | null {
  try {
    return JSON.stringify(vaults);
  } catch {
    return null;
  }
}

// Pools this browser deployed straight through the SDK (see factory.ts).
// Real contracts, so they belong in the routing set; the Factory registry
// takes over the moment it exists. Demo-created pools are deliberately not
// here: nothing is on chain for them to quote against.
function listDeployedLocally(): VaultInfo[] {
  return listLocalPools("deploy").map((p) => ({
    address: p.address,
    tokens: p.tokens,
    label: p.label,
    feeBps: p.feeBps,
    amp: p.amp,
  }));
}

// Today's world: one pool, its token order read live from the contract rather
// than assumed from config (config's order is display metadata, not truth).
async function readSingleVault(): Promise<VaultInfo[]> {
  const sdk = await import("@spreadless-dex/sdk");
  const pool = new sdk.Client({
    contractId: POOL_CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  // A is readable, the fee is not (no getter), so the builder's twin check
  // can only ever call this vault a partial match.
  const [tokens, amp] = await Promise.all([
    pool.get_tokens().then((t) => t.result),
    pool.get_amp().then((t) => t.result),
  ]);
  return [{ address: POOL_CONTRACT_ID, tokens, label: "Stableswap Pool", amp }];
}

// The Router's registry: `next_pool_id()` is the count, `pool_at(id)` the
// address at each. There is no batch getter and no paging, so this is one call
// per pool and then one pool read per pool; the cache above (60s in memory, the last
// list in localStorage) is what keeps that off the hot path. Fine at today's size, and the place to add batching if
// the registry ever grows into the hundreds.
//
// The live pool from config is always included. It predates the Router, is in
// no registry, and dropping it would take the only pool with real liquidity out
// of the swap graph.
//
// One pool failing to answer must not empty the list, so each read is settled
// on its own and a failure drops that entry.
async function readFactoryVaults(factoryId: string): Promise<VaultInfo[]> {
  // The config pool does not depend on the registry, so it is read alongside
  // it rather than after it: one round trip less on every uncached list.
  const [single, registered] = await Promise.all([readSingleVault(), readRegisteredVaults(factoryId)]);
  return [...single, ...registered];
}

async function readRegisteredVaults(factoryId: string): Promise<VaultInfo[]> {
  const [sdk, client] = await Promise.all([import("@spreadless-dex/sdk"), routerClient()]);
  const ids = await listPoolIds(client);

  const registered = await Promise.all(
    ids.map(async (id): Promise<VaultInfo | null> => {
      try {
        const address = (await client.pool_at({ id })).result;
        if (!address) return null;
        const pool = new sdk.Client({ contractId: address, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE });
        // Fee and owner are labels, not identity: a pool that cannot answer
        // them still belongs in the list, just without those labels.
        const [tokens, amp, fee, owner] = await Promise.all([
          pool.get_tokens().then((t) => t.result),
          pool.get_amp().then((t) => t.result),
          pool.get_swap_fee().then((t) => t.result).catch(() => undefined),
          pool.get_owner().then((t) => t.result).catch(() => undefined),
        ]);
        return {
          address,
          tokens,
          label: poolLabel(tokens),
          amp,
          feeBps: fee === undefined ? undefined : percentToBps(feeScaleToPercent(BigInt(fee))),
          owner: owner ?? undefined,
          poolId: id,
        };
      } catch (err) {
        console.error(`Registry: pool ${id} of ${shortAddress(factoryId)} could not be read:`, err);
        return null;
      }
    }),
  );

  return registered.filter((v): v is VaultInfo => v !== null);
}

/** "USDC / USDT0", from whatever symbols are known. */
function poolLabel(tokens: string[]): string {
  return tokens.map(tokenSymbol).join(" / ");
}

// ── Tradable tokens ───────────────────────────────────────────────────────

/**
 * A token the swap form can offer. Deliberately thinner than PoolToken: a
 * reserve or a share of TVL is a fact about one pool, and this list spans all
 * of them, so there is no honest value to put there.
 */
export interface SwapToken {
  address: string;
  symbol: string;
  decimals: number;
}

/**
 * Every token that sits in at least one known vault.
 *
 * This is what the swap form's picker asks, and it replaces asking the single
 * configured pool: a pool created through the builder is in the routing graph
 * from the moment the registry reports it, and its assets have to be pickable
 * or the route that exists can never be requested.
 *
 * Presence here means "some pool holds this", not "a trade will fill". A pool
 * nobody has seeded yet contributes its tokens and quotes nothing, which the
 * route search reports per leg. Hiding them instead would be a worse lie: the
 * pair is real, it just has no liquidity.
 */
export async function listSwapTokens(): Promise<SwapToken[]> {
  const seen = new Map<string, SwapToken>();
  for (const vault of await listVaults()) {
    for (const address of vault.tokens) {
      if (seen.has(address)) continue;
      seen.set(address, { address, symbol: tokenSymbol(address), decimals: tokenDecimals(address) });
    }
  }
  // Configured tokens first, in catalog order, then anything the catalog has
  // no name for. A token shown as "CABC…XYZ" is one this build cannot name,
  // and it belongs at the bottom rather than sorted in among real symbols.
  const known = TOKENS.map((t) => t.contractId).filter((a) => seen.has(a));
  const rest = [...seen.keys()].filter((a) => !known.includes(a)).sort();
  return [...known, ...rest].map((a) => seen.get(a)!);
}
