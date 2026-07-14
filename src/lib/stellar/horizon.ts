// The classic side of the ledger.
//
// One of the four pool tokens (SUSD) is a Stellar Asset Contract: a Soroban
// wrapper around a *classic* asset. For a G-address, that token's balance and
// its trustline are one and the same classic ledger entry — so both live here,
// on Horizon, not on the Soroban RPC.
//
// Keep this module free of wallet/store imports: token.ts reads balances
// through it, and trustline.ts (which does need the signer) builds on top.

import { HORIZON_URL, TOKENS, type ClassicAsset } from "./config";

/**
 * The classic asset behind a token contract, or null if the token is a native
 * Soroban token — no classic side, no trustline, nothing to look up here.
 */
export function classicAssetOf(contractId: string): ClassicAsset | null {
  return TOKENS.find((t) => t.contractId === contractId)?.classicAsset ?? null;
}

interface HorizonBalance {
  balance: string;
  asset_code?: string;
  asset_issuer?: string;
}

export interface HorizonAccount {
  sequence: string;
  balances: HorizonBalance[];
}

/** null when the account doesn't exist on the classic ledger yet (never funded). */
export async function fetchAccount(address: string): Promise<HorizonAccount | null> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon returned ${res.status} for ${address}`);
  return res.json();
}

function lineFor(account: HorizonAccount, asset: ClassicAsset): HorizonBalance | undefined {
  return account.balances.find(
    (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  );
}

/**
 * Whether `address` can receive this token today. Always true for native Soroban
 * tokens, which have no trustline to be missing.
 */
export async function hasTrustline(contractId: string, address: string): Promise<boolean> {
  const asset = classicAssetOf(contractId);
  if (!asset) return true;

  const account = await fetchAccount(address);
  if (!account) return false;
  return Boolean(lineFor(account, asset));
}

/**
 * Balance of a SAC-wrapped token, in raw units.
 *
 * Read classically on purpose: the SDK's generic token client needs the
 * contract's spec, which it loads from the contract's WASM — and a SAC has no
 * WASM, it's a built-in. Simulating balance() against one therefore blows up
 * while encoding the request, which is why SUSD's balance rendered as "—".
 * The trustline holds the same number anyway, so read it from there.
 *
 * No trustline means the account cannot hold the asset at all: that's 0, not an
 * error — the UI asks for the trustline separately (see TrustlineGate).
 */
export async function getClassicBalance(
  asset: ClassicAsset,
  address: string,
  decimals: number,
): Promise<bigint> {
  const account = await fetchAccount(address);
  const line = account ? lineFor(account, asset) : undefined;
  if (!line) return 0n;

  // Horizon reports classic balances as a decimal string with 7 places, which
  // is also every pool token's decimals — but don't lean on that: shift by the
  // token's own scale.
  const [whole, frac = ""] = line.balance.split(".");
  return BigInt(whole + frac.padEnd(decimals, "0").slice(0, decimals));
}
