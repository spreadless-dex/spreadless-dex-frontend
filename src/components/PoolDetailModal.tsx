import { useState, useEffect } from 'react'
import type { Pool } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'

interface PoolDetailModalProps {
  pool: Pool
  onClose: () => void
}

export default function PoolDetailModal({ pool, onClose }: PoolDetailModalProps) {
  const [amount, setAmount] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const stats = [
    { label: 'TVL', value: formatCurrency(pool.tvl) },
    { label: '24h Volume', value: formatCurrency(pool.volume24h) },
    { label: 'Pool Fee', value: `${pool.fees}%` },
    { label: 'Utilization', value: `${pool.utilization}%` },
    { label: 'Depositors', value: pool.depositors.toLocaleString() },
    { label: 'Pool Type', value: 'StableSwap' },
  ]

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className={`relative w-full max-w-md rounded-2xl p-6 transition-all duration-200 ${mounted ? 'scale-100' : 'scale-95'}`}
        style={{
          backgroundColor: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          boxShadow: 'var(--c-widget-shadow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
          style={{ color: 'var(--c-text-faint)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
            style={{
              backgroundColor: 'var(--c-surface-2)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-text-muted)',
            }}
          >
            {pool.symbol.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--c-text)' }}>
              {pool.symbol}
            </h2>
            <p className="text-sm" style={{ color: 'var(--c-text-faint)' }}>
              {pool.token} · StableSwap
            </p>
          </div>
        </div>

        <div
          className="p-4 rounded-xl mb-4 text-center"
          style={{
            backgroundColor: 'var(--c-surface-2)',
            border: '1px solid var(--c-border)',
          }}
        >
          <p className="text-5xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>
            {pool.apy.toFixed(2)}%
          </p>
          <p className="text-[11px] uppercase tracking-widest mt-1.5" style={{ color: 'var(--c-text-faint)' }}>
            Annual Yield
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {stats.map(({ label, value }) => (
            <div
              key={label}
              className="p-3 rounded-lg"
              style={{
                backgroundColor: 'var(--c-surface-2)',
                border: '1px solid var(--c-border)',
              }}
            >
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
                {label}
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--c-text-faint)' }}>
            Deposit Amount
          </label>
          <div
            className="flex items-center rounded-xl overflow-hidden transition-colors"
            style={{
              border: '1px solid var(--c-border)',
              backgroundColor: 'var(--c-surface-2)',
            }}
          >
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
              style={{ color: 'var(--c-text)' }}
            />
            <span
              className="px-4 py-3 text-sm shrink-0"
              style={{
                color: 'var(--c-text-faint)',
                borderLeft: '1px solid var(--c-border)',
              }}
            >
              {pool.symbol}
            </span>
          </div>
        </div>

        <button
          className="w-full py-3 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99]"
          style={{
            backgroundColor: 'var(--c-cta-bg)',
            color: 'var(--c-cta-text)',
          }}
        >
          Deposit {pool.symbol}
        </button>
      </div>
    </div>
  )
}
