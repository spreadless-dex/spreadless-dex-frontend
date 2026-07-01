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
        className="flex items-center gap-1.5 bg-white/[0.07] border border-white/[0.08] text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-white/[0.11] transition-colors"
      >
        {value}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-[#191919] border border-white/[0.08] rounded-xl overflow-hidden z-30 min-w-[110px] shadow-2xl">
          {TOKENS.filter((t) => t !== exclude).map((t) => (
            <button
              key={t}
              onClick={() => {
                onChange(t)
                setOpen(false)
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                t === value
                  ? 'text-white bg-white/[0.06]'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
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
    <div className="w-[460px] bg-[#111] border border-white/[0.08] rounded-2xl p-7 animate-bounce-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-semibold text-base">Swap</h3>
        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-white/25 hover:text-white/55 hover:bg-white/[0.05] transition-all">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        </button>
      </div>

      {/* From */}
      <div className="p-4 rounded-xl bg-[#0d0d0d] border border-white/[0.05] mb-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/30 text-[11px] uppercase tracking-wider">You pay</span>
          <span className="text-white/20 text-[11px]">Balance: —</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.00"
            value={fromAmount}
            onChange={(e) => handleFromChange(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold text-white outline-none placeholder-white/15"
          />
          <TokenSelect value={fromToken} onChange={handleFromTokenChange} exclude={toToken} />
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center relative z-10 my-1">
        <button
          onClick={handleFlip}
          className="w-8 h-8 bg-[#111] border border-white/[0.08] rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/[0.15] transition-all duration-150"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </button>
      </div>

      {/* To */}
      <div className="p-4 rounded-xl bg-[#0d0d0d] border border-white/[0.05] mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/30 text-[11px] uppercase tracking-wider">You receive</span>
          <span className="text-white/20 text-[11px]">Balance: —</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.00"
            value={toAmount}
            readOnly
            className="flex-1 min-w-0 bg-transparent text-[1.6rem] font-semibold text-white/75 outline-none placeholder-white/15 cursor-default"
          />
          <TokenSelect value={toToken} onChange={handleToTokenChange} exclude={fromToken} />
        </div>
      </div>

      {/* Rate / impact */}
      {hasAmount && (
        <div className="px-1 mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-white/25 text-xs">Rate</span>
            <span className="text-white/40 text-xs">1 {fromToken} ≈ 0.9997 {toToken}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/25 text-xs">Price impact</span>
            <span className="text-green-400/70 text-xs">{'< 0.01%'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/25 text-xs">Fee</span>
            <span className="text-white/40 text-xs">0.01%</span>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={!walletConnected ? connectWallet : undefined}
        className="w-full py-3.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 active:scale-[0.99] transition-all duration-150"
      >
        {walletConnected ? `Swap ${fromToken} → ${toToken}` : 'Connect Wallet to Swap'}
      </button>
    </div>
  )
}
