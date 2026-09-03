import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import PoolsRegister from './PoolsRegister'
import { Plus } from 'lucide-react'

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
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
              Pools
            </h1>
            <p className="learn-only text-sm" style={{ color: 'color-mix(in srgb, var(--c-text) 72%, transparent)' }}>
              Every deposit flows into these StableSwap pools. Open one for its full breakdown.
            </p>
          </div>
          <a
            href="/pools/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl btn-lift"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            <Plus size={16} strokeWidth={2.2} />
            Create pool
          </a>
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
              className="px-5 py-2.5 text-sm font-semibold rounded-xl btn-lift"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              Retry
            </button>
          </div>
        ) : poolStatus === 'ready' ? (
          <>
            <PoolsRegister />
            {/* The Create pool button above says the same thing, so this line
                is Learn mode only. */}
            <p className="learn-only text-[13px] mt-4" style={{ color: 'var(--c-text-faint)' }}>
              Missing a pair?{' '}
              <a href="/pools/new" className="underline underline-offset-2" style={{ color: 'var(--c-text-muted)' }}>
                Create your own pool.
              </a>
            </p>
          </>
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
