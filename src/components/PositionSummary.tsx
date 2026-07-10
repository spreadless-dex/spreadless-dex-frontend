import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { getLpBalance, LP_DECIMALS } from '../lib/stellar/pool'
import { fromRawUnits } from '../lib/stellar/units'
import { formatCurrency } from '../lib/utils'

// Compact "Your position" strip above the pools grid — after a deposit, the
// default tab should show that your money has a place here, without having to
// find the My Liquidity tab. Renders nothing when there's no wallet or no
// position, so first-time visitors see the grid unchanged.

export default function PositionSummary({ onViewDetails }: { onViewDetails: () => void }) {
  const { poolState, walletConnected, walletAddress } = useAppStore()
  const [lpBalance, setLpBalance] = useState<bigint | null>(null)

  // Re-fetch whenever the pool state refreshes — that's what changes after a
  // deposit/withdraw lands, so the strip stays in sync with the modal's flows.
  useEffect(() => {
    if (!walletAddress) {
      setLpBalance(null)
      return
    }
    let cancelled = false
    getLpBalance(walletAddress).then((b) => {
      if (!cancelled) setLpBalance(b)
    })
    return () => {
      cancelled = true
    }
  }, [walletAddress, poolState])

  if (!walletConnected || !poolState || lpBalance === null || lpBalance <= 0n) return null

  const lpHuman = Number(fromRawUnits(lpBalance, LP_DECIMALS))
  const shareOfSupply = poolState.lpSupplyHuman > 0 ? lpHuman / poolState.lpSupplyHuman : 0
  const estimatedValue = shareOfSupply * poolState.totalTvl

  const stats = [
    { label: 'Value', value: formatCurrency(estimatedValue) },
    { label: 'LP shares', value: lpHuman.toFixed(4) },
    { label: 'Pool share', value: `${(shareOfSupply * 100).toFixed(2)}%` },
  ]

  return (
    <div
      className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl px-6 py-4 mb-6 animate-fade-up"
      style={{
        backgroundColor: 'var(--c-surface)',
        border: '1px solid var(--c-card-border)',
        boxShadow: 'var(--c-card-shadow)',
      }}
    >
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
        Your position
      </p>
      {stats.map(({ label, value }) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>
            {value}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
            {label}
          </span>
        </div>
      ))}
      <button
        onClick={onViewDetails}
        className="ml-auto px-4 py-2 text-xs font-semibold rounded-lg transition-all hover:opacity-80 active:scale-[0.99]"
        style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
      >
        View details
      </button>
    </div>
  )
}
