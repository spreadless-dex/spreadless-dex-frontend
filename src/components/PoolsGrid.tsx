import type { PoolToken } from '../store/useAppStore'
import PoolCard from './PoolCard'

interface PoolsGridProps {
  tokens: PoolToken[]
  onSelectToken: (token: PoolToken) => void
}

export default function PoolsGrid({ tokens, onSelectToken }: PoolsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tokens.map((token, index) => (
        <PoolCard
          key={token.address}
          token={token}
          onClick={() => onSelectToken(token)}
          index={index}
        />
      ))}
    </div>
  )
}
