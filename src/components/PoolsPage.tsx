import { useAppStore } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import PoolsGrid from './PoolsGrid'
import PoolsTable from './PoolsTable'
import ViewToggle from './ViewToggle'
import PoolDetailModal from './PoolDetailModal'

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

  return (
    <div className="min-h-screen pt-16">
      <div className="border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center gap-2">
          {[
            { label: 'TVL', value: formatCurrency(totalTVL) },
            { label: '24h Volume', value: formatCurrency(totalVolume) },
            { label: 'Pools', value: String(pools.length) },
            { label: 'Avg APY', value: `${avgAPY.toFixed(2)}%` },
          ].map(({ label, value }, i, arr) => (
            <div key={label} className="flex items-center gap-2">
              <div className="px-4 py-1">
                <p className="text-[11px] text-white/30 uppercase tracking-widest mb-0.5">{label}</p>
                <p className="text-white text-sm font-semibold">{value}</p>
              </div>
              {i < arr.length - 1 && <div className="w-px h-7 bg-white/[0.06]" />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Earn</h1>
            <p className="text-white/40 text-sm">
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
