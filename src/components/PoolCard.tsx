import type { Pool } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'

interface PoolCardProps {
  pool: Pool
  onClick: () => void
  hasPosition: boolean
}

export default function PoolCard({ pool, onClick, hasPosition }: PoolCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-[#111] border border-white/[0.06] rounded-2xl p-6 cursor-pointer
                 transition-all duration-200 hover:border-white/[0.12] hover:bg-[#161616] hover:scale-[1.01]"
    >
      {hasPosition && (
        <div className="absolute top-4 right-4 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] text-white/50 font-medium uppercase tracking-widest">
          Deposited
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-sm font-bold text-white/70">
          {pool.symbol.charAt(0)}
        </div>
        <div>
          <p className="text-white text-sm font-semibold leading-tight">{pool.symbol}</p>
          <p className="text-white/35 text-xs">{pool.token}</p>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-4xl font-bold text-white tracking-tight">{pool.apy.toFixed(2)}%</p>
        <p className="text-[11px] text-white/30 mt-1.5 uppercase tracking-widest">Annual Yield</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5 pt-5 border-t border-white/[0.06]">
        <div>
          <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">TVL</p>
          <p className="text-white text-sm font-medium">{formatCurrency(pool.tvl)}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">24h Vol</p>
          <p className="text-white text-sm font-medium">{formatCurrency(pool.volume24h)}</p>
        </div>
      </div>

      {hasPosition && pool.myDeposit > 0 && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[11px] text-white/30 uppercase tracking-wider mb-0.5">My Deposit</p>
          <p className="text-white text-sm font-medium">${pool.myDeposit.toLocaleString()}</p>
        </div>
      )}

      <button className="w-full py-2.5 text-sm text-white/45 border border-white/[0.08] rounded-xl
                         group-hover:border-white/[0.15] group-hover:text-white/75 transition-all duration-200">
        Deposit
      </button>
    </div>
  )
}
