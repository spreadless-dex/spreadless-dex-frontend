import { useAppStore, type Pool } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'

interface PoolsTableProps {
  pools: Pool[]
  onSelectPool: (pool: Pool) => void
}

export default function PoolsTable({ pools, onSelectPool }: PoolsTableProps) {
  const { walletConnected } = useAppStore()

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: '1px solid var(--c-border)',
        boxShadow: 'var(--c-card-shadow)',
        backgroundColor: 'var(--c-surface)',
      }}
    >
      <div
        className="grid px-6 py-3 text-[11px] uppercase tracking-widest"
        style={{
          gridTemplateColumns: '1.6fr 90px 120px 130px 100px 100px 110px',
          borderBottom: '1px solid var(--c-border)',
          color: 'var(--c-text-faint)',
        }}
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
          className="grid px-6 py-4 items-center cursor-pointer transition-colors duration-150"
          style={{
            gridTemplateColumns: '1.6fr 90px 120px 130px 100px 100px 110px',
            borderBottom: i < pools.length - 1 ? '1px solid var(--c-border)' : 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--c-surface-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: 'var(--c-surface-2)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-text-muted)',
              }}
            >
              {pool.symbol.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                {pool.symbol}
              </p>
              <p className="text-xs" style={{ color: 'var(--c-text-faint)' }}>
                {pool.token}
              </p>
            </div>
          </div>

          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            {pool.apy.toFixed(2)}%
          </span>

          <span className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            {formatCurrency(pool.tvl)}
          </span>

          <span className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            {formatCurrency(pool.volume24h)}
          </span>

          <div className="flex items-center gap-2.5 pr-4">
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--c-border)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pool.utilization}%`,
                  backgroundColor: 'var(--c-text-muted)',
                }}
              />
            </div>
            <span className="text-xs w-8 text-right shrink-0" style={{ color: 'var(--c-text-faint)' }}>
              {pool.utilization}%
            </span>
          </div>

          <span className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            {walletConnected && pool.myDeposit > 0
              ? `$${pool.myDeposit.toLocaleString()}`
              : '—'}
          </span>

          <button
            className="px-3 py-1.5 text-xs rounded-lg transition-all duration-150 w-fit"
            style={{
              color: 'var(--c-text-muted)',
              border: '1px solid var(--c-border)',
            }}
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
