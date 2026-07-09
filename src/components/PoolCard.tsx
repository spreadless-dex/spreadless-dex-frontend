import type { PoolToken } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { fromRawUnits } from '../lib/stellar/units'
import { getPoolPreviewStats } from '../lib/mockPoolStats'

interface PoolCardProps {
  token: PoolToken
  onClick: () => void
  index?: number
}

export default function PoolCard({ token, onClick, index = 0 }: PoolCardProps) {
  const reserve = fromRawUnits(token.reserve, token.decimals)
  const preview = getPoolPreviewStats(token.symbol)

  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:scale-[1.01] animate-fade-up"
      style={{
        backgroundColor: 'var(--c-surface)',
        border: '1px solid var(--c-card-border)',
        boxShadow: 'var(--c-card-shadow)',
        animationDelay: `${index * 0.07}s`,
      }}
    >
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
          style={{
            backgroundColor: 'var(--c-surface-2)',
            border: '1px solid var(--c-border)',
            color: 'var(--c-text-muted)',
          }}
        >
          {token.symbol.replace(/^s/i, '').slice(0, 2)}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--c-text)' }}>
            {token.symbol}
          </p>
          <p className="text-xs" style={{ color: 'var(--c-text-faint)' }}>
            StableSwap pool
          </p>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-4xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>
          {formatCurrency(token.reserveHuman)}
        </p>
        <p className="text-[11px] mt-1.5 uppercase tracking-widest" style={{ color: 'var(--c-text-faint)' }}>
          Pool Liquidity
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-3 mb-4 pt-5"
        style={{ borderTop: '1px solid var(--c-border)' }}
      >
        {[
          { label: 'Reserve', value: `${reserve} ${token.symbol}` },
          { label: 'Pool Share', value: `${token.share.toFixed(1)}%` },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
              {label}
            </p>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-3 gap-2 mb-5 p-3 rounded-lg"
        style={{ backgroundColor: 'var(--c-surface-2)', border: '1px dashed var(--c-border-2)' }}
      >
        <div className="col-span-3 mb-0.5">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
            Preview data
          </span>
        </div>
        {[
          { label: 'APY', value: `${preview.apy.toFixed(1)}%` },
          { label: 'Holders', value: preview.holders.toLocaleString() },
          { label: '24h Vol', value: formatCurrency(preview.volume24h) },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-text-faint)' }}>
              {label}
            </p>
            <p className="text-xs font-medium truncate" style={{ color: 'var(--c-text-muted)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <button
        className="w-full py-2.5 text-sm rounded-xl transition-all duration-200"
        style={{
          color: 'var(--c-text-muted)',
          border: '1px solid var(--c-border)',
        }}
      >
        Deposit {token.symbol}
      </button>
    </div>
  )
}
