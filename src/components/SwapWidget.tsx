import { useState, useRef, useEffect } from 'react'
import { useAppStore, type PoolToken } from '../store/useAppStore'
import { fromRawUnits, toRawUnits } from '../lib/stellar/units'
import { quoteSwapExactIn, swapExactIn } from '../lib/stellar/pool'
import { getTokenBalance } from '../lib/stellar/token'
import RainButton from './RainButton'

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
        className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
        style={{
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text)',
        }}
      >
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
          className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-30 min-w-[110px]"
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
              className="w-full text-left px-4 py-2.5 text-sm transition-colors"
              style={{
                color: t.symbol === value.symbol ? 'var(--c-text)' : 'var(--c-text-muted)',
                backgroundColor: t.symbol === value.symbol ? 'var(--c-surface-2)' : 'transparent',
              }}
            >
              {t.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; amount: string; symbol: string }
  | { kind: 'error'; message: string }

export default function SwapWidget() {
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
  const [quoting, setQuoting] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
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
      return
    }
    const amountIn = toRawUnits(fromAmount, fromToken.decimals)
    if (amountIn <= 0n) {
      setToAmount('')
      return
    }

    let cancelled = false
    setQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const out = await quoteSwapExactIn({
          to: walletAddress,
          tokenIn: fromToken.address,
          tokenOut: toToken.address,
          amountIn,
        })
        if (!cancelled) setToAmount(fromRawUnits(out, toToken.decimals))
      } catch (err) {
        console.error('Quote failed:', err)
        if (!cancelled) setToAmount('')
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

    setStatus({ kind: 'idle' })
    try {
      const out = await swapExactIn({
        to: walletAddress,
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        amountIn,
      })
      setStatus({ kind: 'success', amount: fromRawUnits(out, toToken.decimals), symbol: toToken.symbol })
      setFromAmount('')
      setToAmount('')
      loadPoolState() // refresh reserves after the swap lands
      getTokenBalance(fromToken.address, walletAddress).then(setFromBalance).catch(() => {})
      getTokenBalance(toToken.address, walletAddress).then(setToBalance).catch(() => {})
    } catch (err) {
      console.error('Swap failed:', err)
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Transaction failed. Try again.',
      })
    }
  }

  const fromNum = parseFloat(fromAmount)
  const toNum = parseFloat(toAmount)
  const hasAmount = fromAmount !== '' && toAmount !== '' && !isNaN(fromNum) && !isNaN(toNum) && fromNum > 0
  // All pool tokens are ~$1 stablecoins, so a 1:1 comparison is an honest
  // proxy for price impact — same peg assumption pool.ts uses for TVL.
  const priceImpact = hasAmount ? ((fromNum - toNum) / fromNum) * 100 : 0

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
          Swap
        </h3>
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
          style={{ color: 'var(--c-text-faint)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        </button>
      </div>

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

      {/* Rate info */}
      {hasAmount && (
        <div className="px-1 mb-4 space-y-2">
          {[
            { label: 'Rate', value: `1 ${fromToken.symbol} ≈ ${(toNum / fromNum).toFixed(4)} ${toToken.symbol}` },
            { label: 'Price impact', value: `${priceImpact >= 0 ? '' : '+'}${(-priceImpact).toFixed(3)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>{label}</span>
              <span className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <RainButton
        onClick={!walletConnected ? connectWallet : handleSwap}
        enableLoader={walletConnected}
        disabled={walletConnected && (!hasAmount || quoting)}
        className="w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--c-cta-bg)',
          color: 'var(--c-cta-text)',
        }}
      >
        {walletConnected ? `Swap ${fromToken.symbol} → ${toToken.symbol}` : 'Connect Wallet to Swap'}
      </RainButton>

      {status.kind === 'success' && (
        <p className="text-xs mt-3 text-center" style={{ color: '#22c55e' }}>
          Swapped ✓ Received {status.amount} {status.symbol}
        </p>
      )}
      {status.kind === 'error' && (
        <p className="text-xs mt-3 break-words" style={{ color: '#ef4444' }}>
          {status.message}
        </p>
      )}
    </div>
  )
}
