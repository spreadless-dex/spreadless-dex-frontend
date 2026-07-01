import { useAppStore, type Pool } from '../store/useAppStore'
import PoolCard from './PoolCard'

interface PoolsGridProps {
  pools: Pool[]
  onSelectPool: (pool: Pool) => void
}

export default function PoolsGrid({ pools, onSelectPool }: PoolsGridProps) {
  const { walletConnected } = useAppStore()

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {pools.map((pool, index) => (
        <PoolCard
          key={pool.id}
          pool={pool}
          onClick={() => onSelectPool(pool)}
          hasPosition={walletConnected && pool.myDeposit > 0}
          index={index}
        />
      ))}
    </div>
  )
}
