import { useState } from 'react'
import { useAppStore, type PoolToken } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { positionValue, useEarnPools, type EarnPool } from '../lib/stellar/earnPools'
import PoolsGrid from './PoolsGrid'
import PoolDetailModal from './PoolDetailModal'
import SeedLiquidityModal from './SeedLiquidityModal'
import MyLiquidity from './MyLiquidity'
import PositionSummary from './PositionSummary'
import { TrendingUp, Layers, Coins, Wallet, Search, ChevronRight } from 'lucide-react'

type Tab = 'invest' | 'portfolio'
type WithdrawKind = 'one' | 'all'

interface Action {
  pool: EarnPool
  token: PoolToken
  mode: 'deposit' | 'withdraw'
  kind: WithdrawKind
}

// Earn is the action surface (issue #28): Invest puts money into a pool one
// asset at a time, Portfolio shows what the wallet holds and takes it out
// again. It spans every pool on chain, grouped by pool and ranked by TVL like
// the register at /pools, because the same asset in two pools is two different
// deposits: different depth, different fee, different neighbours.
const TAB_SUBTITLE: Record<Tab, string> = {
  invest: 'Single-sided liquidity. Deposit one stablecoin into a pool and earn.',
  portfolio: 'Your liquidity positions across every pool.',
}

export default function PoolsPage() {
  const { walletAddress, walletConnected } = useAppStore()
  const { pools, loading, error, refresh, retry, reload } = useEarnPools(walletAddress)

  const [tab, setTab] = useState<Tab>('invest')
  const [search, setSearch] = useState('')
  const [action, setAction] = useState<Action | null>(null)
  const [seeding, setSeeding] = useState<EarnPool | null>(null)

  const loaded = pools.flatMap((p) => (p.state ? [p.state] : []))
  const totalTvl = loaded.reduce((sum, s) => sum + s.totalTvl, 0)
  const funded = loaded.filter((s) => s.lpSupply > 0n).length
  const assetCount = new Set(loaded.flatMap((s) => s.tokens.map((t) => t.address))).size
  const positions = pools.filter((p) => p.state !== null && p.lp !== null && p.lp > 0n)
  const depositedValue = positions.reduce((sum, p) => sum + positionValue(p), 0)

  const stats = [
    {
      key: 'tvl',
      Icon: TrendingUp,
      line1: 'Total value locked',
      line2: pools.length ? `across ${pools.length} ${pools.length === 1 ? 'pool' : 'pools'}` : '—',
      value: loaded.length ? formatCurrency(totalTvl) : '—',
    },
    {
      key: 'pools',
      Icon: Layers,
      line1: 'Pools',
      line2: `${funded} funded`,
      value: pools.length ? String(pools.length) : '—',
    },
    {
      key: 'assets',
      Icon: Coins,
      line1: 'Assets',
      line2: 'you can deposit',
      value: assetCount ? String(assetCount) : '—',
    },
    {
      key: 'yours',
      Icon: Wallet,
      line1: 'Your liquidity',
      line2: !walletConnected
        ? 'log in to see it'
        : positions.length
          ? `in ${positions.length} ${positions.length === 1 ? 'pool' : 'pools'}`
          : 'no positions yet',
      value: walletConnected ? formatCurrency(depositedValue) : '—',
    },
  ]

  const openWithdraw = (pool: EarnPool, token: PoolToken, kind: WithdrawKind) =>
    setAction({ pool, token, mode: 'withdraw', kind })

  // A search narrows each pool to the matching assets and hides pools with
  // none. Pools still loading have no assets to match yet, so they wait.
  const q = search.trim().toLowerCase()
  const sections = pools
    .map((pool) => ({
      pool,
      tokens: pool.state ? pool.state.tokens.filter((t) => t.symbol.toLowerCase().includes(q)) : null,
    }))
    .filter(({ tokens }) => !q || (tokens !== null && tokens.length > 0))

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
          <p className="learn-only text-sm" style={{ color: 'color-mix(in srgb, var(--c-text) 72%, transparent)' }}>
            {TAB_SUBTITLE[tab]}
          </p>
        </div>

        <div
          className="inline-grid grid-cols-2 gap-1 p-1 rounded-xl mb-6"
          style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        >
          {([
            { key: 'invest' as Tab, label: 'Invest' },
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
          <MyLiquidity pools={pools} onWithdraw={openWithdraw} />
        ) : error && pools.length === 0 ? (
          <div
            className="p-8 rounded-2xl text-center"
            style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--c-text-muted)' }}>
              Couldn't reach the pool registry.
            </p>
            <p className="text-xs mb-5 break-words" style={{ color: 'var(--c-text-faint)' }}>
              {error}
            </p>
            <button
              onClick={reload}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl btn-lift"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <PoolsSkeleton />
        ) : (
          <>
            <PositionSummary
              value={depositedValue}
              count={positions.length}
              onViewDetails={() => setTab('portfolio')}
            />

            <div className="relative max-w-xs mb-8">
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

            {sections.length > 0 ? (
              <div className="space-y-10">
                {sections.map(({ pool, tokens }) => (
                  <PoolSection
                    key={pool.address}
                    pool={pool}
                    tokens={tokens}
                    onDeposit={(token) => setAction({ pool, token, mode: 'deposit', kind: 'one' })}
                    onWithdraw={(token) => openWithdraw(pool, token, 'one')}
                    onSeed={() => setSeeding(pool)}
                    onRetry={() => retry(pool.address)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="p-8 rounded-2xl text-center"
                style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              >
                <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
                  {q ? `No tokens match "${search}".` : 'No pools yet.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {action && action.pool.state && (
        <PoolDetailModal
          token={action.token}
          defaultMode={action.mode}
          defaultWithdrawKind={action.kind}
          poolId={action.pool.address}
          poolTokens={action.pool.state.tokens}
          onLanded={() => void refresh(action.pool.address)}
          onClose={() => setAction(null)}
        />
      )}

      {seeding && seeding.state && (
        <SeedLiquidityModal
          tokens={seeding.state.tokens}
          poolId={seeding.address}
          poolLabel={seeding.label}
          onClose={() => setSeeding(null)}
          onSeeded={() => void refresh(seeding.address)}
        />
      )}
    </div>
  )
}

function PoolSection({
  pool,
  tokens,
  onDeposit,
  onWithdraw,
  onSeed,
  onRetry,
}: {
  pool: EarnPool
  /** The pool's assets that match the search; null while the pool loads. */
  tokens: PoolToken[] | null
  onDeposit: (token: PoolToken) => void
  onWithdraw: (token: PoolToken) => void
  onSeed: () => void
  onRetry: () => void
}) {
  const state = pool.state
  const amp = state?.amp ?? pool.amp
  const settings = [
    amp !== undefined ? `A = ${amp}` : null,
    pool.feeBps !== undefined ? `${(pool.feeBps / 100).toFixed(2)}% fee` : null,
    state?.paused ? 'Paused, withdrawals only' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
        <a href={pool.href} className="group min-w-0">
          <p className="text-[15px] font-semibold flex items-center gap-1" style={{ color: 'var(--c-text)' }}>
            {pool.label}
            <ChevronRight
              size={15}
              strokeWidth={1.8}
              className="transition-transform group-hover:translate-x-0.5"
              style={{ color: 'var(--c-text-faint)' }}
            />
          </p>
          {settings && (
            <p className="text-[12px]" style={{ color: 'var(--c-text-faint)' }}>
              {settings}
            </p>
          )}
        </a>
        {state && (
          <p className="text-[13px] tabular-nums" style={{ color: 'var(--c-text-muted)' }}>
            {state.totalTvl > 0 ? `${formatCurrency(state.totalTvl)} TVL` : 'Empty'}
          </p>
        )}
      </div>

      {pool.failed ? (
        <div
          className="p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            Couldn't read this pool right now.
          </p>
          <button
            onClick={onRetry}
            className="px-4 py-2 text-[13px] font-semibold rounded-xl btn-lift"
            style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
          >
            Retry
          </button>
        </div>
      ) : !state || !tokens ? (
        <PoolsSkeleton count={Math.max(1, Math.min(pool.tokenCount, 3))} />
      ) : state.lpSupply === 0n ? (
        // The contract takes nothing single-sided until a first deposit has
        // funded every asset (#12 FirstDepositNotFull), so an empty pool gets
        // the seed flow instead of cards whose Deposit would fail.
        <div
          className="p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px dashed var(--c-border-2)' }}
        >
          <p className="text-[13px] max-w-xl" style={{ color: 'var(--c-text-muted)' }}>
            This pool is empty. Its first deposit has to fund every asset at once, and that is what
            sets the ratio it starts quoting at.
          </p>
          <button
            onClick={onSeed}
            className="px-4 py-2 text-[13px] font-semibold rounded-xl btn-lift"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Seed liquidity
          </button>
        </div>
      ) : (
        <PoolsGrid
          tokens={tokens}
          onSelectToken={(token, mode) => (mode === 'deposit' ? onDeposit(token) : onWithdraw(token))}
          detailsHref={(token) => (pool.isConfigPool ? `/pools/${token.symbol.toLowerCase()}` : pool.href)}
          showPreview={pool.isConfigPool}
          paused={state.paused}
        />
      )}
    </section>
  )
}

function PoolsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
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
