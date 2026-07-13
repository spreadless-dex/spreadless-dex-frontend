// Static placeholder metrics for numbers the contract doesn't expose yet
// (APY, holder count, volume). The contract dev's oracle service will
// eventually feed these; until then they're fixed, clearly-labeled preview
// numbers — never presented as live data (see PoolCard/PoolDetailModal).

export interface PoolPreviewStats {
  apy: number;
  holders: number;
  volume24h: number;
}

const STATS: Record<string, PoolPreviewStats> = {
  EURC: { apy: 6.8, holders: 412, volume24h: 184_500 },
  PYUSD: { apy: 5.4, holders: 587, volume24h: 231_200 },
  SUSD: { apy: 8.1, holders: 96, volume24h: 42_300 },
  sUSDC: { apy: 4.9, holders: 673, volume24h: 268_900 },
};

// Deterministic fallback for any symbol not in the table above (e.g. the pool
// gets redeployed with a new asset) — same spirit as pool.ts's metaFor() fallback.
function fallbackStats(symbol: string): PoolPreviewStats {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return {
    apy: 4 + (hash % 700) / 100,
    holders: 50 + (hash % 500),
    volume24h: 10_000 + (hash % 200_000),
  };
}

export function getPoolPreviewStats(symbol: string): PoolPreviewStats {
  return STATS[symbol] ?? fallbackStats(symbol);
}
