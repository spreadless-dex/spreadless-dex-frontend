import { useAppStore } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import PoolsGrid from './PoolsGrid'
import PoolsTable from './PoolsTable'
import ViewToggle from './ViewToggle'
import PoolDetailModal from './PoolDetailModal'
import { TrendingUp, Activity, Layers, Percent } from 'lucide-react'

const statsConfig = [
  {
    key: 'tvl',
    Icon: TrendingUp,
    line1: 'Total value locked',
    line2: (v: string) => `across ${v}`,
  },
  {
    key: 'volume',
    Icon: Activity,
    line1: 'Trading volume',
    line2: (v: string) => `${v} in 24 hours`,
  },
  {
    key: 'pools',
    Icon: Layers,
    line1: 'Liquidity pools',
    line2: (v: string) => `${v} active on Stellar`,
  },
  {
    key: 'apy',
    Icon: Percent,
    line1: 'Average yield',
    line2: (v: string) => `up to ${v} APY`,
  },
]

export default function PoolsPage() {
  const { pools, viewMode, selectedPool, setSelectedPool, walletConnected } = useAppStore()

  const sortedPools = [...pools].sort((a, b) => {
    if (walletConnected) {
      if (a.myDeposit > 0 && b.myDeposit === 0) return -1
      if (b.myDeposit > 0 && a.myDeposit === 0) return 1
    }
    return b.apy - a.apy
  })

  const totalTVL = pools.reduce((sum, p) => sum + p.tvl, 0)
  const totalVolume = pools.reduce((sum, p) => sum + p.volume24h, 0)
  const avgAPY = pools.reduce((sum, p) => sum + p.apy, 0) / pools.length

  const statValues = [
    formatCurrency(totalTVL),
    formatCurrency(totalVolume),
    String(pools.length),
    `${avgAPY.toFixed(2)}%`,
  ]

  return (
    <div className="min-h-screen pt-16">
      {/* Stats bar */}
      <div style={{ borderBottom: '1px solid var(--c-border)' }}>
        {/* Mobile: 2×2 grid */}
        <div className="grid grid-cols-2 md:hidden max-w-7xl mx-auto">
          {statsConfig.map(({ key, Icon, line1, line2 }, i) => (
            <div
              key={key}
              className="flex items-center gap-3 px-5 py-4"
              style={{
                borderRight: i % 2 === 0 ? '1px solid var(--c-border)' : 'none',
                borderBottom: i < 2 ? '1px solid var(--c-border)' : 'none',
              }}
            >
              <Icon size={16} strokeWidth={1.6} style={{ color: 'var(--c-text)', flexShrink: 0 }} />
              <div>
                <p className="text-[11px] leading-snug" style={{ color: 'var(--c-text-muted)' }}>
                  {line1}
                </p>
                <p className="text-[12px] font-semibold leading-snug" style={{ color: 'var(--c-text)' }}>
                  {line2(statValues[i])}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: single horizontal row */}
        <div className="hidden md:flex items-center max-w-7xl mx-auto px-6 py-5">
          {statsConfig.map(({ key, Icon, line1, line2 }, i) => (
            <div key={key} className="flex items-center">
              <div className="flex items-center gap-3 px-6 first:pl-0">
                <Icon size={18} strokeWidth={1.6} style={{ color: 'var(--c-text)', flexShrink: 0 }} />
                <div>
                  <p className="text-[13px] leading-snug" style={{ color: 'var(--c-text-muted)' }}>
                    {line1}
                  </p>
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--c-text)' }}>
                    {line2(statValues[i])}
                  </p>
                </div>
              </div>
              {i < statsConfig.length - 1 && (
                <div className="w-px h-8 shrink-0" style={{ backgroundColor: 'var(--c-border)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
              Earn
            </h1>
            <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
              Single-sided liquidity. Deposit one stablecoin and earn.
            </p>
          </div>
          <ViewToggle />
        </div>

        {viewMode === 'card' ? (
          <PoolsGrid pools={sortedPools} onSelectPool={setSelectedPool} />
        ) : (
          <PoolsTable pools={sortedPools} onSelectPool={setSelectedPool} />
        )}
      </div>

      {selectedPool && (
        <PoolDetailModal pool={selectedPool} onClose={() => setSelectedPool(null)} />
      )}
    </div>
  )
}
