import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { shortenAddress } from '../lib/utils'
import { fromRawUnits, toRawUnits } from '../lib/stellar/units'
import { depositAll, quoteDepositAll, LP_DECIMALS, type PoolToken } from '../lib/stellar/pool'
import { getTokenBalance } from '../lib/stellar/token'
import { invalidateVaultTvl } from '../lib/stellar/vaultTvl'
import { mapTxError } from '../lib/stellar/errors'
import type { TxPhase } from '../lib/stellar/types'
import { recordDeposit } from '../lib/activity/record'
import RainButton from './RainButton'
import TxStatus, { type TxUiStatus } from './TxStatus'
import TokenIcon from './TokenIcon'

// The first deposit into a pool, which is a different transaction from every
// deposit after it. The contract requires it to fund *every* token at once
// (#12 FirstDepositNotFull) because a StableSwap pool has no notion of balance
// until something establishes one, and this is what does: the ratio seeded
// here becomes the pool's idea of equilibrium.
//
// So this modal is not a variant of PoolDetailModal with more inputs. That one
// asks "how much of this token", which is the right question for a pool that
// already has a shape and the wrong one for a pool that has none. Here every
// asset is required, and the amounts are a statement about the pool.

interface SeedLiquidityModalProps {
  tokens: PoolToken[]
  /** The pool being seeded. Always explicit: there is no default pool to seed. */
  poolId: string
  poolLabel: string
  onClose: () => void
  /** Fired after a successful seed, so the page can re-read its reserves. */
  onSeeded?: () => void
}

export default function SeedLiquidityModal({ tokens, poolId, poolLabel, onClose, onSeeded }: SeedLiquidityModalProps) {
  const { walletConnected, walletAddress, connectWallet } = useAppStore()

  const [mounted, setMounted] = useState(false)
  const [amounts, setAmounts] = useState<string[]>(() => tokens.map(() => ''))
  const [balances, setBalances] = useState<(bigint | null)[]>(() => tokens.map(() => null))
  const [status, setStatus] = useState<TxUiStatus>({ kind: 'idle' })
  const [txPhase, setTxPhase] = useState<TxPhase | null>(null)
  const [lpQuote, setLpQuote] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (!walletAddress) {
      setBalances(tokens.map(() => null))
      return
    }
    let cancelled = false
    Promise.all(
      tokens.map((t) =>
        getTokenBalance(t.address, walletAddress, t.decimals).catch(() => null),
      ),
    ).then((next) => { if (!cancelled) setBalances(next) })
    return () => { cancelled = true }
  }, [walletAddress, tokens])

  const raw = useMemo(
    () => tokens.map((t, i) => (amounts[i] ? toRawUnits(amounts[i], t.decimals) : 0n)),
    [amounts, tokens],
  )
  // Every slot has to carry something: a zero would be a partial first deposit,
  // which is the exact thing the contract refuses.
  const missing = tokens.filter((_, i) => raw[i] <= 0n)
  const overBalance = tokens.filter((_, i) => balances[i] !== null && raw[i] > balances[i]!)
  const ready = missing.length === 0 && overBalance.length === 0

  // Quote the whole basket, debounced, and only once it is actually complete:
  // an incomplete basket cannot be simulated, it would just come back as #12.
  useEffect(() => {
    if (!walletAddress || !ready) {
      setLpQuote('')
      return
    }
    let cancelled = false
    setQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const lp = await quoteDepositAll({ to: walletAddress, amounts: raw, poolId })
        if (!cancelled) setLpQuote(fromRawUnits(lp, LP_DECIMALS))
      } catch (err) {
        console.error('Seed quote failed:', err)
        if (!cancelled) setLpQuote('')
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [walletAddress, ready, raw, poolId])

  const setAmount = (index: number, value: string) => {
    setAmounts((prev) => prev.map((a, i) => (i === index ? value : a)))
    setStatus({ kind: 'idle' })
  }

  // A pool holds one asset family, so its assets are worth about the same and
  // an equal split is the sane starting shape. One click instead of N.
  const matchAll = (index: number) => {
    const value = amounts[index]
    if (!value) return
    setAmounts(tokens.map(() => value))
    setStatus({ kind: 'idle' })
  }

  const handleSeed = async () => {
    if (!walletAddress || !ready) return
    setStatus({ kind: 'idle' })
    try {
      const { result, hash } = await depositAll({
        to: walletAddress,
        amounts: raw,
        onPhase: setTxPhase,
        poolId,
      })
      const lpReceived = fromRawUnits(result, LP_DECIMALS)
      setStatus({ kind: 'success', message: `Pool seeded ✓ Received ${lpReceived} LP shares`, hash })
      setDone(true)
      invalidateVaultTvl(poolId)
      // One activity row per asset: the ledger is per-token everywhere else,
      // and a single row would have to invent a symbol for a basket.
      tokens.forEach((t, i) => {
        recordDeposit({
          walletAddress,
          status: 'completed',
          symbol: t.symbol,
          amount: amounts[i],
          lpReceived: i === 0 ? lpReceived : undefined,
          txHash: hash,
        }).catch((err) => console.error('Failed to record activity:', err))
      })
      onSeeded?.()
    } catch (err) {
      console.error('Seed failed:', err)
      const mapped = mapTxError(err, { spend: tokens.map((t) => t.symbol).join(' + ') })
      setStatus({ kind: 'error', ...mapped })
      recordDeposit({
        walletAddress,
        status: 'failed',
        symbol: tokens.map((t) => t.symbol).join(' + '),
        amount: amounts.join(' / '),
        detail: mapped.message,
      }).catch((e) => console.error('Failed to record activity:', e))
    } finally {
      setTxPhase(null)
    }
  }

  const noBalance = balances.some((b, i) => b !== null && b === 0n && raw[i] <= 0n)

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-6 my-8 animate-bounce-in"
        style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-widget-shadow)' }}
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

        <div className="mb-1 flex items-center gap-3">
          <div className="flex items-center shrink-0">
            {tokens.map((t, i) => (
              <div key={t.address} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: tokens.length - i }}>
                <TokenIcon symbol={t.symbol} size={32} />
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--c-text)' }}>Seed liquidity</h2>
            <p className="text-sm truncate" style={{ color: 'var(--c-text-faint)' }}>
              {poolLabel} · {shortenAddress(poolId)}
            </p>
          </div>
        </div>

        <p className="text-[13px] leading-relaxed mt-4 mb-4 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}>
          The first deposit sets what balanced means for this pool, so it has to
          fund every asset. Later deposits can be single-sided. The ratio you
          enter here is the price the pool starts quoting at.
        </p>

        <div className="space-y-2 mb-4">
          {tokens.map((t, i) => {
            const bal = balances[i]
            const over = bal !== null && raw[i] > bal
            return (
              <div
                key={t.address}
                className="rounded-xl p-3.5"
                style={{ border: `1px solid ${over ? 'var(--c-border-2)' : 'var(--c-border)'}`, backgroundColor: 'var(--c-surface-2)' }}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amounts[i]}
                    onChange={(e) => setAmount(i, e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-xl font-semibold outline-none"
                    style={{ color: 'var(--c-text)' }}
                  />
                  <span
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                  >
                    <TokenIcon symbol={t.symbol} size={18} />
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>{t.symbol}</span>
                  </span>
                </div>
                {walletConnected && (
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-[11px]" style={{ color: over ? 'var(--c-text-muted)' : 'var(--c-text-faint)' }}>
                      {over ? `Only ${fromRawUnits(bal!, t.decimals)} available` : `Balance: ${bal !== null ? fromRawUnits(bal, t.decimals) : '—'}`}
                    </span>
                    <div className="flex gap-1.5">
                      {amounts[i] && tokens.length > 1 && (
                        <button
                          onClick={() => matchAll(i)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded transition-all"
                          style={{ color: 'var(--c-text-muted)', border: '1px solid var(--c-border)' }}
                        >
                          Use for all
                        </button>
                      )}
                      {bal !== null && bal > 0n && (
                        <button
                          onClick={() => setAmount(i, fromRawUnits(bal, t.decimals))}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded transition-all"
                          style={{ color: 'var(--c-text-muted)', border: '1px solid var(--c-border)' }}
                        >
                          Max
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {walletConnected && ready && (
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>You receive</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
              {quoting ? 'Fetching quote…' : lpQuote ? `≈ ${lpQuote} LP shares` : '—'}
            </span>
          </div>
        )}

        {walletConnected && noBalance && (
          <p className="text-[11px] mb-3 px-1" style={{ color: 'var(--c-text-faint)' }}>
            Missing one of these assets?{' '}
            <a href="/faucet" className="underline underline-offset-2" style={{ color: 'var(--c-text-muted)' }}>
              Mint testnet tokens
            </a>
            .
          </p>
        )}

        {walletConnected ? (
          done ? (
            <button
              onClick={onClose}
              className="w-full py-3 text-sm font-semibold rounded-xl btn-lift"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              Done
            </button>
          ) : (
            <RainButton
              onClick={handleSeed}
              disabled={!ready || quoting}
              className="w-full py-3 text-sm font-semibold rounded-xl btn-lift disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              {overBalance.length > 0
                ? `Not enough ${overBalance.map((t) => t.symbol).join(', ')}`
                : missing.length > 0
                  ? `Enter an amount for ${missing.map((t) => t.symbol).join(', ')}`
                  : 'Seed pool'}
            </RainButton>
          )
        ) : (
          <button
            onClick={connectWallet}
            className="w-full py-3 text-sm font-semibold rounded-xl btn-lift"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Log in to seed
          </button>
        )}

        <TxStatus phase={txPhase} status={status} />

        <p
          className="learn-only text-[11px] mt-4 pt-3 text-center leading-relaxed"
          style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-text-faint)' }}
        >
          One transaction, one signature, all assets at once. You get LP shares
          for the whole basket and can withdraw any of it afterwards.
        </p>
      </div>
    </div>
  )
}
