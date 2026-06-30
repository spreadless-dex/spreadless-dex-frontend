import { useAppStore, type Pool } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'

interface PoolsTableProps {
  pools: Pool[]
  onSelectPool: (pool: Pool) => void
}

export default function PoolsTable({ pools, onSelectPool }: PoolsTableProps) {
  const { walletConnected } = useAppStore()

  return (
    <div className="border border-white/[0.06] rounded-2xl overflow-hidden">
      <div
        className="grid px-6 py-3 border-b border-white/[0.06] text-[11px] uppercase tracking-widest text-white/30"
        style={{ gridTemplateColumns: '1.6fr 90px 120px 130px 100px 100px 110px' }}
      >
        <span>Pool</span>
        <span>APY</span>
        <span>TVL</span>
        <span>24h Volume</span>
        <span>Utilization</span>
        <span>My Deposit</span>
        <span />
      </div>

      {pools.map((pool, i) => (
        <div
          key={pool.id}
          onClick={() => onSelectPool(pool)}
          className={`grid px-6 py-4 items-center cursor-pointer transition-colors duration-150 hover:bg-white/[0.02] ${
            i < pools.length - 1 ? 'border-b border-white/[0.04]' : ''
          }`}
          style={{ gridTemplateColumns: '1.6fr 90px 120px 130px 100px 100px 110px' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xs font-bold text-white/60">
              {pool.symbol.charAt(0)}
            </div>
            <div>
              <p className="text-white text-sm font-medium">{pool.symbol}</p>
              <p className="text-white/30 text-xs">{pool.token}</p>
            </div>
          </div>

          <span className="text-white text-sm font-semibold">{pool.apy.toFixed(2)}%</span>

          <span className="text-white/65 text-sm">{formatCurrency(pool.tvl)}</span>

          <span className="text-white/65 text-sm">{formatCurrency(pool.volume24h)}</span>

          <div className="flex items-center gap-2.5 pr-4">
            <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-white/25 rounded-full"
                style={{ width: `${pool.utilization}%` }}
              />
            </div>
            <span className="text-white/40 text-xs w-8 text-right shrink-0">{pool.utilization}%</span>
          </div>

          <span className="text-white/50 text-sm">
            {walletConnected && pool.myDeposit > 0
              ? `$${pool.myDeposit.toLocaleString()}`
              : '—'}
          </span>

          <button
            className="px-3 py-1.5 text-xs text-white/45 border border-white/[0.08] rounded-lg
                       hover:border-white/[0.18] hover:text-white/75 transition-all duration-150 w-fit"
            onClick={(e) => {
              e.stopPropagation()
              onSelectPool(pool)
            }}
          >
            Deposit
          </button>
        </div>
      ))}
    </div>
  )
}
