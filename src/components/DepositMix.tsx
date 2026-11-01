import { useCallback, useEffect, useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  balancedAmounts,
  depositAll,
  LP_DECIMALS,
  maxBalancedAmount,
  quoteDepositAll,
  readPoolState,
  type PoolState,
  type PoolToken,
} from '../lib/stellar/pool'
import { getTokenBalance } from '../lib/stellar/token'
import { fromRawUnits, toRawUnits } from '../lib/stellar/units'
import { refetchUntilChanged } from '../lib/stellar/refetch'
import { mapTxError } from '../lib/stellar/errors'
import type { OnPhase } from '../lib/stellar/types'
import { recordDeposit } from '../lib/activity/record'
import TokenIcon from './TokenIcon'

// What a deposit is made of. A pool's prices come from its ratio, so a deposit
// of one token pushes every price in the pool, while a basket in the pool's own
// ratio moves none of them. Balanced is therefore what a deposit starts as, and
// one token is the choice to opt into, with a warning that says what it does.

export type DepositKind = 'balanced' | 'single'

interface DepositMixArgs {
  /** Every token of the pool, in canonical order. */
  tokens: PoolToken[]
  /** The token the amount is typed in. */
  token: PoolToken | undefined
  amount: string
  poolId: string | undefined
  walletAddress: string | null
  /** False while the surrounding form is not on a deposit, to skip the quote. */
  active?: boolean
}

export interface DepositMix {
  /** Single when the user chose it, or when the pool has no ratio to follow. */
  kind: DepositKind
  setKind: (kind: DepositKind) => void
  tokens: PoolToken[]
  /** One amount per pool token, zero for a token left out. Null with nothing to deposit into. */
  amounts: bigint[] | null
  /** Tokens the wallet holds too little of for this deposit. */
  short: PoolToken[]
  /** Wallet balances by token index, null where not read (yet). */
  balances: (bigint | null)[]
  /** The largest amount the percent shortcuts can scale, null until it is known. */
  max: bigint | null
  /** The whole deposit in human units, stablecoins at ≈ $1 like every TVL here. */
  total: number
  /** "≈ X" LP as a string, empty without a quote. */
  quote: string
  quoting: boolean
  /** How a single-token deposit reshapes the pool. Null when balanced or empty. */
  shift: PoolShift | null
  /** Send it, recording the outcome in the activity log. Throws what the transaction threw. */
  deposit: (onPhase: OnPhase) => Promise<{ lp: string; hash: string; summary: string }>
  /** Re-read balances and reserves after a transaction landed. */
  settle: () => void
  spend: string
}

export interface PoolShift {
  symbol: string
  /** The token's share of the pool, 0–100, before and after. */
  from: number
  to: number
  /** Whether it ends closer to an even split than it started. */
  towardBalance: boolean
  /**
   * What the deposit gains or loses against a proportional exit right after it,
   * in percent. Positive is a cost, negative a bonus. Null before the quote.
   */
  costPct: number | null
}

function poolShift(state: PoolState | null, tokens: PoolToken[], token: PoolToken, human: number, lp: bigint | null): PoolShift {
  const total = tokens.reduce((sum, t) => sum + t.reserveHuman, 0)
  const from = total > 0 ? (token.reserveHuman / total) * 100 : 0
  const to = ((token.reserveHuman + human) / (total + human)) * 100
  const even = 100 / tokens.length

  let costPct: number | null = null
  if (state && lp !== null && lp > 0n) {
    const owned = Number(lp) / Number(state.lpSupply + lp)
    costPct = (1 - (owned * (total + human)) / human) * 100
  }
  return { symbol: token.symbol, from, to, towardBalance: Math.abs(to - even) < Math.abs(from - even), costPct }
}

export function useDepositMix({ tokens: given, token, amount, poolId, walletAddress, active = true }: DepositMixArgs): DepositMix {
  const [chosen, setKind] = useState<DepositKind>('balanced')
  const [fresh, setFresh] = useState<{ poolId: string | undefined; state: PoolState } | null>(null)
  const [balances, setBalances] = useState<(bigint | null)[]>([])
  const [lp, setLp] = useState<bigint | null>(null)
  const [quoting, setQuoting] = useState(false)

  // The caller's reserves can be minutes old (Earn keeps them across mounts),
  // and a basket built on them would be off the pool's real ratio.
  useEffect(() => {
    let live = true
    readPoolState(poolId)
      .then((state) => live && setFresh({ poolId, state }))
      .catch((err) => console.error('Deposit: pool read failed:', err))
    return () => {
      live = false
    }
  }, [poolId])

  const state = fresh && fresh.poolId === poolId ? fresh.state : null
  const tokens = state?.tokens ?? given
  const index = token?.index
  const tokenKey = tokens.map((t) => t.address).join(',')

  useEffect(() => {
    setBalances([])
    if (!walletAddress || !tokenKey) return
    let live = true
    Promise.all(
      tokens.map((t) => getTokenBalance(t.address, walletAddress, t.decimals).catch(() => null)),
    ).then((next) => {
      if (live) setBalances(next)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, tokenKey])

  const raw = token ? toRawUnits(amount, token.decimals) : 0n
  const basket = index !== undefined ? balancedAmounts(tokens, index, raw) : null
  const kind: DepositKind = basket ? chosen : 'single'
  const amounts = useMemo(() => {
    if (index === undefined || !tokens.length) return null
    return kind === 'balanced' ? basket : tokens.map((_, i) => (i === index ? raw : 0n))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, tokenKey, index, raw, basket?.join(',')])

  const short = amounts ? tokens.filter((_, i) => balances[i] != null && amounts[i] > balances[i]!) : []
  const total = amounts ? tokens.reduce((sum, t, i) => sum + Number(fromRawUnits(amounts[i], t.decimals)), 0) : 0

  const known = balances.length === tokens.length && balances.every((b) => b !== null)
  const own = index !== undefined ? (balances[index] ?? null) : null
  const max =
    kind === 'single' || index === undefined ? own : known ? maxBalancedAmount(tokens, index, balances as bigint[]) : null

  // "You receive ~X LP" before committing. The simulation runs as the connected
  // account and moves its tokens, so a basket it can't pay cannot be quoted.
  const payable = !!walletAddress && !!amounts && raw > 0n && short.length === 0
  useEffect(() => {
    setLp(null)
    if (!active || !payable || !walletAddress || !amounts) {
      setQuoting(false)
      return
    }
    let live = true
    setQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const out = await quoteDepositAll({ to: walletAddress, amounts, poolId })
        if (live) setLp(out)
      } catch (err) {
        // A failed simulation mid-typing shows no quote rather than an error.
        console.error('Deposit quote failed:', err)
      } finally {
        if (live) setQuoting(false)
      }
    }, 400)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [active, payable, walletAddress, amounts, poolId])

  const spend = amounts
    ? tokens.filter((_, i) => amounts[i] > 0n).map((t) => t.symbol).join(' + ')
    : ''

  const deposit = async (onPhase: OnPhase) => {
    if (!walletAddress || !amounts) throw new Error('Nothing to deposit.')
    const balanced = kind === 'balanced'
    const lines = tokens
      .map((t, i) => ({ symbol: t.symbol, amount: fromRawUnits(amounts[i], t.decimals), raw: amounts[i] }))
      .filter((l) => l.raw > 0n)
    try {
      const { result, hash } = await depositAll({ to: walletAddress, amounts, onPhase, poolId })
      const lpOut = fromRawUnits(result, LP_DECIMALS)
      // One activity row per asset, as for a seed: the ledger is per-token.
      lines.forEach((l, i) => {
        recordDeposit({
          walletAddress,
          status: 'completed',
          symbol: l.symbol,
          amount: l.amount,
          lpReceived: i === 0 ? lpOut : undefined,
          txHash: hash,
          balanced,
        }).catch((err) => console.error('Failed to record activity:', err))
      })
      return { lp: lpOut, hash, summary: lines.map((l) => `${l.amount} ${l.symbol}`).join(' + ') }
    } catch (err) {
      recordDeposit({
        walletAddress,
        status: 'failed',
        symbol: spend,
        amount: lines.map((l) => l.amount).join(' / '),
        detail: mapTxError(err, { spend }).message,
      }).catch((e) => console.error('Failed to record activity:', e))
      throw err
    }
  }

  const settle = useCallback(() => {
    if (walletAddress) {
      tokens.forEach((t, i) => {
        refetchUntilChanged(() => getTokenBalance(t.address, walletAddress, t.decimals), balances[i] ?? null)
          .then((b) => setBalances((prev) => prev.map((old, j) => (j === i ? b : old))))
          .catch(() => {})
      })
    }
    const lpSupply = state?.lpSupply ?? null
    refetchUntilChanged(() => readPoolState(poolId).then((s) => {
      setFresh({ poolId, state: s })
      return s.lpSupply
    }), lpSupply).catch(() => {})
  }, [walletAddress, tokens, balances, state, poolId])

  const human = token ? Number(amount) || 0 : 0
  const shift =
    kind === 'single' && token && human > 0
      ? poolShift(state, tokens, tokens[token.index] ?? token, human, lp)
      : null

  return {
    kind,
    setKind,
    tokens,
    amounts,
    short,
    balances,
    max,
    total,
    quote: lp !== null ? fromRawUnits(lp, LP_DECIMALS) : '',
    quoting,
    shift,
    deposit,
    settle,
    spend,
  }
}

export function DepositKindSwitch({ mix, symbol }: { mix: DepositMix; symbol: string }) {
  return (
    <div
      className="grid grid-cols-2 gap-1 p-1 rounded-lg"
      role="radiogroup"
      aria-label="What to deposit"
      style={{ border: '1px solid var(--c-border)' }}
    >
      {([
        { key: 'balanced' as DepositKind, label: 'Balanced' },
        { key: 'single' as DepositKind, label: `Only ${symbol}` },
      ]).map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={mix.kind === key}
          onClick={() => mix.setKind(key)}
          className="py-1.5 text-[12px] font-semibold rounded-md transition-all"
          style={{
            backgroundColor: mix.kind === key ? 'var(--c-surface-2)' : 'transparent',
            color: mix.kind === key ? 'var(--c-text)' : 'var(--c-text-faint)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** The other assets of a balanced deposit: what goes in alongside the typed amount. */
export function BasketRows({ mix, token, onlyToken }: { mix: DepositMix; token: PoolToken; onlyToken: () => void }) {
  if (mix.kind !== 'balanced') return null
  const others = mix.tokens.filter((t) => t.index !== token.index)
  const shortOf = mix.short.map((t) => t.symbol).join(', ')
  // Only a way out if the wallet could pay the typed amount on its own.
  const payable = !mix.short.some((t) => t.index === token.index)
  return (
    <div className="mt-2 space-y-1 px-1">
      <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
        Goes in with it, at the pool’s ratio
      </p>
      {others.map((t) => {
        const need = mix.amounts?.[t.index] ?? 0n
        const have = mix.balances[t.index] ?? null
        const lacking = have !== null && need > have
        return (
          <div key={t.address} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-muted)' }}>
              <TokenIcon symbol={t.symbol} size={16} />
              {t.symbol}
            </span>
            <span
              className="text-xs font-semibold tabular-nums truncate"
              style={{ color: lacking ? 'var(--c-warn)' : 'var(--c-text)' }}
            >
              {fromRawUnits(need, t.decimals)}
              {have !== null && (
                <span className="font-normal" style={{ color: lacking ? 'var(--c-warn)' : 'var(--c-text-faint)' }}>
                  {' '}/ {fromRawUnits(have, t.decimals)}
                </span>
              )}
            </span>
          </div>
        )
      })}
      {mix.short.length > 0 && (
        <p className="text-[11px] leading-relaxed pt-0.5" style={{ color: 'var(--c-text-muted)' }}>
          Not enough {shortOf} for this amount.
          {payable && (
            <>
              {' '}
              <button type="button" onClick={onlyToken} className="underline underline-offset-2">
                Deposit only {token.symbol} instead
              </button>
            </>
          )}
        </p>
      )}
    </div>
  )
}

/** Shown for as long as one token is selected, with figures once an amount is in. */
export function SingleTokenWarning({ mix, symbol, className = '' }: { mix: DepositMix; symbol: string; className?: string }) {
  if (mix.kind !== 'single') return null
  const { shift } = mix
  const helps = shift?.towardBalance ?? false
  const cost = shift?.costPct ?? null
  // Too small to show at two decimals, and "25.57% to 25.57%" reads as a glitch.
  const visible = shift && shift.from.toFixed(2) !== shift.to.toFixed(2)
  return (
    <div
      role="status"
      className={`flex gap-2.5 rounded-xl px-3 py-2.5 ${className}`}
      style={{
        backgroundColor: helps ? 'var(--c-surface-2)' : 'var(--c-warn-bg)',
        border: `1px solid ${helps ? 'var(--c-border)' : 'var(--c-warn-border)'}`,
      }}
    >
      {!helps && <TriangleAlert size={15} strokeWidth={2.2} className="shrink-0 mt-px" style={{ color: 'var(--c-warn)' }} />}
      <div className="min-w-0 text-left">
        <p className="text-[12px] font-semibold" style={{ color: helps ? 'var(--c-text)' : 'var(--c-warn)' }}>
          {helps ? `${symbol} is scarce in this pool` : 'This deposit moves the pool’s prices'}
        </p>
        <p className="text-[11.5px] leading-relaxed mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
          {visible
            ? `${symbol} goes from ${shift.from.toFixed(2)}% to ${shift.to.toFixed(2)}% of the pool. `
            : `Adding only ${symbol} tilts the pool towards it. `}
          {helps
            ? 'That brings the pool closer to balance.'
            : 'That lowers its price and adds a swap fee. Balanced avoids both.'}
          {cost !== null && Math.abs(cost) >= 0.005 && (
            <> <b style={{ color: 'var(--c-text)' }}>{cost > 0 ? `Estimated cost ≈ ${cost.toFixed(2)}%.` : `Estimated bonus ≈ ${(-cost).toFixed(2)}%.`}</b></>
          )}
        </p>
      </div>
    </div>
  )
}
