import { useState, useEffect } from 'react'
import { useAppStore, type PoolToken } from '../store/useAppStore'
import { formatCurrency, shortenAddress, tokenAvatarLabel } from '../lib/utils'
import { refetchUntilChanged } from '../lib/stellar/refetch'
import { fromRawUnits, toRawUnits } from '../lib/stellar/units'
import {
  depositSingleSided,
  quoteDepositSingleSided,
  withdrawOneToken,
  quoteWithdrawOneToken,
  getLpBalance,
  LP_DECIMALS,
} from '../lib/stellar/pool'
import { getPoolPreviewStats } from '../lib/mockPoolStats'
import { mapTxError } from '../lib/stellar/errors'
import type { TxPhase } from '../lib/stellar/types'
import { recordDeposit, recordWithdraw } from '../lib/activity/record'
import RainButton from './RainButton'
import TxStatus, { type TxUiStatus } from './TxStatus'

interface PoolDetailModalProps {
  token: PoolToken
  onClose: () => void
  defaultMode?: Mode
}

type Mode = 'deposit' | 'withdraw' | 'sparplan'

export default function PoolDetailModal({ token, onClose, defaultMode = 'deposit' }: PoolDetailModalProps) {
  const {
    poolState,
    walletConnected,
    walletAddress,
    connectWallet,
    loadPoolState,
  } = useAppStore()

  const [mode, setMode] = useState<Mode>(defaultMode)
  const [mounted, setMounted] = useState(false)

  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<TxUiStatus>({ kind: 'idle' })
  const [txPhase, setTxPhase] = useState<TxPhase | null>(null)
  const [depositQuote, setDepositQuote] = useState('')
  const [depositQuoting, setDepositQuoting] = useState(false)

  const [lpAmount, setLpAmount] = useState('')
  const [lpBalance, setLpBalance] = useState<bigint | null>(null)
  const [withdrawQuote, setWithdrawQuote] = useState('')
  const [withdrawQuoting, setWithdrawQuoting] = useState(false)

  // Sparplan (recurring deposit) — static preview only, per doc item 5.
  const [sparFrequency, setSparFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly')
  const [sparAmount, setSparAmount] = useState('')

  useEffect(() => {
    setMounted(true)
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Pull the connected wallet's LP balance — used for the Withdraw tab and
  // for the "Your Liquidity" callout, so it's fetched regardless of mode.
  useEffect(() => {
    if (!walletAddress) {
      setLpBalance(null)
      return
    }
    let cancelled = false
    getLpBalance(walletAddress).then((bal) => {
      if (!cancelled) setLpBalance(bal)
    })
    return () => {
      cancelled = true
    }
  }, [walletAddress])

  // Live deposit quote, debounced — "you'll receive ~X LP" before committing.
  // Matters because single-sided deposits carry a bonus/malus depending on how
  // they shift the pool's balance. Simulation runs against the connected
  // account, so there's nothing to quote without a wallet.
  useEffect(() => {
    if (mode !== 'deposit' || !walletAddress || !amount) {
      setDepositQuote('')
      return
    }
    const amountRaw = toRawUnits(amount, token.decimals)
    if (amountRaw <= 0n) {
      setDepositQuote('')
      return
    }

    let cancelled = false
    setDepositQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const lp = await quoteDepositSingleSided({
          to: walletAddress,
          tokenIndex: token.index,
          amount: amountRaw,
        })
        if (!cancelled) setDepositQuote(fromRawUnits(lp, LP_DECIMALS))
      } catch (err) {
        // Simulation fails e.g. when the wallet can't cover the amount —
        // just show no quote rather than an error mid-typing.
        console.error('Deposit quote failed:', err)
        if (!cancelled) setDepositQuote('')
      } finally {
        if (!cancelled) setDepositQuoting(false)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, walletAddress, amount, token.index, token.decimals])

  // Live withdraw quote, debounced.
  useEffect(() => {
    if (mode !== 'withdraw' || !walletAddress || !lpAmount) {
      setWithdrawQuote('')
      return
    }
    const lpRaw = toRawUnits(lpAmount, LP_DECIMALS)
    if (lpRaw <= 0n) {
      setWithdrawQuote('')
      return
    }

    let cancelled = false
    setWithdrawQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const out = await quoteWithdrawOneToken({
          to: walletAddress,
          tokenOut: token.address,
          lpAmount: lpRaw,
        })
        if (!cancelled) setWithdrawQuote(fromRawUnits(out, token.decimals))
      } catch (err) {
        console.error('Withdraw quote failed:', err)
        if (!cancelled) setWithdrawQuote('')
      } finally {
        if (!cancelled) setWithdrawQuoting(false)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, walletAddress, lpAmount, token.address, token.decimals])

  const stats = [
    { label: 'Reserve', value: `${fromRawUnits(token.reserve, token.decimals)}` },
    { label: 'TVL', value: formatCurrency(token.reserveHuman) },
    { label: 'Pool Share', value: `${token.share.toFixed(1)}%` },
    { label: 'Amplification', value: poolState ? `A = ${poolState.amp}` : '—' },
    { label: 'Decimals', value: String(token.decimals) },
    { label: 'Pool Type', value: 'StableSwap' },
  ]

  const preview = getPoolPreviewStats(token.symbol)

  // Projected yearly yield from the entered amount × preview APY. Stablecoin
  // amounts are treated as ≈ USD, same assumption formatCurrency makes elsewhere.
  const estYearly = Number(amount) > 0 ? (Number(amount) * preview.apy) / 100 : 0

  // Real, not preview: your proportional slice of this token's reserve,
  // derived from your actual LP balance vs. total LP supply — same math
  // MyLiquidity uses for its per-token breakdown.
  const yourLiquidity =
    lpBalance !== null && poolState && poolState.lpSupplyHuman > 0
      ? (Number(fromRawUnits(lpBalance, LP_DECIMALS)) / poolState.lpSupplyHuman) * token.reserveHuman
      : 0

  const switchMode = (next: Mode) => {
    setMode(next)
    setStatus({ kind: 'idle' })
  }

  const handleDeposit = async () => {
    if (!walletAddress || !amount || Number(amount) <= 0) return
    setStatus({ kind: 'idle' })
    try {
      const { result, hash } = await depositSingleSided({
        to: walletAddress,
        tokenIndex: token.index,
        amount: toRawUnits(amount, token.decimals),
        onPhase: setTxPhase,
      })
      const lpReceived = fromRawUnits(result, LP_DECIMALS)
      setStatus({ kind: 'success', message: `Deposited ✓ Received ${lpReceived} LP shares`, hash })
      recordDeposit({
        walletAddress,
        status: 'completed',
        symbol: token.symbol,
        amount,
        lpReceived,
        txHash: hash,
      }).catch((err) => console.error('Failed to record activity:', err))
      setAmount('')
      loadPoolState() // refresh reserves after the deposit lands
      // Poll instead of a one-shot refetch — the RPC can briefly serve the
      // pre-tx snapshot right after the tx confirms.
      refetchUntilChanged(() => getLpBalance(walletAddress), lpBalance)
        .then(setLpBalance)
        .catch(() => {})
    } catch (err) {
      console.error('Deposit failed:', err)
      const mapped = mapTxError(err, { spend: token.symbol })
      setStatus({ kind: 'error', ...mapped })
      recordDeposit({
        walletAddress,
        status: 'failed',
        symbol: token.symbol,
        amount,
        detail: mapped.message,
      }).catch((e) => console.error('Failed to record activity:', e))
    } finally {
      setTxPhase(null)
    }
  }

  const handleWithdraw = async () => {
    if (!walletAddress || !lpAmount || Number(lpAmount) <= 0) return
    setStatus({ kind: 'idle' })
    try {
      const { result, hash } = await withdrawOneToken({
        to: walletAddress,
        tokenOut: token.address,
        lpAmount: toRawUnits(lpAmount, LP_DECIMALS),
        onPhase: setTxPhase,
      })
      const amountReceived = fromRawUnits(result, token.decimals)
      setStatus({ kind: 'success', message: `Withdrawn ✓ Received ${amountReceived} ${token.symbol}`, hash })
      recordWithdraw({
        walletAddress,
        status: 'completed',
        symbol: token.symbol,
        lpBurned: lpAmount,
        amountReceived,
        txHash: hash,
      }).catch((err) => console.error('Failed to record activity:', err))
      setLpAmount('')
      setWithdrawQuote('')
      loadPoolState() // refresh reserves after the withdrawal lands
      refetchUntilChanged(() => getLpBalance(walletAddress), lpBalance)
        .then(setLpBalance)
        .catch(() => {})
    } catch (err) {
      console.error('Withdraw failed:', err)
      const mapped = mapTxError(err, { spend: 'LP shares', receive: token.symbol })
      setStatus({ kind: 'error', ...mapped })
      recordWithdraw({
        walletAddress,
        status: 'failed',
        symbol: token.symbol,
        lpBurned: lpAmount,
        detail: mapped.message,
      }).catch((e) => console.error('Failed to record activity:', e))
    } finally {
      setTxPhase(null)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-6 my-8 animate-bounce-in"
        style={{
          backgroundColor: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          boxShadow: 'var(--c-widget-shadow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
          style={{ color: 'var(--c-text-faint)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              backgroundColor: 'var(--c-surface-2)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-text-muted)',
            }}
          >
            {tokenAvatarLabel(token.symbol)}
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--c-text)' }}>
              {token.symbol}
            </h2>
            <p className="text-sm" style={{ color: 'var(--c-text-faint)' }}>
              {shortenAddress(token.address)} · StableSwap
            </p>
          </div>
        </div>

        {walletConnected && yourLiquidity > 0 && (
          <div
            className="flex items-center justify-between mb-5 p-3 rounded-lg"
            style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)' }}
          >
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
                Your Liquidity
              </p>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                {yourLiquidity.toFixed(4)} {token.symbol}
              </p>
            </div>
            <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>
              ≈ {formatCurrency(yourLiquidity)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-5">
          {stats.map(({ label, value }) => (
            <div
              key={label}
              className="p-3 rounded-lg"
              style={{
                backgroundColor: 'var(--c-surface-2)',
                border: '1px solid var(--c-border)',
              }}
            >
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
            { label: 'APY', value: `${preview.apy.toFixed(1)}%`, accent: true },
            { label: 'Holders', value: preview.holders.toLocaleString() },
            { label: '24h Vol', value: formatCurrency(preview.volume24h) },
          ].map(({ label, value, accent }) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-text-faint)' }}>
                {label}
              </p>
              <p
                className="text-xs font-medium truncate"
                style={{ color: accent ? 'var(--c-accent)' : 'var(--c-text-muted)' }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Deposit / Withdraw / Sparplan tabs */}
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-xl mb-3"
          style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        >
          {(['deposit', 'withdraw', 'sparplan'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="py-2 text-xs sm:text-sm font-semibold rounded-lg capitalize transition-all"
              style={{
                backgroundColor: mode === m ? 'var(--c-surface)' : 'transparent',
                color: mode === m ? 'var(--c-text)' : 'var(--c-text-faint)',
                boxShadow: mode === m ? 'var(--c-widget-shadow)' : 'none',
              }}
            >
              {m === 'sparplan' ? 'Sparplan' : m}
            </button>
          ))}
        </div>

        {mode === 'sparplan' ? (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                Recurring Deposit
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-faint)' }}
              >
                Coming soon
              </span>
            </div>
            <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--c-text-faint)' }}>
              Frequency
            </label>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {(['weekly', 'biweekly', 'monthly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setSparFrequency(f)}
                  className="py-2 text-xs font-semibold rounded-lg capitalize transition-all"
                  style={{
                    backgroundColor: sparFrequency === f ? 'var(--c-surface-2)' : 'transparent',
                    color: sparFrequency === f ? 'var(--c-text)' : 'var(--c-text-faint)',
                    border: '1px solid var(--c-border)',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--c-text-faint)' }}>
              Amount per {sparFrequency === 'biweekly' ? '2 weeks' : sparFrequency.replace('ly', '')}
            </label>
            <div
              className="flex items-center rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}
            >
              <input
                type="number"
                placeholder="0.00"
                value={sparAmount}
                onChange={(e) => setSparAmount(e.target.value)}
                className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
                style={{ color: 'var(--c-text)' }}
              />
              <span className="px-4 py-3 text-sm shrink-0" style={{ color: 'var(--c-text-faint)', borderLeft: '1px solid var(--c-border)' }}>
                {token.symbol}
              </span>
            </div>
            <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--c-text-faint)' }}>
              Automatic recurring deposits are coming soon — this preview isn't wired up yet.
            </p>
          </div>
        ) : mode === 'deposit' ? (
          <div className="mb-3">
            <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--c-text-faint)' }}>
              Deposit Amount
            </label>
            <div
              className="flex items-center rounded-xl overflow-hidden transition-colors"
              style={{
                border: '1px solid var(--c-border)',
                backgroundColor: 'var(--c-surface-2)',
              }}
            >
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
                style={{ color: 'var(--c-text)' }}
              />
              <span
                className="px-4 py-3 text-sm shrink-0"
                style={{
                  color: 'var(--c-text-faint)',
                  borderLeft: '1px solid var(--c-border)',
                }}
              >
                {token.symbol}
              </span>
            </div>
            {walletConnected && amount && (
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
                  You receive
                </span>
                <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                  {depositQuoting ? 'Fetching quote…' : depositQuote ? `≈ ${depositQuote} LP shares` : '—'}
                </span>
              </div>
            )}
            <div
              className="flex items-center justify-between mt-2 px-1"
              title="Based on the preview APY — live metrics coming soon"
            >
              <span className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
                Est. returns per year* · {preview.apy.toFixed(1)}% APY
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: estYearly > 0 ? 'var(--c-accent)' : 'var(--c-text-faint)' }}
              >
                {estYearly > 0 ? `≈ ${formatCurrency(estYearly)}` : '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
                LP Shares to Burn
              </label>
              <span className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
                Balance: {lpBalance !== null ? fromRawUnits(lpBalance, LP_DECIMALS) : '—'}
              </span>
            </div>
            <div
              className="flex items-center rounded-xl overflow-hidden transition-colors"
              style={{
                border: '1px solid var(--c-border)',
                backgroundColor: 'var(--c-surface-2)',
              }}
            >
              <input
                type="number"
                placeholder="0.00"
                value={lpAmount}
                onChange={(e) => setLpAmount(e.target.value)}
                className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
                style={{ color: 'var(--c-text)' }}
              />
              <button
                onClick={() => lpBalance !== null && setLpAmount(fromRawUnits(lpBalance, LP_DECIMALS))}
                className="px-3 py-3 text-xs font-semibold shrink-0"
                style={{ color: 'var(--c-text-faint)', borderLeft: '1px solid var(--c-border)' }}
              >
                Max
              </button>
            </div>
            {lpAmount && (
              <p className="text-xs mt-2" style={{ color: 'var(--c-text-faint)' }}>
                {withdrawQuoting
                  ? 'Fetching quote…'
                  : withdrawQuote
                    ? `≈ ${withdrawQuote} ${token.symbol}`
                    : '—'}
              </p>
            )}
          </div>
        )}

        {mode === 'sparplan' ? (
          <button
            disabled
            className="w-full py-3 text-sm font-semibold rounded-xl opacity-50 cursor-not-allowed"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Start Sparplan — Coming Soon
          </button>
        ) : walletConnected ? (
          <RainButton
            onClick={mode === 'deposit' ? handleDeposit : handleWithdraw}
            disabled={
              mode === 'deposit'
                ? !amount || Number(amount) <= 0
                : !lpAmount || Number(lpAmount) <= 0 || withdrawQuoting
            }
            className="w-full py-3 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--c-cta-bg)',
              color: 'var(--c-cta-text)',
            }}
          >
            {mode === 'deposit' ? `Deposit ${token.symbol}` : `Withdraw ${token.symbol}`}
          </RainButton>
        ) : (
          <button
            onClick={connectWallet}
            className="w-full py-3 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99]"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Connect Wallet to {mode === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        )}

        <TxStatus phase={txPhase} status={status} />

        <p
          className="text-[11px] mt-4 pt-3 text-center leading-relaxed"
          style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-text-faint)' }}
        >
          No lockup — deposits and withdrawals are instant. Single-sided amounts
          can shift slightly with pool balance (1% slippage guard). Stellar
          network fees apply.
        </p>
      </div>
    </div>
  )
}
