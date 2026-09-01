import { lpEarnPerMillion, priceImpactPct, type TokenMeta } from '../../lib/stellar/poolParams'
import { shortenAddress } from '../../lib/utils'
import TokenIcon from '../TokenIcon'
import Tooltip from '../Tooltip'
import CurveSketch from './CurveSketch'
import TickNumber from './TickNumber'

// The sticky preview: the row this pool will occupy in /pools, plus the
// curve and two figures that move with every input. Building this card is
// the point of the page, so it gets the motion budget.

interface PoolPreviewCardProps {
  tokens: TokenMeta[]
  name: string
  amp: number
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
  feePct,
  owner,
  state,
  backendLabel,
}: PoolPreviewCardProps) {
  const impact = priceImpactPct(amp)
  const earn = lpEarnPerMillion(feePct)
  const live = state === 'live'

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all duration-500 ${live ? 'animate-bounce-in' : ''}`}
      style={{
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
            A = {amp} · {feePct}% fee · {tokens.length} {tokens.length === 1 ? 'asset' : 'assets'}
          </p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>APY</p>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--c-accent)' }}>—</p>
        </div>
      </div>

      {/* Curve */}
      <div className="relative px-4 pt-3">
        <span className="absolute right-5 top-3 text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
          vs constant product
        </span>
        <CurveSketch amp={amp} className="w-full h-auto block" />
      </div>

      {/* Figures */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 pt-2 pb-3.5 text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
        <span className="flex items-center">
          Price impact, $10k swap
          <Tooltip text="Simulated on a balanced $1M / $1M pool with your A. Fees excluded." label="About price impact" />
        </span>
        <TickNumber value={impact} format={fmtImpact} className="font-medium" style={{ color: 'var(--c-text)' }} />
        <div className="col-span-2 h-1 rounded-full overflow-hidden -mt-0.5 mb-1" style={{ backgroundColor: 'var(--c-surface-2)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, (impact / 0.05) * 100)}%`, backgroundColor: 'var(--c-accent)', transitionTimingFunction: 'cubic-bezier(0.2,0.8,0.2,1)' }}
          />
        </div>
        <span>LPs earn per $1M daily volume</span>
        <TickNumber value={earn} format={fmtUsd} className="font-medium" style={{ color: 'var(--c-text)' }} />
        <span>Owner</span>
        <span className="font-medium tabular-nums" style={{ color: 'var(--c-text)' }}>
          {owner ? shortenAddress(owner) : 'Connect wallet'}
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
