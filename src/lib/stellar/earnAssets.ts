// Earn's asset view: the pools from useEarnPools() turned inside out, one
// entry per token with every pool that holds it. A deposit starts from the
// asset the user has, so that is what Earn lists; the pool is a choice made
// inside the deposit sheet, preselected to the best one.
//
// "Best" is the highest known APY, then the deepest pool. Today only the
// configured pool has a (preview) APY, so every other pool ranks by depth;
// once live rates come in, the same ordering holds without a change here.

import type { PoolToken } from "./pool";
import { FAMILY_ORDER, type AssetFamily } from "./config";
import { knownTokenMeta } from "./poolParams";
import { getPoolPreviewStats } from "../mockPoolStats";
import type { EarnPool } from "./earnPools";
import { formatCurrency } from "../utils";

export interface EarnOffer {
  pool: EarnPool;
  /** The asset as this pool holds it. Its index differs from pool to pool. */
  token: PoolToken;
  /** Preview APY for the configured pool, null everywhere else for now. */
  apy: number | null;
  /** Depth of the whole pool, in the family's unit. */
  tvl: number;
  /** Why a deposit cannot go here, or null when it can. */
  closed: "paused" | "empty" | null;
  /** True when this offer is ranked by APY, false when by depth. */
  byApy: boolean;
  /** 0 to 1 against the best open offer, on whatever it is ranked by. */
  score: number;
}

export interface EarnAsset {
  address: string;
  symbol: string;
  decimals: number;
  family: AssetFamily | undefined;
  /** Every pool holding the asset: open ones ranked first, closed ones after. */
  offers: EarnOffer[];
  open: EarnOffer[];
  best: EarnOffer | null;
  /** Highest APY among the open offers, null when none has one. */
  apy: number | null;
  /** The asset's reserves summed over the open offers. */
  depth: number;
  /** The wallet holds LP shares in at least one of these pools. */
  mine: boolean;
}

export function offerApy(pool: EarnPool, token: PoolToken): number | null {
  return pool.isConfigPool ? getPoolPreviewStats(token.symbol).apy : null;
}

function closedReason(pool: EarnPool): EarnOffer["closed"] {
  const s = pool.state;
  if (!s) return null;
  // The contract takes nothing single-sided before a first deposit has
  // funded every asset (#12 FirstDepositNotFull).
  if (s.lpSupply === 0n) return "empty";
  if (s.paused) return "paused";
  return null;
}

function rank(offers: EarnOffer[]): EarnOffer[] {
  offers.sort(
    (a, b) =>
      Number(a.closed !== null) - Number(b.closed !== null) ||
      (b.apy ?? -1) - (a.apy ?? -1) ||
      b.tvl - a.tvl,
  );
  const open = offers.filter((o) => o.closed === null);
  const maxApy = Math.max(0, ...open.map((o) => o.apy ?? 0));
  const maxTvl = Math.max(0, ...open.map((o) => o.tvl));
  for (const o of offers) {
    o.byApy = o.apy !== null && maxApy > 0;
    o.score = o.closed ? 0 : o.byApy ? (o.apy ?? 0) / maxApy : maxTvl > 0 ? o.tvl / maxTvl : 0;
  }
  return offers;
}

/** Only pools whose state has come in contribute; the rest join as they land. */
export function earnAssets(pools: EarnPool[]): EarnAsset[] {
  const byAddress = new Map<string, EarnOffer[]>();
  for (const pool of pools) {
    if (!pool.state) continue;
    for (const token of pool.state.tokens) {
      const offer: EarnOffer = {
        pool,
        token,
        apy: closedReason(pool) === "empty" ? null : offerApy(pool, token),
        tvl: pool.state.totalTvl,
        closed: closedReason(pool),
        byApy: false,
        score: 0,
      };
      const list = byAddress.get(token.address);
      if (list) list.push(offer);
      else byAddress.set(token.address, [offer]);
    }
  }

  const assets: EarnAsset[] = [...byAddress.entries()].map(([address, list]) => {
    const offers = rank(list);
    const open = offers.filter((o) => o.closed === null);
    const apys = open.flatMap((o) => (o.apy === null ? [] : [o.apy]));
    const token = offers[0].token;
    return {
      address,
      symbol: token.symbol,
      decimals: token.decimals,
      family: knownTokenMeta(address)?.family,
      offers,
      open,
      best: open[0] ?? null,
      apy: apys.length ? Math.max(...apys) : null,
      depth: open.reduce((sum, o) => sum + o.token.reserveHuman, 0),
      mine: offers.some((o) => o.pool.lp !== null && o.pool.lp > 0n),
    };
  });

  const familyRank = (f: AssetFamily | undefined) => (f ? FAMILY_ORDER.indexOf(f) : FAMILY_ORDER.length);
  return assets.sort(
    (a, b) =>
      Number(b.open.length > 0) - Number(a.open.length > 0) ||
      (b.apy ?? -1) - (a.apy ?? -1) ||
      familyRank(a.family) - familyRank(b.family) ||
      b.depth - a.depth ||
      a.symbol.localeCompare(b.symbol),
  );
}

// TVL here is a sum of token amounts. That reads as dollars only for USD
// stables; a BTC pool's depth is shown in BTC, a EUR pool's in euros.
function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 4 : 2 });
}

/** A pool's or an asset's depth in the family's own unit. */
export function formatDepth(value: number, family: AssetFamily | undefined): string {
  if (!family || family === "USD") return formatCurrency(value);
  if (family === "EUR") return `€${compact(value)}`;
  return `${compact(value)} ${family}`;
}

/** An exact figure such as a yearly yield, in the family's own unit. */
export function formatFamilyAmount(value: number, family: AssetFamily | undefined): string {
  const two = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (!family || family === "USD") return `$${value.toLocaleString("en-US", two)}`;
  if (family === "EUR") return `€${value.toLocaleString("en-US", two)}`;
  const digits = value === 0 ? 2 : value < 0.01 ? 6 : value < 1 ? 4 : 2;
  return `${value.toFixed(digits)} ${family}`;
}
