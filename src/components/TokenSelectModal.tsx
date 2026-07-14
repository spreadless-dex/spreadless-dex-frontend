import { useState, useEffect } from 'react'
import type { PoolToken } from '../store/useAppStore'
import { getTokenBalance } from '../lib/stellar/token'
import { fromRawUnits } from '../lib/stellar/units'
import TokenIcon from './TokenIcon'

// Full names for the pool's known assets — the modal's secondary line. Same
// symbol-keyed-with-fallback pattern as PoolCard's POOL_COPY, for the day
// the pool is redeployed with a new asset this map doesn't know about yet.
const TOKEN_NAMES: Record<string, string> = {
  USDx: 'Decentralized USD Coin',
  PYUSD: 'PayPal USD',
  SUSD: 'Synth USD',
  sUSDC: 'USD Coin',
}

interface TokenSelectModalProps {
  tokens: PoolToken[]
  value: PoolToken
  onChange: (t: PoolToken) => void
  exclude: string
  walletAddress: string | null
}

export default function TokenSelectModal({ tokens, value, onChange, exclude, walletAddress }: TokenSelectModalProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [balances, setBalances] = useState<Record<string, bigint | null>>({})

  const selectable = tokens.filter((t) => t.symbol !== exclude)

  // The trigger button only needs the current pair's balance (SwapWidget
  // already fetches that), but the picker itself needs every candidate's
  // balance to be useful — fetched fresh each time it opens.
  useEffect(() => {
    if (!open || !walletAddress) return
    let cancelled = false
    selectable.forEach((t) => {
      getTokenBalance(t.address, walletAddress)
        .then((b) => { if (!cancelled) setBalances((prev) => ({ ...prev, [t.symbol]: b })) })
        .catch(() => { if (!cancelled) setBalances((prev) => ({ ...prev, [t.symbol]: null })) })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, walletAddress])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const q = query.trim().toLowerCase()
  const filtered = selectable.filter(
    (t) => !q || t.symbol.toLowerCase().includes(q) || (TOKEN_NAMES[t.symbol] ?? '').toLowerCase().includes(q),
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-semibold pl-1.5 pr-3 py-1.5 rounded-lg transition-colors shrink-0"
        style={{
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text)',
        }}
      >
        <TokenIcon symbol={value.symbol} size={22} />
        {value.symbol}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <div
            className="relative w-full max-w-sm max-h-[80vh] flex flex-col rounded-2xl animate-bounce-in"
            style={{
              backgroundColor: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              boxShadow: 'var(--c-widget-shadow)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 pb-4 shrink-0">
              <h3 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>
                Select a token
              </h3>
              <button
                onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={{ color: 'var(--c-text-faint)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-5 pb-3 shrink-0">
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--c-text-faint)', flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search name or symbol"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--c-text)' }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-6 pb-1.5 shrink-0">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>Token</span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>Balance / Price</span>
            </div>

            <div className="overflow-y-auto px-2 pb-3">
              {filtered.length === 0 && (
                <p className="text-center text-xs py-8" style={{ color: 'var(--c-text-faint)' }}>
                  No tokens match "{query}"
                </p>
              )}
              {filtered.map((t) => {
                const balance = balances[t.symbol]
                const isSelected = t.symbol === value.symbol
                return (
                  <button
                    key={t.symbol}
                    onClick={() => { onChange(t); close() }}
                    className="w-full flex items-center gap-3 text-left px-3 py-3 rounded-xl transition-colors hover:opacity-90"
                    style={{ backgroundColor: isSelected ? 'var(--c-surface-2)' : 'transparent' }}
                  >
                    <TokenIcon symbol={t.symbol} size={34} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{t.symbol}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--c-text-faint)' }}>
                        {TOKEN_NAMES[t.symbol] ?? 'Stablecoin'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                        {!walletAddress ? '—' : balance === undefined ? '···' : balance === null ? '—' : fromRawUnits(balance, t.decimals)}
                      </p>
                      {/* All pool assets are ~$1 stablecoins — same peg assumption used for price impact and TVL elsewhere. */}
                      <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>$1.00</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
