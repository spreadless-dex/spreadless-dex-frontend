import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import PoolsGrid from './PoolsGrid'
import PoolsRegister from './PoolsRegister'
import PoolDetailModal from './PoolDetailModal'
import MyLiquidity from './MyLiquidity'
import PositionSummary from './PositionSummary'
import { TrendingUp, Gauge, Layers, Activity, Search } from 'lucide-react'

type Tab = 'invest' | 'pools' | 'portfolio'

// Issue #28: the asset cards aren't "pools" — they're ways to invest into the
// one shared StableSwap pool. So: Invest (the cards) · Pools (the real pool,
// register-style) · Portfolio (your positions).
const TAB_SUBTITLE: Record<Tab, string> = {
  invest: 'Single-sided liquidity. Deposit one stablecoin and earn.',
  pools: 'The live StableSwap pool powering every deposit.',
  portfolio: 'Your liquidity positions and earnings.',
}

export default function PoolsPage() {
  const {
    poolState,
    poolStatus,
    poolError,
    loadPoolState,
    selectedToken,
    setSelectedToken,
  } = useAppStore()

  const [tab, setTab] = useState<Tab>('invest')
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<'deposit' | 'withdraw'>('deposit')

  useEffect(() => {
    loadPoolState()
  }, [loadPoolState])

  const stats = [
    {
      key: 'tvl',
      Icon: TrendingUp,
      line1: 'Total value locked',
      line2: poolState ? `across ${poolState.tokens.length} assets` : '—',
      value: poolState ? formatCurrency(poolState.totalTvl) : '—',
    },
    {
      key: 'amp',
      Icon: Gauge,
      line1: 'Amplification',
      line2: 'StableSwap coefficient',
      value: poolState ? `A = ${poolState.amp}` : '—',
    },
    {
      key: 'assets',
      Icon: Layers,
      line1: 'Pooled assets',
      line2: 'in one StableSwap pool',
      value: poolState ? String(poolState.tokens.length) : '—',
    },
    {
      key: 'status',
      Icon: Activity,
      line1: 'Pool status',
      line2: 'on Stellar testnet',
      value: poolState ? (poolState.paused ? 'Paused' : 'Active') : '—',
    },
  ]

  return (
    <div className="min-h-screen pt-16">
      {/* Stats bar */}
      <div style={{ borderBottom: '1px solid var(--c-border)' }}>
        {/* Mobile: 2×2 grid */}
        <div className="grid grid-cols-2 md:hidden max-w-7xl mx-auto">
          {stats.map(({ key, Icon, line1, value }, i) => (
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
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: single horizontal row */}
        <div className="hidden md:flex items-center max-w-7xl mx-auto px-6 py-5">
          {stats.map(({ key, Icon, line1, line2, value }, i) => (
            <div key={key} className="flex items-center">
              <div className="flex items-center gap-3 px-6 first:pl-0">
                <Icon size={18} strokeWidth={1.6} style={{ color: 'var(--c-text)', flexShrink: 0 }} />
                <div>
                  <p className="text-[13px] leading-snug" style={{ color: 'var(--c-text-muted)' }}>
                    {line1}
                  </p>
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--c-text)' }}>
                    {value} · {line2}
                  </p>
                </div>
              </div>
              {i < stats.length - 1 && (
                <div className="w-px h-8 shrink-0" style={{ backgroundColor: 'var(--c-border)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
            Earn
          </h1>
          <p className="text-sm" style={{ color: 'var(--c-text)', opacity: 0.72 }}>
            {TAB_SUBTITLE[tab]}
          </p>
        </div>

        <div
          className="inline-grid grid-cols-3 gap-1 p-1 rounded-xl mb-6"
          style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        >
          {([
            { key: 'invest' as Tab, label: 'Invest' },
            { key: 'pools' as Tab, label: 'Pools' },
            { key: 'portfolio' as Tab, label: 'Portfolio' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-5 py-2 text-sm font-semibold rounded-lg transition-all"
              style={{
                backgroundColor: tab === key ? 'var(--c-surface)' : 'transparent',
                color: tab === key ? 'var(--c-text)' : 'var(--c-text-faint)',
                boxShadow: tab === key ? 'var(--c-widget-shadow)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'portfolio' ? (
          <MyLiquidity />
        ) : poolStatus === 'error' ? (
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
        ) : poolStatus === 'ready' && poolState ? (
          tab === 'pools' ? (
            <PoolsRegister />
          ) : (
          <>
            <PositionSummary onViewDetails={() => setTab('portfolio')} />

            <div className="relative max-w-xs mb-6">
              <Search size={15} strokeWidth={1.8} style={{ color: 'var(--c-text-faint)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search token"
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl outline-none"
                style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
            </div>

            {(() => {
              const filtered = poolState.tokens.filter((t) =>
                t.symbol.toLowerCase().includes(search.trim().toLowerCase()),
              )
              return filtered.length > 0 ? (
                <PoolsGrid
                  tokens={filtered}
                  onSelectToken={(token, mode) => {
                    setModalMode(mode)
                    setSelectedToken(token)
                  }}
                />
              ) : (
                <div
                  className="p-8 rounded-2xl text-center"
                  style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                >
                  <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
                    No tokens match "{search}".
                  </p>
                </div>
              )
            })()}
          </>
          )
        ) : (
          <PoolsSkeleton />
        )}
      </div>

      {selectedToken && (
        <PoolDetailModal
          token={selectedToken}
          defaultMode={modalMode}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  )
}

function PoolsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-6 animate-shimmer"
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-card-border)',
            height: 220,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  )
}
