import {
  aRightNarrative,
  assetsNarrative,
  curveNarrative,
  feeNarrative,
  fmtAmp,
  impactMeterPct,
  lpEarnPerMillion,
  priceImpactPct,
  type ARight,
  type TokenMeta,
} from '../../lib/stellar/poolParams'
import TokenIcon from '../TokenIcon'
import Tooltip from '../Tooltip'
import CurveSketch from './CurveSketch'
import TickNumber from './TickNumber'

// The sticky preview: the row this pool will occupy in /pools, plus the
// curve, two figures and three sentences that move with every input.
// Building this card is the point of the page, so it gets the motion budget:
// numbers tick, the curve tweens, and on a discrete choice the whole card
// dissolves between scenes (view-transition-name below, CSS in global.css).

interface PoolPreviewCardProps {
  tokens: TokenMeta[]
  name: string
  amp: number
  aRight: ARight
  feePct: number
  owner: string | null
  state: 'draft' | 'deploying' | 'live'
  /** Set when live: labels the pool as demo or on-chain. */
  backendLabel?: string
}

const fmtImpact = (v: number) => (v < 0.0005 ? '<0.001%' : `${v.toFixed(3)}%`)
const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`

export default function PoolPreviewCard({
  tokens,
  name,
  amp,
  aRight,
  feePct,
  owner,
  state,
  backendLabel,
}: PoolPreviewCardProps) {
  const n = Math.max(2, tokens.length)
  const impact = priceImpactPct(amp, n)
  const earn = lpEarnPerMillion(feePct)
  const live = state === 'live'
  const symbols = tokens.map((t) => t.symbol)
  const pair: [string, string] | undefined = tokens.length >= 2 ? [symbols[0], symbols[1]] : undefined
  const lines = [assetsNarrative(symbols), curveNarrative(amp), aRightNarrative(aRight), feeNarrative(feePct)]

  return (
    <div
      className={`pool-preview rounded-2xl overflow-hidden transition-all duration-500 ${live ? 'animate-bounce-in' : ''}`}
      style={{
        viewTransitionName: 'pool-preview',
        backgroundColor: 'var(--c-surface)',
        border: `1px solid ${live ? '#22c55e' : 'var(--c-border)'}`,
        boxShadow: live ? '0 0 0 4px rgba(34,197,94,0.12)' : 'var(--c-card-shadow)',
      }}
    >
      {/* The /pools row */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="flex shrink-0 min-w-[30px]">
          {tokens.length === 0 ? (
            <div
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px]"
              style={{ backgroundColor: 'var(--c-surface-2)', border: '1px dashed var(--c-border-2)', color: 'var(--c-text-faint)' }}
            >
              ?
            </div>
          ) : (
            tokens.map((t, i) => (
              <div
                key={t.address}
                className="animate-bounce-in"
                style={{ marginLeft: i === 0 ? 0 : -10, zIndex: tokens.length - i, animationDuration: '0.5s', animationDelay: `${i * 50}ms` }}
              >
                <TokenIcon symbol={t.symbol} size={30} />
              </div>
            ))
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
            {name || 'Pick assets'}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
            A = {fmtAmp(amp)} · {feePct}% fee · {tokens.length} {tokens.length === 1 ? 'asset' : 'assets'}
          </p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>APY</p>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--c-accent)' }}>—</p>
        </div>
      </div>

      {/* Curve */}
      {/* Hovering the chart (or tabbing to it) fades in a small note on what
          the axes mean. It sits under the top-right label, the one corner the
          curve leaves empty. */}
      <div className="curve-hover relative px-4 pt-3" tabIndex={0} aria-describedby="curve-hint">
        <span className="absolute right-5 top-3 text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
          vs constant product
        </span>
        <p id="curve-hint" className="curve-hint" role="note">
          How much of each asset the pool holds, 100 apiece at balance. The curve is every mix it accepts at your A.
        </p>
        <CurveSketch amp={amp} n={n} pair={pair} className="w-full h-auto block" />
      </div>

      {/* What the choices mean, one line each. Learn mode only. Keyed by text so a changed
          sentence is a new node: the scene transition dissolves it, and the
          no-view-transition fallback plays blurIn on it. */}
      <div className="learn-only px-4 pt-2 pb-1 space-y-1 text-[12px] leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
        {lines.map((text) => (
          <p key={text} className="preview-line">{text}</p>
        ))}
      </div>

      {/* Figures */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 pt-2 pb-3.5 text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
        <span className="flex items-center">
          Price impact, $10k swap
          <Tooltip text={`Simulated on a balanced pool holding $1M of each of your ${n} assets, with your A. Fees excluded. A smaller or lopsided pool costs more.`} label="About price impact" />
        </span>
        <TickNumber value={impact} format={fmtImpact} className="font-medium" style={{ color: 'var(--c-text)' }} />
        <div className="col-span-2 h-1 rounded-full overflow-hidden -mt-0.5 mb-1" style={{ backgroundColor: 'var(--c-surface-2)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${impactMeterPct(impact)}%`, backgroundColor: 'var(--c-accent)', transitionTimingFunction: 'cubic-bezier(0.2,0.8,0.2,1)' }}
          />
        </div>
        <span>LPs earn per $1M daily volume</span>
        <TickNumber value={earn} format={fmtUsd} className="font-medium" style={{ color: 'var(--c-text)' }} />
        <span>Right to change A</span>
        <span className="font-medium" style={{ color: 'var(--c-text)' }}>
          {aRight === 'flexible' ? 'Flexible · Spreadless' : owner ? 'Fixed · no owner' : 'Fixed'}
        </span>
      </div>

      {/* State line */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-[12px]"
        style={{ borderTop: '1px solid var(--c-border)', color: live ? '#16a34a' : 'var(--c-text-muted)' }}
      >
        <span
          className="w-[7px] h-[7px] rounded-full shrink-0 transition-colors"
          style={{
            backgroundColor: live ? '#22c55e' : state === 'deploying' ? 'var(--c-accent)' : 'var(--c-text-faint)',
            animation: live ? 'pulseRing 1.6s ease-out 3' : state === 'deploying' ? 'pulseRing 1.2s ease-out infinite' : undefined,
          }}
        />
        {live
          ? `Live · Empty · Seed liquidity${backendLabel ? ` · ${backendLabel}` : ''}`
          : state === 'deploying'
            ? 'Deploying…'
            : 'Draft · not deployed'}
      </div>
    </div>
  )
}
