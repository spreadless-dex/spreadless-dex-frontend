import { useEffect, useState } from 'react'
import type { marketStats } from '../lib/server/market'

type Stats = ReturnType<typeof marketStats>

const usd = (value: number, compact: boolean) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  })

// The landing page is static, so its figures arrive after it does. Until they
// do, and if they never do, a dash holds the row: never a number we can't back.
export default function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/stats')
      .then((res) => (res.ok ? (res.json() as Promise<Stats>) : null))
      .then((next) => live && setStats(next))
      .catch((err) => console.error('Stats read failed:', err))
    return () => {
      live = false
    }
  }, [])

  const days = stats?.volumeWindowDays ?? 7
  const rows = [
    { val: stats && usd(stats.tvl, false), label: 'TVL' },
    { val: stats && usd(stats.volume, stats.volume >= 1_000_000), label: `${days}d Volume` },
    { val: stats && String(stats.stablecoins), label: 'Stablecoins' },
    { val: stats && String(stats.pools), label: stats?.pools === 1 ? 'Liquidity Pool' : 'Liquidity Pools' },
    { val: stats && `${stats.highestApy.toFixed(1)}%`, label: 'Highest APY', accent: true },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
        {rows.map(({ val, label, accent }) => (
          <div key={label}>
            <p className="text-xl md:text-2xl font-black tabular-nums" style={{ color: accent ? 'var(--c-accent)' : 'var(--c-text)' }}>
              {val ?? '—'}
            </p>
            <p className="text-[11px] uppercase tracking-wider mt-1" style={{ color: 'var(--c-text-faint)' }}>
              {label}*
            </p>
          </div>
        ))}
      </div>
      <p className="text-[10px] mt-4" style={{ color: 'var(--c-text-faint)' }}>
        * Live from Stellar. Volume and APY cover the last {days} days; APY is the fees LPs earned, annualized.
      </p>
    </>
  )
}
