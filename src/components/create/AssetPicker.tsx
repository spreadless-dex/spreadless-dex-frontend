import { useState } from 'react'
import { TOKENS } from '../../lib/stellar/config'
import { getTokenBalance, getTokenMeta } from '../../lib/stellar/token'
import { fromRawUnits } from '../../lib/stellar/units'
import {
  MAX_TOKENS,
  isContractAddress,
  type TokenMeta,
} from '../../lib/stellar/poolParams'
import { explorerContractUrl } from '../../lib/stellar/config'
import TokenIcon from '../TokenIcon'
import Tooltip from '../Tooltip'
import { Plus, Loader2 } from 'lucide-react'
import { useEffect } from 'react'

// Step 1: which assets the pool holds. Known tokens are chips with the
// wallet's balance (answers "can I seed this later?"); unknown contracts come
// in through "Add by address" with an Unverified badge. Picking a fifth chip
// shakes instead of failing silently.

interface AssetPickerProps {
  selected: TokenMeta[]
  onToggle: (meta: TokenMeta) => void
  onLimit: () => void
  walletAddress: string | null
  /** Extra (custom) tokens already added, so they render as chips too. */
  customTokens: TokenMeta[]
  onAddCustom: (meta: TokenMeta) => void
}

export default function AssetPicker({
  selected,
  onToggle,
  onLimit,
  walletAddress,
  customTokens,
  onAddCustom,
}: AssetPickerProps) {
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [shaking, setShaking] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addr, setAddr] = useState('')
  const [addState, setAddState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [addError, setAddError] = useState('')

  useEffect(() => {
    if (!walletAddress) {
      setBalances({})
      return
    }
    let cancelled = false
    TOKENS.forEach((t) => {
      getTokenBalance(t.contractId, walletAddress, t.decimals)
        .then((b) => {
          if (cancelled) return
          const human = Number(fromRawUnits(b, t.decimals))
          setBalances((prev) => ({ ...prev, [t.contractId]: human.toLocaleString('en-US', { maximumFractionDigits: 0 }) }))
        })
        .catch(() => {})
    })
    return () => { cancelled = true }
  }, [walletAddress])

  const isSelected = (address: string) => selected.some((t) => t.address === address)

  const toggle = (meta: TokenMeta) => {
    if (!isSelected(meta.address) && selected.length >= MAX_TOKENS) {
      setShaking(meta.address)
      window.setTimeout(() => setShaking(null), 400)
      onLimit()
      return
    }
    onToggle(meta)
  }

  const submitCustom = async () => {
    const id = addr.trim()
    if (!isContractAddress(id)) {
      setAddState('error')
      setAddError('That is not a contract address (C…, 56 characters).')
      return
    }
    setAddState('loading')
    setAddError('')
    try {
      const meta = await getTokenMeta(id)
      const full: TokenMeta = { address: id, symbol: meta.symbol, decimals: meta.decimals }
      onAddCustom(full)
      toggle(full)
      setAddr('')
      setAdding(false)
      setAddState('idle')
    } catch {
      setAddState('error')
      setAddError('Could not read this contract as a token. Check the address.')
    }
  }

  const knownChips: TokenMeta[] = TOKENS.map((t) => ({
    address: t.contractId,
    symbol: t.symbol,
    decimals: t.decimals,
    peg: t.peg,
  }))

  const chip = (meta: TokenMeta, custom: boolean) => {
    const active = isSelected(meta.address)
    const balance = balances[meta.address]
    return (
      <button
        key={meta.address}
        type="button"
        aria-pressed={active}
        onClick={() => toggle(meta)}
        className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 btn-lift"
        style={{
          backgroundColor: active ? 'var(--c-cta-bg)' : 'var(--c-surface)',
          color: active ? 'var(--c-cta-text)' : 'var(--c-text)',
          border: `1px solid ${active ? 'var(--c-cta-bg)' : 'var(--c-border-2)'}`,
          animation: shaking === meta.address ? 'chipShake 0.35s' : undefined,
        }}
      >
        <TokenIcon symbol={meta.symbol} size={24} />
        {meta.symbol}
        {custom ? (
          <span className="text-[10px] font-normal opacity-70">Unverified</span>
        ) : (
          balance !== undefined && <span className="text-[11px] font-normal opacity-60 tabular-nums">{balance}</span>
        )}
      </button>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {knownChips.map((m) => chip(m, false))}
        {customTokens.map((m) => chip(m, true))}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] transition-colors"
            style={{ border: '1px dashed var(--c-border-2)', color: 'var(--c-text-muted)' }}
          >
            <Plus size={14} strokeWidth={2} />
            Add by address
          </button>
        ) : (
          <div className="flex items-center gap-2 w-full mt-1">
            <input
              autoFocus
              value={addr}
              onChange={(e) => { setAddr(e.target.value); setAddState('idle') }}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCustom(); if (e.key === 'Escape') { setAdding(false); setAddState('idle') } }}
              placeholder="Token contract address (C…)"
              spellCheck={false}
              className="flex-1 px-3 py-2 rounded-xl text-[13px] font-mono outline-none"
              style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            />
            <button
              type="button"
              onClick={submitCustom}
              disabled={addState === 'loading'}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold btn-lift disabled:opacity-50"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              {addState === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setAddState('idle') }}
              className="px-3 py-2 rounded-xl text-[13px]"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {addState === 'error' && (
        <p className="text-[12px] mt-2" style={{ color: '#ef4444' }}>{addError}</p>
      )}
      {customTokens.length > 0 && addState !== 'error' && (
        <p className="text-[12px] mt-2 flex items-center" style={{ color: 'var(--c-text-muted)' }}>
          Unverified tokens are read straight from the contract.
          <Tooltip text="Not on our list. Check the address on Stellar Expert before you pool it." label="About unverified tokens" />
          {customTokens[0] && (
            <a
              href={explorerContractUrl(customTokens[customTokens.length - 1].address)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 ml-1.5"
            >
              Check on Stellar Expert
            </a>
          )}
        </p>
      )}
    </div>
  )
}
