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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className={`relative w-full max-w-md bg-[#111] border border-white/[0.08] rounded-2xl p-6 transition-all duration-200 ${mounted ? 'scale-100' : 'scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xl font-bold text-white/70">
            {pool.symbol.charAt(0)}
          </div>
          <div>
            <h2 className="text-white text-xl font-bold leading-tight">{pool.symbol}</h2>
            <p className="text-white/40 text-sm">{pool.token} · StableSwap</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4 text-center">
          <p className="text-5xl font-bold text-white tracking-tight">{pool.apy.toFixed(2)}%</p>
          <p className="text-white/30 text-[11px] uppercase tracking-widest mt-1.5">Annual Yield</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {stats.map(({ label, value }) => (
            <div key={label} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <p className="text-white/30 text-[11px] uppercase tracking-wider mb-1">{label}</p>
              <p className="text-white text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <label className="text-white/35 text-[11px] uppercase tracking-wider mb-2 block">
            Deposit Amount
          </label>
          <div className="flex items-center border border-white/[0.08] rounded-xl overflow-hidden bg-white/[0.02] focus-within:border-white/[0.18] transition-colors">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent px-4 py-3 text-white text-sm outline-none placeholder-white/20"
            />
            <span className="px-4 py-3 text-white/35 text-sm border-l border-white/[0.08] shrink-0">
              {pool.symbol}
            </span>
          </div>
        </div>

        <button className="w-full py-3 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 active:scale-[0.99] transition-all duration-150">
          Deposit {pool.symbol}
        </button>
      </div>
    </div>
  )
}
