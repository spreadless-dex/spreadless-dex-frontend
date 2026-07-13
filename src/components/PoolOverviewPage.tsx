import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { fromRawUnits } from '../lib/stellar/units'
import { getPoolPreviewStats } from '../lib/mockPoolStats'
import { POOL_CONTRACT_ID } from '../lib/stellar/config'
import { Section, Field, ContractRow } from './PoolDetailPage'
import TokenIcon from './TokenIcon'
import { ArrowLeft } from 'lucide-react'

// Pool-wide transparency page — the "one real StableSwap pool" behind every
// single-sided deposit. Reached from the Pools register (one row → this page).
// Per-asset drill-down lives at /pools/[token]; the composition rows link there.
export default function PoolOverviewPage() {
  const { poolState, poolStatus, poolError, loadPoolState } = useAppStore()

  useEffect(() => {
    loadPoolState()
  }, [loadPoolState])

  const backLink = (
    <a
      href="/pools"
      className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
      style={{ color: 'var(--c-text-muted)' }}
    >
      <ArrowLeft size={16} strokeWidth={1.8} />
      Back to Earn
    </a>
  )

  if (poolStatus === 'error') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        {backLink}
        <div
          className="mt-6 p-8 rounded-2xl text-center"
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
      </div>
    )
  }

  if (poolStatus !== 'ready' || !poolState) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        {backLink}
        <div className="mt-6 grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl animate-shimmer"
              style={{
                backgroundColor: 'var(--c-surface)',
                border: '1px solid var(--c-card-border)',
                height: i === 0 ? 140 : 200,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // Pool-wide preview aggregates — an APY spread and summed 24h volume across
  // the assets. Same "Preview data" caveat as the per-asset figures.
  const apys = poolState.tokens.map((t) => getPoolPreviewStats(t.symbol).apy)
  const apyLo = Math.min(...apys)
  const apyHi = Math.max(...apys)
  const apyRange = apyLo === apyHi ? `${apyLo.toFixed(1)}%` : `${apyLo.toFixed(1)}–${apyHi.toFixed(1)}%`
  const volume24h = poolState.tokens.reduce((s, t) => s + getPoolPreviewStats(t.symbol).volume24h, 0)
  const holders = poolState.tokens.reduce((s, t) => s + getPoolPreviewStats(t.symbol).holders, 0)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {backLink}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-4">
            {['Stellar Testnet', 'No lockup', 'StableSwap'].map((badge) => (
              <span
                key={badge}
                className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-faint)' }}
              >
                {badge}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4">
            {/* Overlapping icon cluster — the whole pool, not one asset */}
            <div className="flex items-center shrink-0">
              {poolState.tokens.map((t, i) => (
                <div key={t.address} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: poolState.tokens.length - i }}>
                  <TokenIcon symbol={t.symbol} size={44} />
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--c-text-faint)' }}>
                {poolState.tokens.length}-stablecoin StableSwap pool
              </p>
              <h1 className="text-3xl font-bold leading-tight" style={{ color: 'var(--c-text)' }}>
                StableSwap Pool
              </h1>
            </div>
          </div>
          <p className="text-sm leading-relaxed mt-4 max-w-xl" style={{ color: 'var(--c-text-muted)' }}>
            One shared pool holding {poolState.tokens.map((t) => t.symbol).join(', ')}. Every deposit
            joins this pool and earns a slice of the fees from all swaps between the four stables.
          </p>
        </div>

        <div className="flex gap-2 sm:flex-col sm:w-40 shrink-0">
          <a
            href="/pools"
            className="flex-1 text-center py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 hover:opacity-90 active:scale-[0.99]"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Invest
          </a>
          <a
            href="/swap"
            className="flex-1 text-center py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 hover:opacity-80 active:scale-[0.99]"
            style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
          >
            Swap
          </a>
        </div>
      </div>

      {/* ── Key metrics ─────────────────────────────────────────── */}
      <div
        className="mt-8 grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        {[
          { label: 'APY range', value: apyRange, accent: true, isPreview: true },
          { label: 'Total value locked', value: formatCurrency(poolState.totalTvl) },
          { label: 'Pooled assets', value: String(poolState.tokens.length) },
          { label: '24h Volume', value: formatCurrency(volume24h), isPreview: true },
        ].map(({ label, value, accent, isPreview }, i) => (
          <div
            key={label}
            className="px-5 py-4"
            style={{
              borderLeft: i % 4 !== 0 ? '1px solid var(--c-border)' : 'none',
              borderTop: i >= 2 ? '1px solid var(--c-border)' : 'none',
            }}
            title={isPreview ? 'Preview data — live metrics coming soon' : undefined}
          >
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
              {label}{isPreview ? '*' : ''}
            </p>
            <p className="text-xl font-bold truncate" style={{ color: accent ? 'var(--c-accent)' : 'var(--c-text)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Pool composition ──────────────────────────────────── */}
        <Section title="Pool composition" subtitle={`${formatCurrency(poolState.totalTvl)} across ${poolState.tokens.length} assets`}>
          {/* Stacked share bar */}
          <div className="flex h-2.5 rounded-full overflow-hidden mb-5" style={{ backgroundColor: 'var(--c-surface-2)' }}>
            {poolState.tokens.map((t, i) => (
              <div
                key={t.address}
                style={{
                  width: `${t.share}%`,
                  backgroundColor: 'var(--c-text-faint)',
                  opacity: 0.4 + 0.15 * (i % 4),
                  borderLeft: i > 0 ? '1px solid var(--c-surface)' : 'none',
                }}
                title={`${t.symbol} · ${t.share.toFixed(1)}%`}
              />
            ))}
          </div>

          <div className="space-y-1">
            {poolState.tokens.map((t) => (
              <a
                key={t.address}
                href={`/pools/${t.symbol.toLowerCase()}`}
                className="flex items-center justify-between -mx-2 px-2 py-2 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
              >
                <div className="flex items-center gap-2.5">
                  <TokenIcon symbol={t.symbol} size={26} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    {t.symbol}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums" style={{ color: 'var(--c-text)' }}>
                    {formatCurrency(t.reserveHuman)}
                  </p>
                  <p className="text-[11px] tabular-nums" style={{ color: 'var(--c-text-faint)' }}>
                    {t.share.toFixed(1)}% · {Number(fromRawUnits(t.reserve, t.decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.symbol}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </Section>

        {/* ── Pool parameters ───────────────────────────────────── */}
        <Section title="Parameters & health">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="Amplification (A)" value={`${poolState.amp}`} />
            <Field label="Pool type" value="StableSwap" />
            <Field label="Status" value={poolState.paused ? 'Paused' : 'Active'} />
            <Field label="LP supply" value={poolState.lpSupplyHuman.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Field label="Pooled assets" value={String(poolState.tokens.length)} />
            <Field label="Holders" value={`${holders.toLocaleString()}*`} />
          </dl>
        </Section>
      </div>

      {/* ── How StableSwap works ────────────────────────────────── */}
      <div className="mt-6">
        <Section title="How this pool works">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
            This is a <strong style={{ color: 'var(--c-text)' }}>StableSwap</strong> pool: all{' '}
            {poolState.tokens.length} assets are meant to be worth ≈ $1, so the pricing curve stays
            almost flat near balance and only steepens as the pool tilts far from an even split.
            That's what keeps slippage near zero for stablecoin swaps.
          </p>
          <p className="text-sm leading-relaxed mt-3" style={{ color: 'var(--c-text-muted)' }}>
            The <strong style={{ color: 'var(--c-text)' }}>amplification factor A = {poolState.amp}</strong>{' '}
            sets how flat that curve is. A higher A means tighter pricing while the pool is balanced,
            at the cost of a sharper move once one asset gets scarce. Single-sided deposits and
            withdrawals therefore carry a small bonus or penalty depending on whether they push the
            pool toward balance or away from it.
          </p>
        </Section>
      </div>

      {/* ── Contracts & network ─────────────────────────────────── */}
      <div className="mt-6">
        <Section title="Contracts & network">
          <div className="space-y-3">
            <ContractRow label="Pool contract" id={POOL_CONTRACT_ID} />
            {poolState.tokens.map((t) => (
              <ContractRow key={t.address} label={`${t.symbol} token`} id={t.address} />
            ))}
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
                Network
              </span>
              <span className="text-sm" style={{ color: 'var(--c-text)' }}>
                Stellar Testnet
              </span>
            </div>
          </div>
        </Section>
      </div>

      <p className="text-[11px] mt-6 leading-relaxed" style={{ color: 'var(--c-text-faint)' }}>
        * APY, holder count and 24h volume are preview figures — the contract doesn't expose these
        yet. Reserves, TVL, pool share, amplification and LP supply are read live from the chain.
      </p>
    </div>
  )
}
