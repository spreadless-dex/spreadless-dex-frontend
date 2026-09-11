import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useAppStore, type PoolToken } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { positionValue, useEarnPools, type EarnPool } from '../lib/stellar/earnPools'
import { earnAssets, type EarnAsset } from '../lib/stellar/earnAssets'
import PoolDetailModal from './PoolDetailModal'
import SeedLiquidityModal from './SeedLiquidityModal'
import MyLiquidity from './MyLiquidity'
import PositionSummary from './PositionSummary'
import EarnAssetList from './earn/EarnAssetList'
import DepositSheet, { settleSheetTransition } from './earn/DepositSheet'
import { TrendingUp, Layers, Coins, Wallet } from 'lucide-react'

type Tab = 'invest' | 'portfolio'
type WithdrawKind = 'one' | 'all'

interface Withdrawal {
  pool: EarnPool
  token: PoolToken
  kind: WithdrawKind
}

interface OpenSheet {
  address: string
  viaTransition: boolean
}

// Earn is the action surface (issue #28): Invest puts money into a pool one
// asset at a time, Portfolio shows what the wallet holds and takes it out
// again. Invest lists each token once, however many pools hold it; the
// deposit sheet then preselects the best pool and lets the user pick another,
// because the same asset in two pools is two different deposits: different
// rate, depth, fee and neighbours.
const TAB_SUBTITLE: Record<Tab, string> = {
  invest: 'Pick an asset. Your deposit goes to its best pool, and you can choose another one before you sign.',
  portfolio: 'Your liquidity positions across every pool.',
}

const SHEET_CLOSE_MS = 280

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const canTransition = () => 'startViewTransition' in document && !reducedMotion()

// The page behind the sheet does not scroll. The lock is only switched while
// no transition is capturing, so the page never reflows between the two
// snapshots of the icon's flight.
function lockScroll(on: boolean) {
  const root = document.documentElement
  if (on) {
    root.classList.toggle('earn-gutter', window.innerWidth > root.clientWidth)
    root.classList.add('earn-locked')
  } else {
    root.classList.remove('earn-locked', 'earn-gutter')
  }
}

const warnSkipped = (err: unknown) =>
  console.warn('Earn: sheet transition skipped:', err instanceof Error ? err.message : err)

export default function PoolsPage() {
  const { walletAddress, walletConnected } = useAppStore()
  const { pools, loading, error, refresh, retry, reload } = useEarnPools(walletAddress)

  const [tab, setTab] = useState<Tab>('invest')
  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(null)
  const [seeding, setSeeding] = useState<EarnPool | null>(null)
  const [sheet, setSheet] = useState<OpenSheet | null>(null)

  const loaded = pools.flatMap((p) => (p.state ? [p.state] : []))
  const totalTvl = loaded.reduce((sum, s) => sum + s.totalTvl, 0)
  const funded = loaded.filter((s) => s.lpSupply > 0n).length
  const assetCount = new Set(loaded.flatMap((s) => s.tokens.map((t) => t.address))).size
  const positions = pools.filter((p) => p.state !== null && p.lp !== null && p.lp > 0n)
  const depositedValue = positions.reduce((sum, p) => sum + positionValue(p), 0)

  const assets = earnAssets(pools)
  const pending = loading || pools.some((p) => p.state === null && !p.failed)
  const failed = pools.filter((p) => p.failed)
  const sheetAsset = sheet ? (assets.find((a) => a.address === sheet.address) ?? null) : null

  useEffect(() => {
    if (!sheet) lockScroll(false)
  }, [sheet])

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

  const openWithdraw = (pool: EarnPool, token: PoolToken, kind: WithdrawKind) => setWithdrawal({ pool, token, kind })

  // Opening the sheet is one view transition: the tapped row's icon flies
  // into the sheet's header while the sheet rises. The page's own transition
  // names are off for that moment (html.earn-vt, see global.css).
  const openAsset = (asset: EarnAsset, icon: HTMLElement) => {
    if (sheet) return
    if (!canTransition()) {
      setSheet({ address: asset.address, viaTransition: false })
      lockScroll(true)
      return
    }
    const root = document.documentElement
    root.classList.add('earn-vt')
    icon.style.viewTransitionName = 'earn-token'
    const vt = document.startViewTransition(() => {
      icon.style.viewTransitionName = ''
      flushSync(() => setSheet({ address: asset.address, viaTransition: true }))
    })
    vt.ready.catch(warnSkipped)
    vt.finished.finally(() => {
      root.classList.remove('earn-vt')
      settleSheetTransition()
      if (document.querySelector('[data-earn-sheet]')) lockScroll(true)
    })
  }

  // Closing runs the same flight backwards. A sheet dragged away, or closed
  // to make room for another dialog, just slides out.
  const closeSheet = (plain = false) => {
    const current = sheet
    if (!current) return
    const dialog = document.querySelector<HTMLDialogElement>('[data-earn-sheet]')
    const icon = document.querySelector<HTMLElement>('[data-sheet-icon]')
    const rowIcon = document.querySelector<HTMLElement>(`[data-earn-row="${current.address}"] [data-earn-icon]`)
    lockScroll(false)
    if (plain || !canTransition() || !dialog || !icon || !rowIcon) {
      dialog?.close()
      window.setTimeout(() => setSheet(null), SHEET_CLOSE_MS)
      return
    }
    const root = document.documentElement
    root.classList.add('earn-vt')
    icon.style.viewTransitionName = 'earn-token'
    dialog.style.viewTransitionName = 'earn-sheet'
    const vt = document.startViewTransition(() => {
      flushSync(() => setSheet(null))
      rowIcon.style.viewTransitionName = 'earn-token'
    })
    vt.ready.catch(warnSkipped)
    vt.finished.finally(() => {
      root.classList.remove('earn-vt')
      rowIcon.style.viewTransitionName = ''
    })
  }

  const seedFromSheet = (pool: EarnPool) => {
    closeSheet(true)
    window.setTimeout(() => setSeeding(pool), SHEET_CLOSE_MS)
  }

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
        ) : (
          <div className="max-w-2xl">
            <PositionSummary
              value={depositedValue}
              count={positions.length}
              onViewDetails={() => setTab('portfolio')}
            />

            <EarnAssetList assets={assets} pending={pending} lent={sheet?.address ?? null} onOpen={openAsset} />

            {failed.length > 0 && (
              <div
                className="mt-4 p-4 rounded-2xl flex items-center justify-between gap-4 flex-wrap"
                style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              >
                <p className="text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
                  {failed.length === 1 ? "One pool couldn't be read" : `${failed.length} pools couldn't be read`}, so
                  its assets are missing here.
                </p>
                <button
                  onClick={() => failed.forEach((p) => retry(p.address))}
                  className="px-4 py-2 text-[13px] font-semibold rounded-xl btn-lift"
                  style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {sheet && sheetAsset && (
        <DepositSheet
          key={sheet.address}
          asset={sheetAsset}
          viaTransition={sheet.viaTransition}
          onRequestClose={(opts) => closeSheet(opts?.dragged)}
          onSeed={seedFromSheet}
          onLanded={(address) => void refresh(address)}
        />
      )}

      {withdrawal && withdrawal.pool.state && (
        <PoolDetailModal
          token={withdrawal.token}
          defaultMode="withdraw"
          defaultWithdrawKind={withdrawal.kind}
          poolId={withdrawal.pool.address}
          poolTokens={withdrawal.pool.state.tokens}
          onLanded={() => void refresh(withdrawal.pool.address)}
          onClose={() => setWithdrawal(null)}
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
