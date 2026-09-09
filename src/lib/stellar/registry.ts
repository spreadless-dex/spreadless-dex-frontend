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

export interface VaultInfo {
  /** Pool contract address: the id every swap simulation is sent to. */
  address: string;
  /** Token contract addresses in the vault's canonical order. */
  tokens: string[];
  /** Human label for the graph. Falls back to a truncated address. */
  label: string;
  /**
   * Swap fee in basis points, when the source knows it. The current pool
   * contract exposes no fee getter (only set_swap_fee), so this is undefined
   * for the config-backed vault rather than guessed. The UI omits the fee
   * label instead of showing a number nobody verified.
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
const CACHE_TTL_MS = 60_000;
let cache: { at: number; vaults: VaultInfo[] } | null = null;

/** Drop the cached vault set. Call after a deploy or on an explicit refresh. */
export function invalidateVaults(): void {
  cache = null;
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
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.vaults;
  const vaults = FACTORY_CONTRACT_ID
    ? await readFactoryVaults(FACTORY_CONTRACT_ID)
    : await readSingleVault();
  cache = { at: Date.now(), vaults };
  return vaults;
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
// per pool and then one pool read per pool; the 60s cache above is what keeps
// that off the hot path. Fine at today's size, and the place to add batching if
// the registry ever grows into the hundreds.
//
// The live pool from config is always included. It predates the Router, is in
// no registry, and dropping it would take the only pool with real liquidity out
// of the swap graph.
//
// One pool failing to answer must not empty the list, so each read is settled
// on its own and a failure drops that entry.
async function readFactoryVaults(factoryId: string): Promise<VaultInfo[]> {
  const [sdk, client] = await Promise.all([import("@spreadless-dex/sdk"), routerClient()]);
  const ids = await listPoolIds(client);

  const registered = await Promise.all(
    ids.map(async (id): Promise<VaultInfo | null> => {
      try {
        const address = (await client.pool_at({ id })).result;
        if (!address) return null;
        const pool = new sdk.Client({ contractId: address, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE });
        const [tokens, amp] = await Promise.all([
          pool.get_tokens().then((t) => t.result),
          pool.get_amp().then((t) => t.result),
        ]);
        return { address, tokens, label: poolLabel(tokens), amp, poolId: id };
      } catch (err) {
        console.error(`Registry: pool ${id} of ${shortAddress(factoryId)} could not be read:`, err);
        return null;
      }
    }),
  );

  return [...(await readSingleVault()), ...registered.filter((v): v is VaultInfo => v !== null)];
}

/** "USDC / USDT0", from whatever symbols are known. */
function poolLabel(tokens: string[]): string {
  return tokens.map(tokenSymbol).join(" / ");
}
