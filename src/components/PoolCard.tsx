import type { PoolToken } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { getPoolPreviewStats } from '../lib/mockPoolStats'

type CardMode = 'deposit' | 'withdraw'

interface PoolCardProps {
  token: PoolToken
  onAction: (mode: CardMode) => void
  index?: number
}

// Editorial copy per pool asset — answers "who is this for and what happens
// to my money" in plain language. Same symbol-keyed-with-fallback pattern as
// mockPoolStats, for the day the pool is redeployed with new assets.
const POOL_COPY: Record<string, { eyebrow: string; blurb: string }> = {
  sDAI: {
    eyebrow: 'For DeFi-native depositors',
    blurb:
      'Your sDAI works in the shared four-stablecoin pool and earns a slice of every swap. If one stable wobbles, the pool absorbs it together.',
  },
  sUSDT: {
    eyebrow: 'For most depositors',
    blurb:
      'The busiest asset in the pool. Deposits earn swap fees from all four stables and can be withdrawn again at any time.',
  },
  SUSD: {
    eyebrow: 'For early adopters',
    blurb:
      'The pool’s native, scarcest stable — highest preview yield, but it leans hardest on pool health in rough times.',
  },
  sUSDC: {
    eyebrow: 'For cautious depositors',
    blurb:
      'The most widely held stable here. Steady fee income from every swap, instant withdrawals, no surprises.',
  },
}

const FALLBACK_COPY = {
  eyebrow: 'For depositors',
  blurb:
    'Deposit into the shared StableSwap pool and earn a share of every swap fee. Withdraw again at any time.',
}

export default function PoolCard({ token, onAction, index = 0 }: PoolCardProps) {
  const preview = getPoolPreviewStats(token.symbol)
  const copy = POOL_COPY[token.symbol] ?? FALLBACK_COPY

  return (
    <div
      className="group relative flex flex-col rounded-2xl p-6 transition-all duration-200 hover:scale-[1.01] animate-fade-up"
      style={{
        backgroundColor: 'var(--c-surface)',
        border: '1px solid var(--c-card-border)',
        boxShadow: 'var(--c-card-shadow)',
        animationDelay: `${index * 0.07}s`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-5">
        {['Stellar Testnet', 'No lockup'].map((badge) => (
          <span
            key={badge}
            className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-faint)' }}
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{
            backgroundColor: 'var(--c-surface-2)',
            border: '1px solid var(--c-border)',
            color: 'var(--c-text-muted)',
          }}
        >
          {token.symbol.replace(/^s/i, '').slice(0, 2)}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--c-text-faint)' }}>
            {copy.eyebrow}
          </p>
          <p className="text-lg font-bold leading-tight" style={{ color: 'var(--c-text)' }}>
            {token.symbol}
          </p>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--c-text-muted)' }}>
        {copy.blurb}
      </p>

      {/* APY leads with the accent — the only colored figure on the card. */}
      <div
        className="grid grid-cols-3 rounded-xl mt-auto"
        style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
      >
        {[
          { label: 'APY', value: `${preview.apy.toFixed(1)}%`, accent: true, isPreview: true },
          { label: 'TVL', value: formatCurrency(token.reserveHuman) },
          { label: 'Holders', value: preview.holders.toLocaleString(), isPreview: true },
        ].map(({ label, value, accent, isPreview }, i) => (
          <div
            key={label}
            className="px-3 py-2.5"
            title={isPreview ? 'Preview data — live metrics coming soon' : undefined}
            style={{ borderLeft: i > 0 ? '1px solid var(--c-border)' : 'none' }}
          >
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-text-faint)' }}>
              {label}
              {isPreview ? '*' : ''}
            </p>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: accent ? 'var(--c-accent)' : 'var(--c-text)' }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[9px] mt-1.5 mb-4 text-right" style={{ color: 'var(--c-text-faint)' }}>
        * Preview data
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onAction('deposit')}
          className="py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 hover:opacity-90 active:scale-[0.99]"
          style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
        >
          Deposit
        </button>
        <button
          onClick={() => onAction('withdraw')}
          className="py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 hover:opacity-80 active:scale-[0.99]"
          style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
        >
          Withdraw
        </button>
      </div>
    </div>
  )
}
