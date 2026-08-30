// Off-chain pathfinder. Two halves, deliberately separate:
//
//   findRoutes()  : pure graph work over the registry. No RPC, no wallet,
//                   synchronous, trivially testable.
//   quoteRoute()  : one simulation per hop, against the vault that holds that
//                   pair. This is the expensive half.
//
// Keeping them apart is what lets the UI draw the candidate edges the moment
// the paths are known and fill in each output as its simulation lands.

import { demoVault, simulateDemoSwap } from "./demo";
import { quoteSwapExactIn } from "./pool";
import { listVaults, shortAddress, tokenSymbol, type VaultInfo } from "./registry";

/** Hard ceiling on route length. Each extra hop is another fee and another RPC. */
export const MAX_HOPS = 3;
/** Never simulate more than this many candidates, best-first by hop count. */
export const MAX_CANDIDATES = 6;

export interface RouteHop {
  /** Vault contract address this leg swaps against. */
  vault: string;
  vaultLabel: string;
  feeBps?: number;
  /** Token contract addresses, not symbols. Symbols are display-only. */
  tokenIn: string;
  tokenOut: string;
}

export interface RouteCandidate {
  /** Stable identity: same path ⇒ same id, so React keys survive a re-quote. */
  id: string;
  hops: RouteHop[];
  /** Token contract addresses along the route, length hops.length + 1. */
  path: string[];
}

export interface RouteQuote {
  /** Final output in raw units of the route's last token. */
  amountOut: bigint;
  /** Output of each leg in raw units. Display only, never a user guarantee. */
  perHop: bigint[];
  /** Summed simulated resource fee across legs, XLM. Null if unknown. */
  networkFeeXlm: number | null;
}

export type RouteResult =
  | { candidate: RouteCandidate; state: "pending" }
  | { candidate: RouteCandidate; state: "ok"; quote: RouteQuote }
  | { candidate: RouteCandidate; state: "failed"; failedHop: number; error: string };

/** True when the route settled with a usable quote. */
export function isOk(
  r: RouteResult,
): r is Extract<RouteResult, { state: "ok" }> {
  return r.state === "ok";
}

/** Human path for labels: "USDx → sUSDC → PYUSD". */
export function routeLabel(c: RouteCandidate): string {
  return c.path.map(tokenSymbol).join(" → ");
}

// ── Path enumeration ──────────────────────────────────────────────────────
//
// Depth-first over the token graph with two rules that are not just pruning:
//
//   • a token may not repeat, because a path that revisits a token is a cycle and
//     can never beat the shorter path that skipped it;
//   • a vault may not repeat, because routing through the same pool twice moves its
//     reserves against you on the second leg, and it is exactly the
//     self-routing case the Router contract has to reject on-chain. It also
//     means each leg simulates against a pool no earlier leg has touched,
//     which is what makes sequential quoting below correct.

export function findRoutes(
  vaults: VaultInfo[],
  tokenIn: string,
  tokenOut: string,
  maxHops: number = MAX_HOPS,
): RouteCandidate[] {
  if (tokenIn === tokenOut) return [];

  const found: RouteCandidate[] = [];
  const hops: RouteHop[] = [];
  const seenTokens = new Set<string>([tokenIn]);
  const seenVaults = new Set<string>();

  const walk = (current: string) => {
    if (hops.length >= maxHops) return;
    for (const vault of vaults) {
      if (seenVaults.has(vault.address)) continue;
      if (!vault.tokens.includes(current)) continue;
      for (const next of vault.tokens) {
        if (next === current || seenTokens.has(next)) continue;
        const hop: RouteHop = {
          vault: vault.address,
          vaultLabel: vault.label || shortAddress(vault.address),
          feeBps: vault.feeBps,
          tokenIn: current,
          tokenOut: next,
        };
        hops.push(hop);
        if (next === tokenOut) {
          const path = [tokenIn, ...hops.map((h) => h.tokenOut)];
          found.push({
            id: hops.map((h) => `${h.vault}:${h.tokenOut}`).join("|"),
            hops: hops.slice(),
            path,
          });
        } else {
          seenTokens.add(next);
          seenVaults.add(vault.address);
          walk(next);
          seenVaults.delete(vault.address);
          seenTokens.delete(next);
        }
        hops.pop();
      }
    }
  };
  walk(tokenIn);

  // Shortest first: fewer hops means fewer fees and fewer RPC round trips, so
  // when the budget cuts the list it should keep the routes most likely to win.
  found.sort((a, b) => a.hops.length - b.hops.length || a.id.localeCompare(b.id));
  return found.slice(0, MAX_CANDIDATES);
}

/** Read the registry and enumerate every route between two tokens. */
export async function discoverRoutes(
  tokenIn: string,
  tokenOut: string,
  maxHops: number = MAX_HOPS,
): Promise<RouteCandidate[]> {
  return findRoutes(await listVaults(), tokenIn, tokenOut, maxHops);
}

// ── Quoting ───────────────────────────────────────────────────────────────

export class RouteHopError extends Error {
  constructor(
    readonly hopIndex: number,
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RouteHopError";
  }
}

/**
 * Simulate a route leg by leg, feeding each leg's output into the next.
 *
 * Sequential, not parallel: leg 2's input is leg 1's output, so there is
 * nothing to overlap. Legs hit distinct vaults (see findRoutes), so simulating
 * leg 2 against untouched reserves is accurate. The route never trades against
 * itself.
 *
 * A leg that reverts throws RouteHopError with the index, so the UI can mark
 * the exact edge that failed instead of dropping the whole route silently.
 */
export async function quoteRoute(
  candidate: RouteCandidate,
  amountIn: bigint,
  to: string,
): Promise<RouteQuote> {
  const perHop: bigint[] = [];
  let amount = amountIn;
  let feeXlm: number | null = null;

  for (let i = 0; i < candidate.hops.length; i++) {
    const hop = candidate.hops[i];
    try {
      const { amountOut, networkFeeXlm } = await quoteHop(hop, amount, to);
      if (amountOut <= 0n) throw new Error("Leg returned zero output");
      amount = amountOut;
      perHop.push(amountOut);
      if (networkFeeXlm !== null) feeXlm = (feeXlm ?? 0) + networkFeeXlm;
    } catch (err) {
      throw new RouteHopError(i, err);
    }
  }
  return { amountOut: amount, perHop, networkFeeXlm: feeXlm };
}

// One leg. A demo vault is priced locally with the same StableSwap math and a
// short artificial latency, so the graph still fills in leg by leg instead of
// all at once; a live vault goes to the RPC.
async function quoteHop(
  hop: RouteHop,
  amountIn: bigint,
  to: string,
): Promise<{ amountOut: bigint; networkFeeXlm: number | null }> {
  const demo = demoVault(hop.vault);
  if (!demo) {
    return quoteSwapExactIn({
      to,
      tokenIn: hop.tokenIn,
      tokenOut: hop.tokenOut,
      amountIn,
      poolId: hop.vault,
    });
  }
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 320));
  return { amountOut: simulateDemoSwap(demo, hop.tokenIn, hop.tokenOut, amountIn), networkFeeXlm: null };
}

/** The best settled route, or null while nothing has resolved. */
export function bestRoute(results: RouteResult[]): Extract<RouteResult, { state: "ok" }> | null {
  let best: Extract<RouteResult, { state: "ok" }> | null = null;
  for (const r of results) {
    if (!isOk(r)) continue;
    if (!best || r.quote.amountOut > best.quote.amountOut) best = r;
  }
  return best;
}

/** How far this route falls short of the best one, in basis points. */
export function shortfallBps(result: RouteResult, best: bigint): number | null {
  if (!isOk(result) || best <= 0n) return null;
  const diff = best - result.quote.amountOut;
  return Number((diff * 10_000n * 100n) / best) / 100;
}
