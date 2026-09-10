import { useAppStore, type PoolToken } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { fromRawUnits } from '../lib/stellar/units'
import { LP_DECIMALS } from '../lib/stellar/pool'
import { positionShare, positionValue, type EarnPool } from '../lib/stellar/earnPools'
import TokenIcon from './TokenIcon'
import { ChevronRight } from 'lucide-react'

interface MyLiquidityProps {
  pools: EarnPool[]
  onWithdraw: (pool: EarnPool, token: PoolToken, kind: 'one' | 'all') => void
}

// The portfolio: every pool this wallet holds LP shares in, not just the
// configured one. A position's worth is the wallet's share of that pool's
// reserves, stablecoins at ≈ $1, the same assumption TVL makes everywhere.
export default function MyLiquidity({ pools, onWithdraw }: MyLiquidityProps) {
  const { walletConnected, connectWallet } = useAppStore()

  if (!walletConnected) {
    return (
      <div
        className="p-8 rounded-2xl text-center"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <p className="text-sm mb-4" style={{ color: 'var(--c-text-muted)' }}>
          Connect your wallet to see your liquidity positions.
        </p>
        <button
          onClick={connectWallet}
          className="px-6 py-3 text-sm font-semibold rounded-xl btn-lift"
          style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
        >
          Log In
        </button>
      </div>
    )
  }

  const positions = pools.filter((p) => p.state !== null && p.lp !== null && p.lp > 0n)
  // Pools answer one by one. Until each has, "no positions" would be a guess.
  const pending = pools.length === 0 || pools.some((p) => p.lpPending || (p.state === null && !p.failed))

  if (positions.length === 0) {
    if (pending) {
      return (
        <div
          className="rounded-2xl animate-shimmer"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-card-border)', height: 160 }}
        />
      )
    }
    return (
      <div
        className="p-8 rounded-2xl text-center"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
          You have no liquidity positions yet. Deposit into a pool to start earning.
        </p>
      </div>
    )
  }

  const totalValue = positions.reduce((sum, p) => sum + positionValue(p), 0)
  const assetCount = new Set(
    positions.flatMap((p) => p.state!.tokens.filter((t) => t.reserve > 0n).map((t) => t.address)),
  ).size

  return (
    <div>
      <div
        className="rounded-2xl p-6 mb-4"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-card-border)', boxShadow: 'var(--c-card-shadow)' }}
      >
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Estimated value', value: formatCurrency(totalValue) },
            { label: positions.length === 1 ? 'Position' : 'Positions', value: String(positions.length) },
            { label: 'Assets', value: String(assetCount) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
                {label}
              </p>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--c-text)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {pending && (
        <p className="text-[11px] mb-3" style={{ color: 'var(--c-text-faint)' }}>
          Still reading some pools…
        </p>
      )}

      <div className="space-y-4">
        {positions.map((pool) => (
          <PositionCard key={pool.address} pool={pool} onWithdraw={onWithdraw} />
        ))}
      </div>
    </div>
  )
}

function PositionCard({ pool, onWithdraw }: { pool: EarnPool; onWithdraw: MyLiquidityProps['onWithdraw'] }) {
  const state = pool.state!
  const share = positionShare(pool)
  const lpHuman = Number(fromRawUnits(pool.lp!, LP_DECIMALS))

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-card-border)', boxShadow: 'var(--c-card-shadow)' }}
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap">
        <a href={pool.href} className="group flex items-center gap-3 min-w-0">
          <div className="flex items-center shrink-0">
            {state.tokens.map((t, i) => (
              <div key={t.address} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: state.tokens.length - i }}>
                <TokenIcon symbol={t.symbol} size={30} />
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--c-text)' }}>
              {pool.label}
              <ChevronRight
                size={14}
                strokeWidth={1.8}
                className="transition-transform group-hover:translate-x-0.5"
                style={{ color: 'var(--c-text-faint)' }}
              />
            </p>
            <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
              {lpHuman.toFixed(4)} LP shares · {(share * 100).toFixed(2)}% of pool
            </p>
          </div>
        </a>
        <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--c-text)' }}>
          {formatCurrency(positionValue(pool))}
        </p>
      </div>

      {state.tokens.map((t) => {
        const yours = share * t.reserveHuman
        if (yours <= 0) return null
        return (
          <div
            key={t.address}
            className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: '1px solid var(--c-border)' }}
          >
            <div className="flex items-center gap-3">
              <TokenIcon symbol={t.symbol} size={28} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{t.symbol}</p>
                <p className="text-xs" style={{ color: 'var(--c-text-faint)' }}>
                  ≈ {yours.toFixed(4)} {t.symbol}
                </p>
              </div>
            </div>
            <button
              onClick={() => onWithdraw(pool, t, 'one')}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-[0.99]"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            >
              Withdraw
            </button>
          </div>
        )
      })}

      <div
        className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap"
        style={{ borderTop: '1px solid var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}
      >
        <p className="learn-only text-[11px] leading-relaxed" style={{ color: 'var(--c-text-faint)' }}>
          Or take a proportional slice of every asset. It leaves the pool's balance alone, so there is
          no imbalance fee.
        </p>
        <button
          onClick={() => onWithdraw(pool, state.tokens[0], 'all')}
          className="ml-auto px-4 py-2 text-xs font-semibold rounded-lg btn-lift"
          style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
        >
          Withdraw all assets
        </button>
      </div>
    </div>
  )
}
