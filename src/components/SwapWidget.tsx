import { useState, useRef, useEffect } from 'react'
import { useAppStore, type PoolToken } from '../store/useAppStore'
import { fromRawUnits, toRawUnits } from '../lib/stellar/units'
import { quoteSwapExactIn, swapExactIn } from '../lib/stellar/pool'
import { getTokenBalance } from '../lib/stellar/token'
import { refetchUntilChanged } from '../lib/stellar/refetch'
import { mapTxError } from '../lib/stellar/errors'
import type { TxPhase } from '../lib/stellar/types'
import { recordSwap } from '../lib/activity/record'
import type { ActivityRecord } from '../lib/activity/db'
import RainButton from './RainButton'
import TxStatus, { type TxUiStatus } from './TxStatus'
import TxDetailDrawer from './TxDetailDrawer'
import TokenIcon from './TokenIcon'

function TokenSelect({
  tokens,
  value,
  onChange,
  exclude,
}: {
  tokens: PoolToken[]
  value: PoolToken
  onChange: (t: PoolToken) => void
  exclude: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold pl-1.5 pr-3 py-1.5 rounded-lg transition-colors"
        style={{
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text)',
        }}
      >
        <TokenIcon symbol={value.symbol} size={22} />
        {value.symbol}
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-30 min-w-[140px]"
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border-2)',
            boxShadow: 'var(--c-widget-shadow)',
          }}
        >
          {tokens.filter((t) => t.symbol !== exclude).map((t) => (
            <button
              key={t.symbol}
              onClick={() => { onChange(t); setOpen(false) }}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition-colors"
              style={{
                color: t.symbol === value.symbol ? 'var(--c-text)' : 'var(--c-text-muted)',
                backgroundColor: t.symbol === value.symbol ? 'var(--c-surface-2)' : 'transparent',
              }}
            >
              <TokenIcon symbol={t.symbol} size={20} />
              {t.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type Slippage = 'auto' | '0.1' | '0.5' | '1' | 'custom'

// Converts the UI selection to basis points for swapExactIn's toleranceBps.
// Clamped to a sane range so a fat-fingered custom value can't zero out
// slippage protection (0 or negative) or wave through an absurd tolerance.
function slippageToBps(slippage: Slippage, custom: string): bigint {
  const pct = slippage === 'auto' ? 1 : slippage === 'custom' ? Number(custom) : Number(slippage)
  if (!Number.isFinite(pct) || pct <= 0) return 100n // fall back to the safe 1% default
  const bps = Math.round(pct * 100)
  return BigInt(Math.min(Math.max(bps, 1), 5000)) // 0.01%–50%
}

// What the pill button itself displays — the live selected value, not just an icon.
function slippageLabel(slippage: Slippage, custom: string): string {
  if (slippage === 'auto') return 'Auto'
  if (slippage === 'custom') return custom ? `${custom}%` : 'Custom'
  return `${slippage}%`
}

function TransactionSettings({
  slippage,
  custom,
  onSlippageChange,
  onCustomChange,
}: {
  slippage: Slippage
  custom: string
  onSlippageChange: (s: Slippage) => void
  onCustomChange: (c: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const presets: { key: Slippage; label: string }[] = [
    { key: 'auto', label: 'Auto' },
    { key: '0.1', label: '0.1%' },
    { key: '0.5', label: '0.5%' },
    { key: '1', label: '1%' },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors"
        style={{
          backgroundColor: 'var(--c-surface-2)',
          color: open ? 'var(--c-text)' : 'var(--c-text-faint)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="8" x2="20" y2="8" />
          <circle cx="9" cy="8" r="2" fill="currentColor" stroke="none" />
          <line x1="4" y1="16" x2="20" y2="16" />
          <circle cx="15" cy="16" r="2" fill="currentColor" stroke="none" />
        </svg>
        {slippageLabel(slippage, custom)}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-xl p-4 z-30"
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border-2)',
            boxShadow: 'var(--c-widget-shadow)',
          }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--c-text)' }}>Transaction Settings</p>
          <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-faint)' }}>
            Slippage tolerance
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => onSlippageChange(p.key)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                style={{
                  backgroundColor: slippage === p.key ? 'var(--c-surface-2)' : 'transparent',
                  color: slippage === p.key ? 'var(--c-text)' : 'var(--c-text-faint)',
                  border: '1px solid var(--c-border)',
                }}
              >
                {p.label}
              </button>
            ))}
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{
                border: '1px solid var(--c-border)',
                backgroundColor: slippage === 'custom' ? 'var(--c-surface-2)' : 'transparent',
              }}
            >
              <input
                type="number"
                placeholder="Custom"
                value={custom}
                onChange={(e) => { onCustomChange(e.target.value); onSlippageChange('custom') }}
                className="w-14 text-xs px-2 py-1.5 bg-transparent outline-none"
                style={{ color: 'var(--c-text)' }}
              />
              <span className="pr-2 text-xs" style={{ color: 'var(--c-text-faint)' }}>%</span>
            </div>
          </div>
          <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--c-text-faint)' }}>
            Applied on-chain as your minimum received — the trade reverts instead of settling below it.
          </p>
        </div>
      )}
    </div>
  )
}

type OrderMode = 'market' | 'limit'

export default function SwapWidget() {
  const [orderMode, setOrderMode] = useState<OrderMode>('market')
  const [slippage, setSlippage] = useState<Slippage>('auto')
  const [customSlippage, setCustomSlippage] = useState('')
  const {
    walletConnected,
    walletAddress,
    connectWallet,
    poolState,
    poolStatus,
    poolError,
    loadPoolState,
  } = useAppStore()

  const [fromToken, setFromToken] = useState<PoolToken | null>(null)
  const [toToken, setToToken] = useState<PoolToken | null>(null)
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [networkFee, setNetworkFee] = useState<number | null>(null)
  const [rateFlipped, setRateFlipped] = useState(false)
  // Set right after a swap confirms — while non-null, the success takeover
  // screen replaces the swap form entirely (cleared to go back to swapping).
  const [confirmedSwap, setConfirmedSwap] = useState<ActivityRecord | null>(null)
  const [detailActivity, setDetailActivity] = useState<ActivityRecord | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [status, setStatus] = useState<TxUiStatus>({ kind: 'idle' })
  const [txPhase, setTxPhase] = useState<TxPhase | null>(null)
  const [fromBalance, setFromBalance] = useState<bigint | null>(null)
  const [toBalance, setToBalance] = useState<bigint | null>(null)

  useEffect(() => {
    loadPoolState()
  }, [loadPoolState])

  // Default to the pool's first two tokens once real state arrives.
  useEffect(() => {
    if (!poolState || fromToken || toToken) return
    setFromToken(poolState.tokens[0] ?? null)
    setToToken(poolState.tokens[1] ?? poolState.tokens[0] ?? null)
  }, [poolState, fromToken, toToken])

  // Live quote, debounced — swap_exact_in must be simulated against the
  // connected wallet's account, so there's nothing to quote until it's connected.
  useEffect(() => {
    if (!walletAddress || !fromToken || !toToken || !fromAmount) {
      setToAmount('')
      setNetworkFee(null)
      return
    }
    const amountIn = toRawUnits(fromAmount, fromToken.decimals)
    if (amountIn <= 0n) {
      setToAmount('')
      setNetworkFee(null)
      return
    }

    let cancelled = false
    setQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const { amountOut, networkFeeXlm } = await quoteSwapExactIn({
          to: walletAddress,
          tokenIn: fromToken.address,
          tokenOut: toToken.address,
          amountIn,
        })
        if (!cancelled) {
          setToAmount(fromRawUnits(amountOut, toToken.decimals))
          setNetworkFee(networkFeeXlm)
        }
      } catch (err) {
        console.error('Quote failed:', err)
        if (!cancelled) {
          setToAmount('')
          setNetworkFee(null)
        }
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [walletAddress, fromToken, toToken, fromAmount])

  // Real wallet balances for whichever tokens are currently selected.
  useEffect(() => {
    if (!walletAddress || !fromToken) {
      setFromBalance(null)
      return
    }
    let cancelled = false
    getTokenBalance(fromToken.address, walletAddress)
      .then((b) => { if (!cancelled) setFromBalance(b) })
      .catch((err) => {
        console.error('Failed to load balance:', err)
        if (!cancelled) setFromBalance(null)
      })
    return () => { cancelled = true }
  }, [walletAddress, fromToken])

  useEffect(() => {
    if (!walletAddress || !toToken) {
      setToBalance(null)
      return
    }
    let cancelled = false
    getTokenBalance(toToken.address, walletAddress)
      .then((b) => { if (!cancelled) setToBalance(b) })
      .catch((err) => {
        console.error('Failed to load balance:', err)
        if (!cancelled) setToBalance(null)
      })
    return () => { cancelled = true }
  }, [walletAddress, toToken])

  const handleFlip = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount(toAmount)
    setToAmount('')
  }

  const handleFromTokenChange = (t: PoolToken) => {
    if (toToken && t.symbol === toToken.symbol) setToToken(fromToken)
    setFromToken(t)
  }

  const handleToTokenChange = (t: PoolToken) => {
    if (fromToken && t.symbol === fromToken.symbol) setFromToken(toToken)
    setToToken(t)
  }

  const handleSwap = async () => {
    if (!walletAddress || !fromToken || !toToken || !fromAmount) return
    const amountIn = toRawUnits(fromAmount, fromToken.decimals)
    if (amountIn <= 0n) return

    const toleranceBps = slippageToBps(slippage, customSlippage)
    const slippagePct = `${(Number(toleranceBps) / 100).toFixed(2)}%`

    setStatus({ kind: 'idle' })
    try {
      const { result, hash } = await swapExactIn({
        to: walletAddress,
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        amountIn,
        toleranceBps,
        onPhase: setTxPhase,
      })
      const receivedAmount = fromRawUnits(result, toToken.decimals)
      setStatus({
        kind: 'success',
        message: `Exchanged ✓ Received ${receivedAmount} ${toToken.symbol}`,
        hash,
      })
      recordSwap({
        walletAddress,
        status: 'completed',
        fromSymbol: fromToken.symbol,
        toSymbol: toToken.symbol,
        sentAmount: fromAmount,
        receivedAmount,
        effectiveRate: Number(receivedAmount) / Number(fromAmount),
        slippage: slippagePct,
        txHash: hash,
      })
        .then(setConfirmedSwap)
        .catch((err) => console.error('Failed to record activity:', err))
      setFromAmount('')
      setToAmount('')
      loadPoolState() // refresh reserves after the swap lands
      // Poll instead of a one-shot refetch — the RPC can briefly serve the
      // pre-swap snapshot right after the tx confirms.
      refetchUntilChanged(() => getTokenBalance(fromToken.address, walletAddress), fromBalance)
        .then(setFromBalance)
        .catch(() => {})
      refetchUntilChanged(() => getTokenBalance(toToken.address, walletAddress), toBalance)
        .then(setToBalance)
        .catch(() => {})
    } catch (err) {
      console.error('Swap failed:', err)
      const mapped = mapTxError(err, { spend: fromToken.symbol, receive: toToken.symbol })
      setStatus({ kind: 'error', ...mapped })
      recordSwap({
        walletAddress,
        status: 'failed',
        fromSymbol: fromToken.symbol,
        toSymbol: toToken.symbol,
        sentAmount: fromAmount,
        slippage: slippagePct,
        detail: mapped.message,
      }).catch((e) => console.error('Failed to record activity:', e))
    } finally {
      setTxPhase(null)
    }
  }

  const fromNum = parseFloat(fromAmount)
  const toNum = parseFloat(toAmount)
  const hasAmount = fromAmount !== '' && toAmount !== '' && !isNaN(fromNum) && !isNaN(toNum) && fromNum > 0
  const amountEntered = fromAmount !== '' && !isNaN(fromNum) && fromNum > 0
  // All pool tokens are ~$1 stablecoins, so a 1:1 comparison is an honest
  // proxy for price impact — same peg assumption pool.ts uses for TVL.
  const priceImpact = hasAmount ? ((fromNum - toNum) / fromNum) * 100 : 0

  const amountInRaw = fromToken && amountEntered ? toRawUnits(fromAmount, fromToken.decimals) : 0n
  const insufficientBalance =
    walletConnected && fromBalance !== null && amountInRaw > fromBalance
  // The pool can't pay out more of a token than it holds — with all tokens
  // pegged ~$1, selling more than the target's reserve can never fill.
  const insufficientLiquidity =
    walletConnected && !!toToken && amountEntered && fromNum >= toToken.reserveHuman

  // Mirror of the on-chain floor swapExactIn submits with, so "Minimum
  // received" shows exactly what the contract would enforce.
  const toleranceBps = slippageToBps(slippage, customSlippage)
  const quotedOutRaw = hasAmount && toToken ? toRawUnits(toAmount, toToken.decimals) : 0n
  const minReceived = quotedOutRaw - (quotedOutRaw * toleranceBps) / 10_000n
  const slippagePct = Number(toleranceBps) / 100

  const loadingPool = poolStatus === 'idle' || poolStatus === 'loading' || !fromToken || !toToken

  if (poolStatus === 'error') {
    return (
      <div
        className="w-full max-w-[460px] rounded-2xl p-7 text-center animate-bounce-in"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-widget-shadow)' }}
      >
        <p className="text-sm mb-4" style={{ color: 'var(--c-text-muted)' }}>Couldn't reach the pool contract.</p>
        <p className="text-xs mb-5 break-words" style={{ color: 'var(--c-text-faint)' }}>{poolError}</p>
        <button
          onClick={loadPoolState}
          className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
          style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
        >
          Retry
        </button>
      </div>
    )
  }

  // Resolves quickly enough that a loading placeholder would just flash —
  // render nothing until the pool state (and default token pair) is ready.
  if (loadingPool) return null

  if (confirmedSwap) {
    return (
      <>
        <div
          className="w-full max-w-[460px] rounded-2xl p-7 text-center animate-bounce-in"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-widget-shadow)' }}
        >
          <div className="flex justify-center mb-5">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="30" stroke="#22c55e" strokeWidth="3" className="animate-draw-circle" />
              <path d="M20 33 L28 41 L44 23" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" className="animate-draw-check" />
            </svg>
          </div>
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--c-text)' }}>
            Exchange Confirmed!
          </h3>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
            The conversion of {fromToken.symbol} to {toToken.symbol} was completed successfully.
          </p>

          <div className="space-y-2">
            <button
              onClick={() => setDetailActivity(confirmedSwap)}
              className="w-full py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              View Details
            </button>
            <a
              href="/pools"
              className="block w-full text-center py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
              style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            >
              Generate Yield
            </a>
            <button
              onClick={() => { setConfirmedSwap(null); setStatus({ kind: 'idle' }) }}
              className="w-full py-2 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--c-text-faint)' }}
            >
              Make another exchange
            </button>
          </div>
        </div>

        <TxDetailDrawer activity={detailActivity} onClose={() => setDetailActivity(null)} />
      </>
    )
  }

  return (
    <div
      className="w-full max-w-[460px] rounded-2xl p-7 animate-bounce-in"
      style={{
        backgroundColor: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        boxShadow: 'var(--c-widget-shadow)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-base" style={{ color: 'var(--c-text)' }}>
          Exchange
        </h3>
        <TransactionSettings
          slippage={slippage}
          custom={customSlippage}
          onSlippageChange={setSlippage}
          onCustomChange={setCustomSlippage}
        />
      </div>

      {/* Market / Limit tabs */}
      <div
        className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-4"
        style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
      >
        {([
          { key: 'market' as OrderMode, label: 'Market' },
          { key: 'limit' as OrderMode, label: 'Limit' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setOrderMode(key)}
            className="py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: orderMode === key ? 'var(--c-surface)' : 'transparent',
              color: orderMode === key ? 'var(--c-text)' : 'var(--c-text-faint)',
              boxShadow: orderMode === key ? 'var(--c-widget-shadow)' : 'none',
            }}
          >
            {label}
            {key === 'limit' && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-faint)' }}
              >
                Soon
              </span>
            )}
          </button>
        ))}
      </div>

      {orderMode === 'limit' ? (
        <div>
          <div
            className="p-4 rounded-xl mb-1"
            style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
          >
            <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
              You pay
            </span>
            <div className="flex items-center gap-3 mt-3">
              <input
                type="number"
                placeholder="0.00"
                disabled
                className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold outline-none cursor-not-allowed"
                style={{ color: 'var(--c-text-faint)' }}
              />
              <span
                className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-faint)' }}
              >
                {fromToken.symbol}
              </span>
            </div>
          </div>
          <div
            className="p-4 rounded-xl mb-4"
            style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
          >
            <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
              When 1 {fromToken.symbol} is worth
            </span>
            <div className="flex items-center gap-3 mt-3">
              <input
                type="number"
                placeholder="0.00"
                disabled
                className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold outline-none cursor-not-allowed"
                style={{ color: 'var(--c-text-faint)' }}
              />
              <span
                className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-faint)' }}
              >
                {toToken.symbol}
              </span>
            </div>
          </div>
          <button
            disabled
            className="w-full py-3.5 text-sm font-semibold rounded-xl opacity-50 cursor-not-allowed"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Place Limit Order — Coming Soon
          </button>
          <p className="text-[11px] mt-3 leading-relaxed text-center" style={{ color: 'var(--c-text-faint)' }}>
            Limit orders aren't live yet — this is a preview of what's coming.
          </p>
        </div>
      ) : (
      <>

      {/* From */}
      <div
        className="p-4 rounded-xl mb-1"
        style={{
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
            You pay
          </span>
          <span className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
            Balance: {fromBalance !== null ? fromRawUnits(fromBalance, fromToken.decimals) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.00"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold outline-none"
            style={{ color: 'var(--c-text)' }}
          />
          <TokenSelect tokens={poolState!.tokens} value={fromToken} onChange={handleFromTokenChange} exclude={toToken.symbol} />
        </div>

        {walletConnected && fromBalance !== null && fromBalance > 0n && (
          <div className="flex items-center gap-1.5 mt-3">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => setFromAmount(fromRawUnits((fromBalance * BigInt(pct)) / 100n, fromToken.decimals))}
                className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all duration-150 hover:opacity-70 active:scale-[0.96]"
                style={{
                  backgroundColor: 'var(--c-surface)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-text-muted)',
                }}
              >
                {pct === 100 ? 'Max' : `${pct}%`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Flip */}
      <div className="flex justify-center relative z-10 my-1">
        <button
          onClick={handleFlip}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150"
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            color: 'var(--c-text-faint)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </button>
      </div>

      {/* To */}
      <div
        className="p-4 rounded-xl mb-4"
        style={{
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
            You receive
          </span>
          <span className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
            Balance: {toBalance !== null ? fromRawUnits(toBalance, toToken.decimals) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder={quoting ? '...' : '0.00'}
            value={toAmount}
            readOnly
            className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold outline-none cursor-default"
            style={{ color: 'var(--c-text-muted)' }}
          />
          <TokenSelect tokens={poolState!.tokens} value={toToken} onChange={handleToTokenChange} exclude={fromToken.symbol} />
        </div>
      </div>

      {/* Swap details — live values from the current quote */}
      {hasAmount && (
        <div
          className="rounded-xl p-4 mb-4 space-y-2"
          style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>Route</span>
            <span className="text-xs" style={{ color: 'var(--c-text-muted)' }}>
              {fromToken.symbol} → {toToken.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>Exchange rate</span>
            <button
              onClick={() => setRateFlipped(!rateFlipped)}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--c-text-muted)' }}
              title="Flip rate direction"
            >
              {rateFlipped
                ? `1 ${toToken.symbol} = ${(fromNum / toNum).toFixed(6)} ${fromToken.symbol}`
                : `1 ${fromToken.symbol} = ${(toNum / fromNum).toFixed(6)} ${toToken.symbol}`}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>Price impact</span>
            <span
              className="text-xs"
              style={{ color: priceImpact > 1 ? '#ef4444' : 'var(--c-text-muted)' }}
            >
              {Math.abs(priceImpact) < 0.01
                ? '<0.01%'
                : `${priceImpact > 0 ? '-' : '+'}${Math.abs(priceImpact).toFixed(2)}%`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>Network fee</span>
            <span className="text-xs" style={{ color: 'var(--c-text-muted)' }}>
              {networkFee !== null ? `~${networkFee.toFixed(4)} XLM` : '—'}
            </span>
          </div>

          <div className="pt-2 mt-1 space-y-2" style={{ borderTop: '1px solid var(--c-border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
              Execution protection
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>Slippage tolerance</span>
              <span className="text-xs" style={{ color: 'var(--c-text-muted)' }}>
                {slippagePct}%{slippage === 'auto' ? ' (auto)' : ''}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>Minimum received</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                {fromRawUnits(minReceived, toToken.decimals)} {toToken.symbol}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <RainButton
        onClick={!walletConnected ? connectWallet : handleSwap}
        enableLoader={walletConnected}
        disabled={walletConnected && (!hasAmount || quoting || insufficientBalance || insufficientLiquidity)}
        className="w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--c-cta-bg)',
          color: 'var(--c-cta-text)',
        }}
      >
        {!walletConnected
          ? 'Connect Wallet to Exchange'
          : !amountEntered
            ? 'Enter an amount'
            : insufficientBalance
              ? `Insufficient ${fromToken.symbol} balance`
              : insufficientLiquidity
                ? 'Insufficient liquidity'
                : `Exchange ${fromToken.symbol} → ${toToken.symbol}`}
      </RainButton>

      <TxStatus phase={txPhase} status={status} />
      </>
      )}
    </div>
  )
}
