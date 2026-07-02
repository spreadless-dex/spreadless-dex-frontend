import type { Pool } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'

interface PoolCardProps {
  pool: Pool
  onClick: () => void
  hasPosition: boolean
  index?: number
}

export default function PoolCard({ pool, onClick, hasPosition, index = 0 }: PoolCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:scale-[1.01] animate-fade-up"
      style={{
        backgroundColor: 'var(--c-surface)',
        border: '1px solid var(--c-card-border)',
        boxShadow: 'var(--c-card-shadow)',
        animationDelay: `${index * 0.07}s`,
      }}
    >
      {hasPosition && (
        <div
          className="absolute top-4 right-4 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-widest"
          style={{
            border: '1px solid var(--c-border)',
            backgroundColor: 'var(--c-surface-2)',
            color: 'var(--c-text-faint)',
          }}
        >
          Deposited
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{
            backgroundColor: 'var(--c-surface-2)',
            border: '1px solid var(--c-border)',
            color: 'var(--c-text-muted)',
          }}
        >
          {pool.symbol.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--c-text)' }}>
            {pool.symbol}
          </p>
          <p className="text-xs" style={{ color: 'var(--c-text-faint)' }}>
            {pool.token}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-4xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>
          {pool.apy.toFixed(2)}%
        </p>
        <p className="text-[11px] mt-1.5 uppercase tracking-widest" style={{ color: 'var(--c-text-faint)' }}>
          Annual Yield
        </p>
      </div>

      <div
        className="grid grid-cols-3 gap-3 mb-5 pt-5"
        style={{ borderTop: '1px solid var(--c-border)' }}
      >
        {[
          { label: 'APY', value: `${pool.apy.toFixed(2)}%` },
          { label: 'TVL', value: formatCurrency(pool.tvl) },
          { label: 'Holders', value: pool.depositors.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
              {label}
            </p>
            <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {hasPosition && pool.myDeposit > 0 && (
        <div
          className="mb-4 px-3 py-2.5 rounded-lg"
          style={{
            backgroundColor: 'var(--c-surface-2)',
            border: '1px solid var(--c-border)',
          }}
        >
          <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-text-faint)' }}>
            My Deposit
          </p>
          <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
            ${pool.myDeposit.toLocaleString()}
          </p>
        </div>
      )}

      <button
        className="w-full py-2.5 text-sm rounded-xl transition-all duration-200"
        style={{
          color: 'var(--c-text-muted)',
          border: '1px solid var(--c-border)',
        }}
      >
        Deposit
      </button>
    </div>
  )
}
