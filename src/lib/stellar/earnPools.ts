// Earn's view of the protocol: every pool on chain, each with its live state
// and, when a wallet is connected, that wallet's LP shares in it.
//
// Earn used to read the configured pool from the app store and nothing else,
// so a deposit into a Router pool never showed up in the portfolio. The pool
// set now comes from listVaults(), the same source as the register and the
// swap graph: the configured pool, the Router's registry and this browser's
// direct deploys. Demo pools are left out, since nothing on chain can be
// deposited into or read back from them.

import { useCallback, useEffect, useRef, useState } from "react";
import { POOL_CONTRACT_ID } from "./config";
import { getLpBalance, readPoolState, type PoolState } from "./pool";
import { listVaults, onVaultsChanged, type VaultInfo } from "./registry";
import { invalidateVaultTvl, isDemoAddress } from "./vaultTvl";
import { listLocalPools } from "./localPools";
import { refetchUntilChanged } from "./refetch";

export interface EarnPool {
  address: string;
  label: string;
  /**
   * The configured pool: the one the preview APY, the editorial copy and the
   * per-asset pages (/pools/[token]) describe. Every other pool has only its
   * own page (/pools/v/[address]) and no APY yet.
   */
  isConfigPool: boolean;
  href: string;
  feeBps?: number;
  amp?: number;
  /** Known from the registry before the pool's own state is in. */
  tokenCount: number;
  /** null while the first read is out, or after it failed (see `failed`). */
  state: PoolState | null;
  failed: boolean;
  /** The connected wallet's LP shares. null without a wallet, before the read, or if it failed. */
  lp: bigint | null;
  /** A wallet is connected and its LP read for this pool has not come back yet. */
  lpPending: boolean;
}

/** The wallet's fraction of the pool's LP supply, 0 to 1. */
export function positionShare(pool: EarnPool): number {
  const s = pool.state;
  if (!s || !pool.lp || s.lpSupply === 0n) return 0;
  return Number((pool.lp * 1_000_000_000n) / s.lpSupply) / 1e9;
}

/** What that share of the reserves is worth, stablecoins at ≈ $1 like every TVL here. */
export function positionValue(pool: EarnPool): number {
  return pool.state ? positionShare(pool) * pool.state.totalTvl : 0;
}

// Shared across mounts, so switching tabs or coming back to the page does not
// read every pool again. A read in flight is joined; a failed one is dropped
// so the next ask tries again.
const stateCache = new Map<string, Promise<PoolState>>();

function readStateCached(address: string): Promise<PoolState> {
  const cached = stateCache.get(address);
  if (cached) return cached;
  const read = readPoolState(address);
  stateCache.set(address, read);
  read.catch(() => {
    if (stateCache.get(address) === read) stateCache.delete(address);
  });
  return read;
}

export function useEarnPools(walletAddress: string | null) {
  const [vaults, setVaults] = useState<VaultInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [states, setStates] = useState<Record<string, PoolState | "failed">>({});
  const [lps, setLps] = useState<Record<string, bigint | "failed">>({});

  // The stored list answers first; a fresher one landing re-renders.
  useEffect(() => onVaultsChanged(() => setListRevision((n) => n + 1)), []);

  useEffect(() => {
    let live = true;
    listVaults()
      .then((all) => {
        if (!live) return;
        setVaults(all.filter((v) => !isDemoAddress(v.address)));
        setError(null);
      })
      .catch((err) => {
        console.error("Earn: pool list failed:", err);
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [listRevision]);

  const key = vaults?.map((v) => v.address).join(",") ?? "";

  // One read per pool, each landing on its own: a slow pool must not hold
  // back the ones that already answered.
  useEffect(() => {
    if (!key) return;
    let live = true;
    for (const address of key.split(",")) {
      readStateCached(address)
        .then((state) => {
          if (live) setStates((prev) => ({ ...prev, [address]: state }));
        })
        .catch((err) => {
          console.error(`Earn: pool ${address} could not be read:`, err);
          if (live) setStates((prev) => ({ ...prev, [address]: "failed" }));
        });
    }
    return () => {
      live = false;
    };
  }, [key]);

  // Not cached: a balance is the wallet's, and it is what the portfolio is for.
  useEffect(() => {
    setLps({});
    if (!key || !walletAddress) return;
    let live = true;
    for (const address of key.split(",")) {
      getLpBalance(walletAddress, address)
        .then((lp) => {
          if (live) setLps((prev) => ({ ...prev, [address]: lp }));
        })
        .catch(() => {
          if (live) setLps((prev) => ({ ...prev, [address]: "failed" }));
        });
    }
    return () => {
      live = false;
    };
  }, [key, walletAddress]);

  const statesRef = useRef(states);
  statesRef.current = states;
  const lpsRef = useRef(lps);
  lpsRef.current = lps;

  /**
   * Re-read one pool after a transaction landed in it. The RPC can serve the
   * pre-transaction snapshot for a moment, so poll until the reserves or the
   * LP supply move, and keep what is on screen until they do.
   */
  const refresh = useCallback(
    async (address: string) => {
      invalidateVaultTvl(address);
      const before = statesRef.current[address];
      const prev = before && before !== "failed" ? before : null;
      const moved = (next: PoolState) =>
        !prev ||
        next.lpSupply !== prev.lpSupply ||
        next.tokens.some((t, i) => t.reserve !== prev.tokens[i]?.reserve);

      const pollState = (async () => {
        for (let i = 0; i < 6; i++) {
          try {
            const next = await readPoolState(address);
            if (moved(next) || i === 5) {
              stateCache.set(address, Promise.resolve(next));
              setStates((p) => ({ ...p, [address]: next }));
              return;
            }
          } catch {
            // keep what is on screen
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      })();

      const knownLp = lpsRef.current[address];
      const pollLp = walletAddress
        ? refetchUntilChanged(
            () => getLpBalance(walletAddress, address),
            typeof knownLp === "bigint" ? knownLp : null,
          )
            .then((lp) => setLps((p) => ({ ...p, [address]: lp })))
            .catch(() => {})
        : Promise.resolve();

      await Promise.all([pollState, pollLp]);
    },
    [walletAddress],
  );

  /** Try a pool whose read failed again. */
  const retry = useCallback((address: string) => {
    stateCache.delete(address);
    setStates((p) => {
      const { [address]: _dropped, ...rest } = p;
      return rest;
    });
    readStateCached(address)
      .then((state) => setStates((p) => ({ ...p, [address]: state })))
      .catch(() => setStates((p) => ({ ...p, [address]: "failed" })));
  }, []);

  /** Ask for the pool list again, after it failed. */
  const reload = useCallback(() => {
    setError(null);
    setListRevision((n) => n + 1);
  }, []);

  const local = listLocalPools();
  const pools: EarnPool[] = (vaults ?? []).map((v) => {
    const s = states[v.address];
    const lp = lps[v.address];
    const isConfigPool = v.address === POOL_CONTRACT_ID;
    return {
      address: v.address,
      label: isConfigPool
        ? "StableSwap Pool"
        : (local.find((p) => p.address === v.address)?.label ?? v.label),
      isConfigPool,
      href: isConfigPool ? "/pools/stableswap" : `/pools/v/${v.address}`,
      feeBps: v.feeBps,
      amp: v.amp,
      tokenCount: v.tokens.length,
      state: s && s !== "failed" ? s : null,
      failed: s === "failed",
      lp: typeof lp === "bigint" ? lp : null,
      lpPending: walletAddress !== null && lp === undefined,
    };
  });
  // Deepest first, as in the register at /pools. Pools still loading go last.
  pools.sort((a, b) => (b.state?.totalTvl ?? -1) - (a.state?.totalTvl ?? -1));

  return {
    pools,
    loading: vaults === null && error === null,
    error,
    refresh,
    retry,
    reload,
  };
}
