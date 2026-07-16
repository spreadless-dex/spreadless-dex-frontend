import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { formatCurrency, shortenAddress } from '../lib/utils'
import { fromRawUnits } from '../lib/stellar/units'
import { getLpBalance, LP_DECIMALS } from '../lib/stellar/pool'
import { getPoolPreviewStats } from '../lib/mockPoolStats'
import { POOL_CONTRACT_ID, explorerContractUrl } from '../lib/stellar/config'
import { POOL_COPY, FALLBACK_COPY } from './PoolCard'
import PoolDetailModal from './PoolDetailModal'
import TokenIcon from './TokenIcon'
import { ArrowLeft, ExternalLink } from 'lucide-react'

interface PoolDetailPageProps {
  /** Canonical token symbol this route was built for (from getStaticPaths). */
  symbol: string
}

export default function PoolDetailPage({ symbol }: PoolDetailPageProps) {
  const {
    poolState,
    poolStatus,
    poolError,
    loadPoolState,
    walletConnected,
    walletAddress,
  } = useAppStore()

  const [lpBalance, setLpBalance] = useState<bigint | null>(null)
  const [actionMode, setActionMode] = useState<'deposit' | 'withdraw' | null>(null)

  useEffect(() => {
    loadPoolState()
  }, [loadPoolState])

  useEffect(() => {
    if (!walletAddress) {
      setLpBalance(null)
      return
    }
    let cancelled = false
    getLpBalance(walletAddress)
      .then((bal) => { if (!cancelled) setLpBalance(bal) })
      .catch(() => { if (!cancelled) setLpBalance(null) })
    return () => { cancelled = true }
  }, [walletAddress])

  const token = poolState?.tokens.find(
    (t) => t.symbol.toLowerCase() === symbol.toLowerCase(),
  )
  const preview = getPoolPreviewStats(symbol)
  const copy = POOL_COPY[symbol] ?? FALLBACK_COPY

  // Your proportional slice of this token's reserve — same math as MyLiquidity.
  const lpHuman = lpBalance !== null ? Number(fromRawUnits(lpBalance, LP_DECIMALS)) : 0
  const yourShare =
    poolState && poolState.lpSupplyHuman > 0 ? lpHuman / poolState.lpSupplyHuman : 0
  const yourLiquidity = token ? yourShare * token.reserveHuman : 0

  const backLink = (
    <a
      href="/pools"
      className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
      style={{ color: 'var(--c-text-muted)' }}
    >
      <ArrowLeft size={16} strokeWidth={1.8} />
      All pools
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
            className="px-5 py-2.5 text-sm font-semibold rounded-xl btn-lift"
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

  // Pool is loaded but this symbol isn't among the on-chain tokens (e.g. the
  // pool was redeployed with a different asset set than our route slugs).
  if (!token) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        {backLink}
        <div
          className="mt-6 p-8 rounded-2xl text-center"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            No pool token named "{symbol}" is currently in the pool.
          </p>
        </div>
      </div>
    )
  }

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
            <TokenIcon symbol={token.symbol} size={56} />
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--c-text-faint)' }}>
                {copy.eyebrow}
              </p>
              <h1 className="text-3xl font-bold leading-tight" style={{ color: 'var(--c-text)' }}>
                {token.symbol}
              </h1>
            </div>
          </div>
          <p className="text-sm leading-relaxed mt-4 max-w-xl" style={{ color: 'var(--c-text-muted)' }}>
            {copy.blurb}
          </p>
        </div>

        <div className="flex gap-2 sm:flex-col sm:w-40 shrink-0">
          <button
            onClick={() => setActionMode('deposit')}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl btn-lift"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Deposit
          </button>
          <button
            onClick={() => setActionMode('withdraw')}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl btn-lift"
            style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* ── Key metrics ─────────────────────────────────────────── */}
      <div
        className="mt-8 grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        {[
          { label: 'APY', value: `${preview.apy.toFixed(1)}%`, accent: true, isPreview: true },
          { label: 'TVL (this asset)', value: formatCurrency(token.reserveHuman) },
          { label: 'Pool Share', value: `${token.share.toFixed(1)}%` },
          { label: '24h Volume', value: formatCurrency(preview.volume24h), isPreview: true },
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
                  backgroundColor: t.symbol === token.symbol ? 'var(--c-accent)' : 'var(--c-text-faint)',
                  opacity: t.symbol === token.symbol ? 1 : 0.35 + (0.15 * ((i % 3))),
                  borderLeft: i > 0 ? '1px solid var(--c-surface)' : 'none',
                }}
                title={`${t.symbol} · ${t.share.toFixed(1)}%`}
              />
            ))}
          </div>

          <div className="space-y-3">
            {poolState.tokens.map((t) => {
              const active = t.symbol === token.symbol
              return (
                <div key={t.address} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <TokenIcon symbol={t.symbol} size={26} />
                    <span
                      className="text-sm font-semibold"
                      style={{ color: active ? 'var(--c-accent)' : 'var(--c-text)' }}
                    >
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
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── Pool parameters ───────────────────────────────────── */}
        <Section title="Parameters & health">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="Amplification (A)" value={`${poolState.amp}`} />
            <Field label="Pool type" value="StableSwap" />
            <Field
              label="Status"
              value={poolState.paused ? 'Paused' : 'Active'}
              valueColor={poolState.paused ? undefined : 'var(--c-text)'}
            />
            <Field label="LP supply" value={poolState.lpSupplyHuman.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Field label="Token decimals" value={String(token.decimals)} />
            <Field label="Holders" value={`${preview.holders.toLocaleString()}*`} />
          </dl>
        </Section>
      </div>

      {/* ── Your position (wallet-gated) ────────────────────────── */}
      {walletConnected && yourLiquidity > 0 && (
        <div className="mt-6">
          <Section title="Your position">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label={`${token.symbol} value`} value={`${yourLiquidity.toFixed(4)}`} />
              <Field label="≈ USD" value={formatCurrency(yourLiquidity)} />
              <Field label="Your pool share" value={`${(yourShare * 100).toFixed(3)}%`} />
            </div>
          </Section>
        </div>
      )}

      {/* ── How StableSwap works (invariant explainer) ──────────── */}
      <div className="mt-6">
        <Section title="How this pool works">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
            This is a <strong style={{ color: 'var(--c-text)' }}>StableSwap</strong> pool: all four
            assets are meant to be worth ≈ $1, so the pricing curve stays almost flat near balance
            and only steepens as the pool tilts far from an even split. That's what keeps slippage
            near zero for stablecoin swaps.
          </p>
          <p className="text-sm leading-relaxed mt-3" style={{ color: 'var(--c-text-muted)' }}>
            The <strong style={{ color: 'var(--c-text)' }}>amplification factor A = {poolState.amp}</strong>{' '}
            sets how flat that curve is. A higher A means tighter pricing while the pool is balanced,
            at the cost of a sharper move once one asset gets scarce. Single-sided deposits and
            withdrawals therefore carry a small bonus or penalty depending on whether they push the
            pool toward balance or away from it — the quote in the deposit dialog reflects this live.
          </p>
        </Section>
      </div>

      {/* ── Contracts & network ─────────────────────────────────── */}
      <div className="mt-6">
        <Section title="Contracts & network">
          <div className="space-y-3">
            <ContractRow label="Pool contract" id={POOL_CONTRACT_ID} />
            <ContractRow label={`${token.symbol} token`} id={token.address} />
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

      {actionMode && (
        <PoolDetailModal
          token={token}
          defaultMode={actionMode}
          hideDetailsLink
          onClose={() => {
            setActionMode(null)
            loadPoolState()
            if (walletAddress) getLpBalance(walletAddress).then(setLpBalance).catch(() => {})
          }}
        />
      )}
    </div>
  )
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
    >
      <div className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--c-text)' }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-faint)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

export function Field({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
        {label}
      </dt>
      <dd className="text-sm font-semibold" style={{ color: valueColor ?? 'var(--c-text)' }}>
        {value}
      </dd>
    </div>
  )
}

export function ContractRow({ label, id }: { label: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wider shrink-0" style={{ color: 'var(--c-text-faint)' }}>
        {label}
      </span>
      <a
        href={explorerContractUrl(id)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-mono transition-opacity hover:opacity-70"
        style={{ color: 'var(--c-text)' }}
        title={id}
      >
        {shortenAddress(id)}
        <ExternalLink size={13} strokeWidth={1.8} style={{ color: 'var(--c-text-faint)' }} />
      </a>
    </div>
  )
}
