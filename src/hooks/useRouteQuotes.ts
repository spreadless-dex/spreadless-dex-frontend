import { useCallback, useEffect, useRef, useState } from "react";
import {
  RouteHopError,
  bestRoute,
  discoverRoutes,
  quoteRoute,
  type RouteCandidate,
  type RouteResult,
} from "../lib/stellar/router";

/**
 * Debounce before a search starts. Higher than the old single-pool quote's
 * 400 ms on purpose: a search costs one simulation *per leg per candidate*, so
 * a keystroke that used to be one RPC round trip can now be five.
 */
const DEBOUNCE_MS = 450;
/** How long a displayed route may sit before it is refreshed. */
const REFRESH_MS = 20_000;

export type SearchPhase = "idle" | "discovering" | "quoting" | "settled" | "error";

export interface RouteSearch {
  results: RouteResult[];
  best: Extract<RouteResult, { state: "ok" }> | null;
  phase: SearchPhase;
  error: string | null;
  /** Re-run the search immediately, bypassing the debounce. */
  refresh: () => void;
}

interface Args {
  walletAddress: string | null | undefined;
  tokenIn: string | null | undefined;
  tokenOut: string | null | undefined;
  amountIn: bigint;
  /** Freeze the search and drop its results. */
  paused?: boolean;
  /**
   * Freeze the search but keep what is on screen. Used from the moment the
   * user commits to a route until they touch the form again: the graph keeps
   * showing the route that is executing (or the one that just rolled back)
   * instead of re-searching underneath it.
   */
  hold?: boolean;
}

const EMPTY: RouteResult[] = [];

/**
 * Finds every route between two tokens and quotes them all in parallel,
 * publishing each result the moment its simulation resolves.
 *
 * That streaming is the point. A route that quotes in 300 ms should not wait
 * behind one that takes 900 ms, and the UI draws the difference: edges appear
 * when the search finds them, outputs appear when the chain answers.
 */
export function useRouteQuotes({
  walletAddress,
  tokenIn,
  tokenOut,
  amountIn,
  paused = false,
  hold = false,
}: Args): RouteSearch {
  const [results, setResults] = useState<RouteResult[]>(EMPTY);
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  // Bumped on every new search; a stale run compares its id and drops its own
  // results rather than racing a newer one into the UI.
  const runId = useRef(0);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const ready = Boolean(walletAddress && tokenIn && tokenOut) && amountIn > 0n;

  useEffect(() => {
    // The previous run's cleanup already cancelled any in-flight search; the
    // results it left in state are exactly what should stay visible.
    if (hold) return;
    if (!ready || paused) {
      runId.current++;
      setResults(EMPTY);
      setPhase("idle");
      setError(null);
      return;
    }

    const id = ++runId.current;
    const live = () => runId.current === id;

    setPhase("discovering");
    setError(null);

    const timer = setTimeout(async () => {
      let candidates: RouteCandidate[];
      try {
        candidates = await discoverRoutes(tokenIn!, tokenOut!);
      } catch (err) {
        if (!live()) return;
        console.error("Route discovery failed:", err);
        setResults(EMPTY);
        setPhase("error");
        setError(err instanceof Error ? err.message : "Could not read the vault registry");
        return;
      }
      if (!live()) return;

      if (candidates.length === 0) {
        setResults(EMPTY);
        setPhase("settled");
        setError("No route between these tokens");
        return;
      }

      // Publish the candidates as pending first: the graph can draw its edges
      // now, before a single simulation has come back.
      setResults(candidates.map((candidate) => ({ candidate, state: "pending" as const })));
      setPhase("quoting");

      // Each candidate writes its own slot as it settles, so one slow route never
      // holds up the others.
      const settle = (next: RouteResult) => {
        if (!live()) return;
        setResults((prev) =>
          prev.map((r) => (r.candidate.id === next.candidate.id ? next : r)),
        );
      };

      await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const quote = await quoteRoute(candidate, amountIn, walletAddress!);
            settle({ candidate, state: "ok", quote });
          } catch (err) {
            const hop = err instanceof RouteHopError ? err.hopIndex : 0;
            settle({
              candidate,
              state: "failed",
              failedHop: hop,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      );

      if (live()) setPhase("settled");
    }, DEBOUNCE_MS);

    return () => {
      runId.current++;
      clearTimeout(timer);
    };
  }, [ready, paused, hold, walletAddress, tokenIn, tokenOut, amountIn, nonce]);

  // Silent refresh. Only the winner is re-quoted: it is the one whose output
  // becomes the on-chain min_out, and re-running the whole field every 20 s
  // would multiply the RPC cost for numbers nobody is about to sign.
  const best = bestRoute(results);
  const bestId = best?.candidate.id ?? null;

  useEffect(() => {
    if (!bestId || paused || hold || !ready) return;
    const id = runId.current;
    const timer = setInterval(async () => {
      const current = best?.candidate;
      if (!current) return;
      try {
        const quote = await quoteRoute(current, amountIn, walletAddress!);
        if (runId.current !== id) return;
        setResults((prev) =>
          prev.map((r) => (r.candidate.id === current.id ? { candidate: current, state: "ok", quote } : r)),
        );
      } catch (err) {
        console.error("Route refresh failed:", err);
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [bestId, paused, hold, ready, amountIn, walletAddress]);

  return { results, best, phase, error, refresh };
}
