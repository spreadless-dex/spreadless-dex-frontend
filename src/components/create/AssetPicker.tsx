import { useEffect, useState } from 'react'
import { TOKENS, FAMILIES, FAMILY_ORDER, type AssetFamily } from '../../lib/stellar/config'
import { getTokenBalance } from '../../lib/stellar/token'
import { fromRawUnits } from '../../lib/stellar/units'
import { MAX_TOKENS, familyConflict, type TokenMeta } from '../../lib/stellar/poolParams'
import TokenIcon from '../TokenIcon'
import SegmentedControl, { type SegmentOption } from './SegmentedControl'
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
// A pool holds exactly one asset family, so the family is not a grouping laid
// over the list, it is the first decision. The control on top is therefore the
// primary navigation and the list under it shows one family at a time: USD
// stables with USD stables, BTC with wrapped BTC, never BTC with a dollar.
// Thirty tokens in six flat groups was a wall to scroll past; one family is at
// most three rows of chips.
//
// The rule still has to be visible before it is enforced (poolParams.ts blocks
// the deploy). Once a chip is picked the family is locked, and rather than
// hiding the other families the control shows them shut, with the reason on
// hover. One dimmed row carries what a screenful of dimmed chips used to.
//
// "All" spans every family and is what a search falls back to, because a
// symbol you type is worth finding wherever it lives. Choosing a family clears
// the query so the control always describes what is on screen.

// TOKENS is static, so the chip list and the families it spans are too.
const KNOWN_CHIPS: TokenMeta[] = TOKENS.map((t) => ({
  address: t.contractId,
  symbol: t.symbol,
  decimals: t.decimals,
  family: t.family,
}))

const LISTED_FAMILIES = FAMILY_ORDER.filter((f) => KNOWN_CHIPS.some((m) => m.family === f))

/** Which family the list is showing. 'all' spans them. */
type FamilyTab = AssetFamily | 'all'

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
  // Opening on the largest family beats opening on a wall of everything; the
  // control is right there to move.
  const [familyTab, setFamilyTab] = useState<FamilyTab>(LISTED_FAMILIES[0] ?? 'all')

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

  // What the list is showing. A pick decides it outright; otherwise a search
  // widens to every family and the tab holds the rest of the time. The control
  // renders this value, never the raw tab, so it cannot claim a family the
  // list is not showing.
  const q = query.trim().toLowerCase()
  const shownFamily: FamilyTab = lockedFamily ?? (q ? 'all' : familyTab)

  // "usdc" finds the symbol, "bitcoin" finds the family.
  const isHit = (m: TokenMeta) =>
    !q ||
    m.symbol.toLowerCase().includes(q) ||
    (m.family !== undefined && FAMILIES[m.family].label.toLowerCase().includes(q))
  const inShownFamily = (m: TokenMeta) => shownFamily === 'all' || m.family === shownFamily
  // Hits are counted inside the shown family, so the empty line below answers
  // the question actually on screen.
  const hits = KNOWN_CHIPS.filter((m) => inShownFamily(m) && isHit(m))
  // A chip already in the draft stays on screen whatever the query says, so a
  // search never looks like it dropped one of your picks. It is not a hit
  // though: with no real hit the empty line still says so, and the chip that
  // stayed does not get to pose as the answer.
  const onScreen = (m: TokenMeta) => inShownFamily(m) && (isHit(m) || isSelected(m.address))

  const groups = LISTED_FAMILIES
    .map((family) => ({ family, chips: KNOWN_CHIPS.filter((m) => m.family === family && onScreen(m)) }))
    .filter((g) => g.chips.length > 0)
  // One family on screen needs no heading over it: the control already says so.
  const grouped = groups.length > 1

  const tabs: SegmentOption<FamilyTab>[] = [
    ...LISTED_FAMILIES.map((f) => ({
      key: f as FamilyTab,
      label: f,
      disabled: lockedFamily !== undefined && f !== lockedFamily,
      title:
        lockedFamily !== undefined && f !== lockedFamily
          ? `This pool holds ${FAMILIES[lockedFamily].noun}. Deselect to build a pool of another kind.`
          : FAMILIES[f].label,
    })),
    {
      key: 'all' as FamilyTab,
      label: 'All',
      disabled: lockedFamily !== undefined,
      title: lockedFamily !== undefined ? `This pool holds ${FAMILIES[lockedFamily].noun}.` : 'Every family',
    },
  ]

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
      <div className="mb-2.5">
        <SegmentedControl
          ariaLabel="Asset family"
          size="sm"
          options={tabs}
          value={shownFamily}
          onChange={(key) => {
            // The control is the authority on what is listed, so taking a
            // family drops a query that would otherwise still be filtering it.
            setFamilyTab(key)
            setQuery('')
          }}
        />
      </div>

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
          {shownFamily === 'all'
            ? `Nothing on the list matches "${query.trim()}".`
            : `Nothing in ${FAMILIES[shownFamily].label} matches "${query.trim()}".`}
        </p>
      )}

      {LISTED_FAMILIES.length > 1 && lockedFamily && (
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
