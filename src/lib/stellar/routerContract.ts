// The atomic Router: one transaction, N hops, all or nothing.
//
// The pathfinder (router.ts) decides *which* hops; this module turns them into
// a single `swap_exact_in` call on the Router, simulates it, signs through the
// wallet and submits. The contract itself lives in routerClient.ts.
//
// The call, as deployed:
//
//   swap_exact_in(to, token_in, path: Vec<SwapHop{pool_id, token_out}>,
//                 amount_in, min_out) -> i128
//
// Three things follow from that shape, and each of them used to be assumed
// otherwise here:
//
//   • a leg is named by REGISTRY ID, not by pool address. Only pools the Router
//     created have one, so the config pool and anything deployed directly can
//     be a single hop but never a leg of a route. canExecuteRoute() enforces it
//     rather than letting the user sign a call that cannot resolve.
//   • there is no recipient argument. `to` signs, pays the input and receives
//     the output, all one address.
//   • there is no deadline argument. See ROUTE_DEADLINE_SECS.
//
// ROUTER_CONTRACT_ID is what turns this path on. While it is null a multi-hop
// route can only execute in the routing demo (see demo.ts), where these phases
// are staged locally and nothing is signed.

import { getWalletSigner } from "../../store/useAppStore";
import { ROUTER_CONTRACT_ID } from "./config";
import { DEMO_STEP_MS, DEMO_TX_HASH, isDemoVault, useRoutingDemo } from "./demo";
import { unwrapResult } from "./pool";
import { routerClient, type SwapHop } from "./routerClient";
import type { RouteCandidate } from "./router";
import type { OnPhase, TxResult } from "./types";

/**
 * How long a signed route stays valid, as the transaction's own time bound.
 *
 * Short on purpose: a route was chosen against reserves that existed at quote
 * time, and this is what stops a transaction that sat unsigned in a wallet from
 * settling against a different market. It is only the transaction's horizon,
 * not the contract's: `swap_exact_in` takes no deadline, so what protects the
 * user *inside* the call is `min_out` on the final output and nothing else.
 */
export const ROUTE_DEADLINE_SECS = 180;

export interface ExecuteRouteArgs {
  /**
   * The connected wallet. It pays the input, signs, is the transaction source
   * and receives the output: the contract takes one address for all of it, so
   * a route cannot be sent to a third party.
   */
  user: string;
  candidate: RouteCandidate;
  amountIn: bigint;
  /**
   * Route-level floor on the *final* output, in raw units. Derived from the
   * quote the user saw minus their tolerance, never from a fresh simulation:
   * intermediate amounts are deliberately unprotected (the Router holds them
   * for the duration of one transaction), only the end of the route is.
   */
  minOut: bigint;
  onPhase?: OnPhase;
}

export class RouteExecutionError extends Error {
  constructor(
    message: string,
    /** 1-based index of the hop the failure names, when anything names one. */
    readonly failedHop: number | null,
  ) {
    super(message);
    this.name = "RouteExecutionError";
  }
}

/**
 * Why this route cannot be signed, or null when it can. Two different reasons
 * now, and they are not interchangeable: "routerMissing" is a deployment that
 * will change, "unregisteredPool" is a fact about this particular route and
 * will not, so the UI says so instead of promising a Router that is already
 * there.
 */
export type RouteBlocker = "routerMissing" | "unregisteredPool";

export function routeBlocker(candidate: RouteCandidate): RouteBlocker | null {
  // A single hop goes straight to its pool and never touches the Router.
  if (candidate.hops.length <= 1) return null;
  if (isDemoRoute(candidate)) return useRoutingDemo.getState().enabled ? null : "routerMissing";
  if (!ROUTER_CONTRACT_ID) return "routerMissing";
  // Every leg has to be one the Router can name, or the call cannot be built.
  return candidate.hops.every((h) => h.poolId !== undefined) ? null : "unregisteredPool";
}

/** True when this route can be signed right now, in any mode. */
export function canExecuteRoute(candidate: RouteCandidate): boolean {
  return routeBlocker(candidate) === null;
}

/** Whether this route runs through the local demo instead of the chain. */
export function isDemoRoute(candidate: RouteCandidate): boolean {
  return candidate.hops.some((h) => isDemoVault(h.vault));
}

export async function executeRoute(args: ExecuteRouteArgs): Promise<TxResult<bigint>> {
  if (isDemoRoute(args.candidate)) return executeDemoRoute(args);
  if (!ROUTER_CONTRACT_ID) {
    throw new RouteExecutionError(
      "The multi-hop Router is not deployed on this network yet.",
      null,
    );
  }
  return executeOnChain(args);
}

// ── On-chain path ────────────────────────────────────────────────────────

// The path the contract wants. Refusing here, before a wallet is asked for
// anything, is the whole point: an unregistered pool is not a transient
// failure, and the user should be told which leg is unreachable rather than
// watch a simulation come back with PoolNotRegistered.
function routePath(candidate: RouteCandidate): SwapHop[] {
  return candidate.hops.map((hop, i) => {
    if (hop.poolId === undefined) {
      throw new RouteExecutionError(
        `Leg ${i + 1} goes through ${hop.vaultLabel}, which the Router does not know. ` +
          "Only pools it created can be part of a multi-hop route.",
        i + 1,
      );
    }
    return { pool_id: hop.poolId, token_out: hop.tokenOut };
  });
}

async function executeOnChain({
  user,
  candidate,
  amountIn,
  minOut,
  onPhase,
}: ExecuteRouteArgs): Promise<TxResult<bigint>> {
  onPhase?.("preparing");
  const path = routePath(candidate);

  const signer = await getWalletSigner();
  // Signer wrapped exactly as pool.ts wraps it, so the swap widget's phase
  // labels line up with the wallet popping up.
  const router = await routerClient(user, {
    signAuthEntry: signer.signAuthEntry,
    signTransaction: async (...a: Parameters<typeof signer.signTransaction>) => {
      onPhase?.("signing");
      const res = await signer.signTransaction(...a);
      onPhase?.("submitting");
      return res;
    },
  });

  try {
    // Building the AssembledTransaction is what simulates it, and the
    // simulation is what yields the footprint and the authorization tree: the
    // user's transfer of the input token sits *under* the Router call, not
    // beside it. Because the user is also the transaction source, those
    // entries carry source-account credentials and the transaction signature
    // covers them, so there is no separate auth entry to sign.
    const tx = await router.swap_exact_in(
      {
        to: user,
        token_in: candidate.hops[0].tokenIn,
        path,
        amount_in: amountIn,
        min_out: minOut,
      },
      { timeoutInSeconds: ROUTE_DEADLINE_SECS },
    );
    // A failed simulation comes back as a Rust-style Err on the assembled
    // transaction rather than throwing, so it has to be looked at: without
    // this the wallet would pop up for a call already known to revert.
    if (tx.simulation && "error" in tx.simulation && tx.simulation.error) {
      throw new Error(String(tx.simulation.error));
    }
    const sent = await tx.signAndSend();
    return { result: unwrapResult(sent.result), hash: sent.sendTransactionResponse?.hash ?? "" };
  } catch (err) {
    if (err instanceof RouteExecutionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new RouteExecutionError(message, hopFromError(message));
  }
}

// Neither the Router nor the pool names the leg that failed: a revert comes
// back as a bare contract code (#3 PoolNotRegistered and #5 EmptySwapPath are
// the Router's own, a slippage or pause error belongs to whichever pool threw
// it) and there is no index in it. So this recognises the one spelling that
// does carry a hop number, which today is the demo's, and otherwise says it
// does not know instead of guessing an edge for the graph to blame.
function hopFromError(raw: string): number | null {
  const m = /hop\s*#?(\d+)/i.exec(raw);
  return m ? Number(m[1]) : null;
}

// ── Demo path ────────────────────────────────────────────────────────────
//
// Walks the same phases with the same timing feel and either "settles" with
// the quoted output or reverts at the leg the demo switch names. No wallet
// prompt: there is nothing real to sign.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function executeDemoRoute({
  user,
  candidate,
  amountIn,
  minOut,
  onPhase,
}: ExecuteRouteArgs): Promise<TxResult<bigint>> {
  const { quoteRoute } = await import("./router");
  onPhase?.("preparing");
  await wait(DEMO_STEP_MS.preparing);
  onPhase?.("signing");
  await wait(DEMO_STEP_MS.signing);
  onPhase?.("submitting");
  await wait(DEMO_STEP_MS.submitting);

  const failHop = useRoutingDemo.getState().failHop;
  if (failHop !== null && failHop >= 1 && failHop <= candidate.hops.length) {
    // Consume the switch so the next attempt goes through, which is the
    // natural "try again" story after a revert.
    useRoutingDemo.getState().setFailHop(null);
    throw new RouteExecutionError(
      `Route reverted at hop #${failHop}: HostError: Error(Contract, #14) SlippageExceeded`,
      failHop,
    );
  }

  // A demo route may still have a live leg (Vault A into the real pool), so
  // the re-quote runs against the real wallet, exactly like the search did.
  const { amountOut } = await quoteRoute(candidate, amountIn, user);
  if (amountOut < minOut) {
    throw new RouteExecutionError(
      `Route reverted: final output below minimum: Error(Contract, #14) SlippageExceeded`,
      candidate.hops.length,
    );
  }
  return { result: amountOut, hash: DEMO_TX_HASH };
}
