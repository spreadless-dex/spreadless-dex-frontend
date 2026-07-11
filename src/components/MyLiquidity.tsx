import { useState, useEffect } from 'react'
import { useAppStore, type PoolToken } from '../store/useAppStore'
import { getLpBalance, LP_DECIMALS } from '../lib/stellar/pool'
import { fromRawUnits } from '../lib/stellar/units'
import { formatCurrency } from '../lib/utils'
import { getPoolPreviewStats } from '../lib/mockPoolStats'
import PoolDetailModal from './PoolDetailModal'
import TokenIcon from './TokenIcon'

export default function MyLiquidity() {
  const { poolState, walletConnected, walletAddress, connectWallet } = useAppStore()
  const [lpBalance, setLpBalance] = useState<bigint | null>(null)
  const [withdrawToken, setWithdrawToken] = useState<PoolToken | null>(null)

  // poolState in the deps: the withdraw modal rendered below refreshes the
  // pool state after a tx lands, and that's our cue to refetch the LP balance
  // — otherwise the list keeps showing the pre-withdraw position.
  useEffect(() => {
    if (!walletAddress) {
      setLpBalance(null)
      return
    }
    let cancelled = false
    getLpBalance(walletAddress).then((b) => {
      if (!cancelled) setLpBalance(b)
    })
    return () => {
      cancelled = true
    }
  }, [walletAddress, poolState])

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
          className="px-6 py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
          style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  // Resolves quickly — no skeleton needed, same call as SwapWidget's pool load.
  if (!poolState || lpBalance === null) return null

  if (lpBalance <= 0n) {
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

  const lpBalanceHuman = Number(fromRawUnits(lpBalance, LP_DECIMALS))
  const shareOfSupply = poolState.lpSupplyHuman > 0 ? lpBalanceHuman / poolState.lpSupplyHuman : 0
  const estimatedValue = shareOfSupply * poolState.totalTvl

  // Weighted by each token's share of the pool — a static proxy for now,
  // same "Preview data" caveat as the per-pool APY figures.
  const totalApy = poolState.tokens.reduce(
    (sum, t) => sum + getPoolPreviewStats(t.symbol).apy * (t.share / 100),
    0,
  )

  return (
    <div>
      <div
        className="rounded-2xl p-6 mb-4"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-card-border)', boxShadow: 'var(--c-card-shadow)' }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
              Your LP Balance
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
              {lpBalanceHuman.toFixed(4)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
              Estimated Value
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
              {formatCurrency(estimatedValue)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
              Pool Share
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
              {(shareOfSupply * 100).toFixed(2)}%
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
                Total APY
              </p>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-faint)' }}
              >
                Preview
              </span>
            </div>
            <p className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
              {totalApy.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <p className="text-[11px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text-faint)' }}>
        Your position by asset
      </p>
      <div className="space-y-2">
        {poolState.tokens.map((t) => {
          const yourReserve = shareOfSupply * t.reserveHuman
          if (yourReserve <= 0) return null
          return (
            <div
              key={t.address}
              className="flex items-center justify-between p-4 rounded-xl"
              style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            >
              <div className="flex items-center gap-3">
                <TokenIcon symbol={t.symbol} size={36} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{t.symbol}</p>
                  <p className="text-xs" style={{ color: 'var(--c-text-faint)' }}>
                    ≈ {yourReserve.toFixed(4)} {t.symbol}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWithdrawToken(t)}
                className="px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-[0.99]"
                style={{ border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              >
                Withdraw
              </button>
            </div>
          )
        })}
      </div>

      {withdrawToken && (
        <PoolDetailModal token={withdrawToken} onClose={() => setWithdrawToken(null)} defaultMode="withdraw" />
      )}
    </div>
  )
}
