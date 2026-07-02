import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

const TOKENS = ['USDC', 'USDT', 'DAI', 'EURC', 'PYUSD']

function TokenSelect({
  value,
  onChange,
  exclude,
}: {
  value: string
  onChange: (t: string) => void
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
        {value}
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
          {TOKENS.filter((t) => t !== exclude).map((t) => (
            <button
              key={t}
              onClick={() => { onChange(t); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm transition-colors"
              style={{
                color: t === value ? 'var(--c-text)' : 'var(--c-text-muted)',
                backgroundColor: t === value ? 'var(--c-surface-2)' : 'transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SwapWidget() {
  const { walletConnected, connectWallet } = useAppStore()
  const [fromToken, setFromToken] = useState('USDC')
  const [toToken, setToToken] = useState('USDT')
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')

  const handleFromChange = (val: string) => {
    setFromAmount(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0) {
      setToAmount((num * 0.9997).toFixed(2))
    } else {
      setToAmount('')
    }
  }

  const handleFlip = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount(toAmount)
    if (toAmount) {
      const num = parseFloat(toAmount)
      setToAmount(!isNaN(num) ? (num * 0.9997).toFixed(2) : '')
    }
  }

  const handleFromTokenChange = (t: string) => {
    if (t === toToken) setToToken(fromToken)
    setFromToken(t)
  }

  const handleToTokenChange = (t: string) => {
    if (t === fromToken) setFromToken(toToken)
    setToToken(t)
  }

  const hasAmount = fromAmount !== '' && toAmount !== ''

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
            Balance: —
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.00"
            value={fromAmount}
            onChange={(e) => handleFromChange(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold outline-none"
            style={{ color: 'var(--c-text)' }}
          />
          <TokenSelect value={fromToken} onChange={handleFromTokenChange} exclude={toToken} />
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
            Balance: —
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.00"
            value={toAmount}
            readOnly
            className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold outline-none cursor-default"
            style={{ color: 'var(--c-text-muted)' }}
          />
          <TokenSelect value={toToken} onChange={handleToTokenChange} exclude={fromToken} />
        </div>
      </div>

      {/* Rate info */}
      {hasAmount && (
        <div className="px-1 mb-4 space-y-2">
          {[
            { label: 'Rate', value: `1 ${fromToken} ≈ 0.9997 ${toToken}` },
            { label: 'Price impact', value: '< 0.01%' },
            { label: 'Fee', value: '0.01%' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--c-text-faint)' }}>{label}</span>
              <span className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={!walletConnected ? connectWallet : undefined}
        className="w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99]"
        style={{
          backgroundColor: 'var(--c-cta-bg)',
          color: 'var(--c-cta-text)',
        }}
      >
        {walletConnected ? `Swap ${fromToken} → ${toToken}` : 'Connect Wallet to Swap'}
      </button>
    </div>
  )
}
