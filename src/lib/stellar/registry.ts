// The seam between "one hard-coded pool" and "whatever the Factory has
// deployed". Everything downstream (the router, the hook, the graph) asks
// this module for the set of vaults and never learns where the list came from.
//
// TRANCHE 2: FACTORY_CONTRACT_ID is still null, so listVaults() reports the
// single pool from config. When the Factory lands, only readFactoryVaults()
// below needs a body; no caller changes.

import { FACTORY_CONTRACT_ID, POOL_CONTRACT_ID, RPC_URL, NETWORK_PASSPHRASE, TOKENS } from "./config";
import { DEMO_VAULTS, isRoutingDemo } from "./demo";
import { listLocalPools } from "./localPools";

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
  const tokens = (await pool.get_tokens()).result;
  return [{ address: POOL_CONTRACT_ID, tokens, label: "Stableswap Pool" }];
}

// TRANCHE 2 / D1: read the Factory's paginated registry (address, tokens,
// version and active status per entry) and drop inactive vaults. Left
// unimplemented on purpose: guessing the Factory's method names now would ship
// a call that silently fails against the real contract later.
async function readFactoryVaults(factoryId: string): Promise<VaultInfo[]> {
  throw new Error(
    `Factory registry not wired yet (factory ${shortAddress(factoryId)}). ` +
      `Implement readFactoryVaults() in src/lib/stellar/registry.ts.`,
  );
}
