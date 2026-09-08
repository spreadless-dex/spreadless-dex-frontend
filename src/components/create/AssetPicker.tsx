import { useEffect, useState } from 'react'
import { TOKENS, FAMILIES, FAMILY_ORDER, type AssetFamily } from '../../lib/stellar/config'
import { getTokenBalance } from '../../lib/stellar/token'
import { fromRawUnits } from '../../lib/stellar/units'
import { MAX_TOKENS, familyConflict, type TokenMeta } from '../../lib/stellar/poolParams'
import TokenIcon from '../TokenIcon'
import { Search } from 'lucide-react'

// Step 1: which assets the pool holds. Every listed token is a chip with the
// wallet's balance (answers "can I seed this later?"), and the search field
// narrows the list by symbol or by family. Picking a fifth chip shakes instead
// of failing silently.
//
// Only listed tokens can be pooled for now. Adding a token by contract address
// used to live here and is deliberately gone: nothing on a token contract says
// what it tracks, so an address field could only ever take the creator's word
// for it, and the rule below has to hold on facts.
//
// The chips are grouped by asset family and the first pick locks the pool to
// one: USD stables with USD stables, BTC with wrapped BTC, never BTC with a
// dollar. Everything outside that family goes flat and stops responding, so
// the rule is visible before it is enforced (poolParams.ts blocks the deploy).

interface AssetPickerProps {
  selected: TokenMeta[]
  onToggle: (meta: TokenMeta) => void
  onLimit: () => void
  walletAddress: string | null
}

export default function AssetPicker({
  selected,
  onToggle,
  onLimit,
  walletAddress,
}: AssetPickerProps) {
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [shaking, setShaking] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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

  // The family of the first picked asset. Everything else has to match it.
  const lockedFamily: AssetFamily | undefined = selected.find((t) => t.family)?.family

  const conflictFor = (meta: TokenMeta): string | null =>
    isSelected(meta.address) ? null : familyConflict(meta, lockedFamily)

  const toggle = (meta: TokenMeta) => {
    if (conflictFor(meta)) return
    if (!isSelected(meta.address) && selected.length >= MAX_TOKENS) {
      setShaking(meta.address)
      window.setTimeout(() => setShaking(null), 400)
      onLimit()
      return
    }
    onToggle(meta)
  }

  const knownChips: TokenMeta[] = TOKENS.map((t) => ({
    address: t.contractId,
    symbol: t.symbol,
    decimals: t.decimals,
    family: t.family,
  }))

  // "usdc" finds the symbol, "bitcoin" finds the family.
  const q = query.trim().toLowerCase()
  const isHit = (m: TokenMeta) =>
    !q ||
    m.symbol.toLowerCase().includes(q) ||
    (m.family !== undefined && FAMILIES[m.family].label.toLowerCase().includes(q))
  const hits = knownChips.filter(isHit)
  // A chip already in the draft stays on screen whatever the query says, so a
  // search never looks like it dropped one of your picks. It is not a hit
  // though: with no real hit the empty line still says so, and the chip that
  // stayed does not get to pose as the answer.
  const onScreen = (m: TokenMeta) => isHit(m) || isSelected(m.address)

  // Headings come from the catalogue, not from the query, so they hold still
  // while you type. With one family on the list they would label the obvious.
  const listedFamilies = FAMILY_ORDER.filter((f) => knownChips.some((m) => m.family === f))
  const grouped = listedFamilies.length > 1
  const groups = listedFamilies
    .map((family) => ({ family, chips: knownChips.filter((m) => m.family === family && onScreen(m)) }))
    .filter((g) => g.chips.length > 0)

  // Enter takes the pick when the query has narrowed it to exactly one asset.
  const unpickedHits = hits.filter((m) => !isSelected(m.address))
  const onlyMatch = q && unpickedHits.length === 1 ? unpickedHits[0] : undefined

  const chip = (meta: TokenMeta) => {
    const active = isSelected(meta.address)
    const balance = balances[meta.address]
    const conflict = conflictFor(meta)
    return (
      <button
        key={meta.address}
        type="button"
        aria-pressed={active}
        disabled={conflict !== null}
        title={conflict ?? undefined}
        onClick={() => toggle(meta)}
        className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 btn-lift disabled:cursor-not-allowed"
        style={{
          backgroundColor: active ? 'var(--c-cta-bg)' : 'var(--c-surface)',
          color: active ? 'var(--c-cta-text)' : 'var(--c-text)',
          border: `1px solid ${active ? 'var(--c-cta-bg)' : 'var(--c-border-2)'}`,
          opacity: conflict ? 0.35 : 1,
          animation: shaking === meta.address ? 'chipShake 0.35s' : undefined,
        }}
      >
        <TokenIcon symbol={meta.symbol} size={24} />
        {meta.symbol}
        {balance !== undefined && (
          <span className="text-[11px] font-normal opacity-60 tabular-nums">{balance}</span>
        )}
      </button>
    )
  }

  return (
    <div>
      <div className="relative max-w-xs mb-3">
        <Search
          size={15}
          strokeWidth={1.8}
          style={{ color: 'var(--c-text-faint)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
            if (e.key === 'Enter' && onlyMatch) {
              toggle(onlyMatch)
              setQuery('')
            }
          }}
          placeholder="Search assets"
          aria-label="Search assets"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl outline-none"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        />
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.family}>
            {grouped && (
              <p
                className="text-[11px] font-medium uppercase tracking-wider mb-1.5"
                style={{ color: 'var(--c-text-muted)' }}
              >
                {FAMILIES[g.family].label}
              </p>
            )}
            <div className="flex flex-wrap gap-2">{g.chips.map((m) => chip(m))}</div>
          </div>
        ))}
      </div>

      {q && hits.length === 0 && (
        <p className="text-[12px] mt-2.5" style={{ color: 'var(--c-text-muted)' }}>
          Nothing on the list matches "{query.trim()}".
        </p>
      )}

      {grouped && lockedFamily && (
        <>
          <p className="text-[12px] mt-2.5" style={{ color: 'var(--c-text)' }}>
            {FAMILIES[lockedFamily].label} only, now that one is picked. Deselect to build a pool of another kind.
          </p>
          <p className="learn-only text-[12px] mt-1" style={{ color: 'var(--c-text-muted)' }}>
            A pool quotes its assets as interchangeable, so they have to trade near 1:1. Wrapped assets count as
            the thing they wrap: wBTC belongs with BTC, not with a dollar.
          </p>
        </>
      )}
    </div>
  )
}
