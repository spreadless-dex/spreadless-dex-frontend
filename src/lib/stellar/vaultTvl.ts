// TVL per vault address, read on demand.
//
// Two pools may now hold the same assets with the same curve and fee (the
// Factory allows it, so the builder does too). What separates them is depth:
// TVL decides which pool quotes better and which one a depositor should join.
// Every screen that lists more than one pool therefore needs a TVL it can show
// for an arbitrary address, not just for the configured single pool.

import { useEffect, useState } from "react";
import { readPoolTvl } from "./pool";
import { isDemoVault } from "./demo";
import { listLocalPools } from "./localPools";

/** null = not readable (demo pool, or the read failed). */
export type TvlMap = Record<string, number | null>;

// Promises, not numbers: a read already in flight is joined rather than
// repeated, which is what lets the page start one before the list mounts.
const cache = new Map<string, Promise<number | null>>();

/** Demo pools have no chain state; calling out for them would only fail. */
export function isDemoAddress(address: string): boolean {
  if (isDemoVault(address)) return true;
  return listLocalPools("demo").some((p) => p.address === address);
}

export function readVaultTvl(address: string): Promise<number | null> {
  let tvl = cache.get(address);
  if (!tvl) {
    tvl = isDemoAddress(address) ? Promise.resolve(null) : readPoolTvl(address).catch(() => null);
    cache.set(address, tvl);
  }
  return tvl;
}

/** Forget cached figures, after a deposit or a deploy. */
export function invalidateVaultTvl(address?: string): void {
  if (address) cache.delete(address);
  else cache.clear();
}

/**
 * TVL for a set of addresses. Reads once per address and keeps the result,
 * so re-rendering a list (or stepping back and forth in the builder) costs
 * nothing.
 */
export function useVaultTvl(addresses: string[]): TvlMap {
  const key = addresses.join(",");
  const [tvl, setTvl] = useState<TvlMap>({});

  useEffect(() => {
    let live = true;
    const list = key ? key.split(",") : [];
    Promise.all(list.map(async (a) => [a, await readVaultTvl(a)] as const)).then((pairs) => {
      if (live) setTvl(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, [key]);

  return tvl;
}
