import { useCallback, useEffect, useState } from 'react'
import { addTrustline, classicAssetOf, hasTrustline } from '../lib/stellar/trustline'
import { mapTxError } from '../lib/stellar/errors'
import type { TxPhase } from '../lib/stellar/types'

// A SAC-wrapped token (SUSD) can only land in an account that trusts it. Rather
// than let the user sign a swap that is guaranteed to fail and then explain the
// wreckage, the widgets ask this hook whether the token they're about to *pay
// out* is receivable, and put the one-time trustline in front of the trade.
export interface TrustlineState {
  /** True once we know the wallet is missing the trustline for this token. */
  needed: boolean
  /** The first check is still running — don't render a verdict yet. */
  checking: boolean
  adding: boolean
  phase: TxPhase | null
  error: string | null
  enable: () => Promise<void>
}

export function useTrustline(
  contractId: string | undefined,
  symbol: string | undefined,
  walletAddress: string | null,
): TrustlineState {
  const [needed, setNeeded] = useState(false)
  const [checking, setChecking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [phase, setPhase] = useState<TxPhase | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    // Native Soroban tokens have no classic side — nothing to check, and no
    // Horizon round-trip to spend on them.
    if (!contractId || !walletAddress || !classicAssetOf(contractId)) {
      setNeeded(false)
      return
    }
    setChecking(true)
    try {
      setNeeded(!(await hasTrustline(contractId, walletAddress)))
    } catch (err) {
      // A Horizon hiccup must not block the trade: fall through and let the
      // contract be the judge (errors.ts still explains a trustline failure).
      console.error('Trustline check failed:', err)
      setNeeded(false)
    } finally {
      setChecking(false)
    }
  }, [contractId, walletAddress])

  useEffect(() => {
    setError(null)
    void check()
  }, [check])

  const enable = useCallback(async () => {
    if (!contractId || !walletAddress) return
    setError(null)
    setAdding(true)
    try {
      await addTrustline(contractId, walletAddress, setPhase)
      setNeeded(false)
    } catch (err) {
      console.error('Failed to add trustline:', err)
      setError(mapTxError(err, { receive: symbol }).message)
    } finally {
      setAdding(false)
      setPhase(null)
    }
  }, [contractId, walletAddress, symbol])

  return { needed, checking, adding, phase, error, enable }
}

// The explanation that sits directly above the CTA while the trustline is
// missing, so the changed button label ("Enable SUSD") is never a surprise.
export function TrustlineNotice({
  symbol,
  state,
}: {
  symbol: string
  state: TrustlineState
}) {
  if (!state.needed) return null

  return (
    <div
      className="rounded-xl p-4 mb-3"
      style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
    >
      <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text)' }}>
        One-time setup for {symbol}
      </p>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
        {symbol} is a Stellar asset, so your wallet has to trust it once before it can hold any.
        One signature, and it stays enabled — you'll only ever do this again for a different asset.
      </p>
      {state.error && (
        <p className="text-[11px] leading-relaxed mt-2" style={{ color: '#ef4444' }}>
          {state.error}
        </p>
      )}
    </div>
  )
}

/** Button label while the trustline step is in front of the real action. */
export function trustlineCtaLabel(symbol: string, state: TrustlineState): string {
  if (state.phase === 'signing') return 'Approve in your wallet…'
  if (state.phase === 'submitting') return `Enabling ${symbol}…`
  if (state.adding) return `Enabling ${symbol}…`
  return `Enable ${symbol}`
}
