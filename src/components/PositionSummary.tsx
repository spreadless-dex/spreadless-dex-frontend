import { formatCurrency } from '../lib/utils'

// Compact "Your position" strip above the pools, so after a deposit the
// default tab shows that the money has a place here without a trip to
// Portfolio. Sums every pool the wallet holds shares in. Renders nothing
// without a position, so first-time visitors see the pools unchanged.

export default function PositionSummary({
  value,
  count,
  onViewDetails,
}: {
  /** Estimated value across every position, stablecoins at ≈ $1. */
  value: number
  /** Pools the wallet holds LP shares in. */
  count: number
  onViewDetails: () => void
}) {
  if (count === 0) return null

  const stats = [
    { label: 'Value', value: formatCurrency(value) },
    { label: count === 1 ? 'Position' : 'Positions', value: String(count) },
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
        Your liquidity
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
