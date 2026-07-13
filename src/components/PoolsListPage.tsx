import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import PoolsRegister from './PoolsRegister'

// The "Pools" header destination (issue #28): a register of the protocol's
// pools. Today that's the single StableSwap pool; PoolsRegister renders it as
// one row and grows into a multi-row table as more pools ship. Each row opens
// the pool-wide detail page at /pools/[slug].
export default function PoolsListPage() {
  const { poolStatus, poolError, loadPoolState } = useAppStore()

  useEffect(() => {
    loadPoolState()
  }, [loadPoolState])

  return (
    <div className="min-h-screen pt-16">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
            Pools
          </h1>
          <p className="text-sm" style={{ color: 'var(--c-text)', opacity: 0.72 }}>
            Every deposit flows into these StableSwap pools. Open one for its full breakdown.
          </p>
        </div>

        {poolStatus === 'error' ? (
          <div
            className="p-8 rounded-2xl text-center"
            style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--c-text-muted)' }}>
              Couldn't reach the pool contract.
            </p>
            <p className="text-xs mb-5 break-words" style={{ color: 'var(--c-text-faint)' }}>
              {poolError}
            </p>
            <button
              onClick={loadPoolState}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              Retry
            </button>
          </div>
        ) : poolStatus === 'ready' ? (
          <PoolsRegister />
        ) : (
          <div
            className="rounded-2xl animate-shimmer"
            style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-card-border)', height: 120 }}
          />
        )}
      </div>
    </div>
  )
}
