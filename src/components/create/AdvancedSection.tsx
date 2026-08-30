import { useState } from 'react'
import { shortenAddress } from '../../lib/utils'
import type { PoolDraft, TokenMeta } from '../../lib/stellar/poolParams'
import Tooltip from '../Tooltip'
import { ChevronRight } from 'lucide-react'

// Step 4: the settings most creators never touch, folded shut but readable
// at a glance from the summary line. Grid-rows transition keeps the fold
// smooth without measuring heights.

interface AdvancedSectionProps {
  draft: PoolDraft
  tokens: TokenMeta[]
  owner: string | null
  onCap: (address: string, value: string) => void
  onLpCap: (value: string) => void
  onBeneficiary: (value: string) => void
}

export default function AdvancedSection({ draft, tokens, owner, onCap, onLpCap, onBeneficiary }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false)

  const inputStyle = {
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-2)',
    color: 'var(--c-text)',
  } as const

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[13px]"
        style={{ color: 'var(--c-text-muted)' }}
      >
        <span>
          Advanced{' '}
          <span style={{ color: 'var(--c-text-faint)' }}>caps · LP cap · beneficiary · owner</span>
        </span>
        <ChevronRight
          size={16}
          strokeWidth={1.8}
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', transitionTimingFunction: 'cubic-bezier(0.2,0.8,0.2,1)' }}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5 pt-4 text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
            {tokens.map((t) => (
              <FragmentRow key={t.address}>
                <span className="flex items-center">
                  {t.symbol} cap
                  <Tooltip text="Max reserve for this token. Protects LPs if one asset floods the pool." label={`About the ${t.symbol} cap`} />
                </span>
                <input
                  value={draft.caps[t.address] ?? ''}
                  onChange={(e) => onCap(t.address, e.target.value)}
                  placeholder="No cap"
                  inputMode="decimal"
                  aria-label={`${t.symbol} cap`}
                  className="w-36 px-2.5 py-1.5 rounded-lg text-[13px] text-right tabular-nums outline-none"
                  style={inputStyle}
                />
              </FragmentRow>
            ))}
            <span className="flex items-center">
              LP supply cap
              <Tooltip text="Ceiling on total LP shares. Caps how large the pool can grow." label="About the LP supply cap" />
            </span>
            <input
              value={draft.lpMaxSupply}
              onChange={(e) => onLpCap(e.target.value)}
              placeholder="No cap"
              inputMode="decimal"
              aria-label="LP supply cap"
              className="w-36 px-2.5 py-1.5 rounded-lg text-[13px] text-right tabular-nums outline-none"
              style={inputStyle}
            />
            <span className="flex items-center">
              Beneficiary
              <Tooltip text="Receives the protocol share of fees. Defaults to you." label="About the beneficiary" />
            </span>
            <input
              value={draft.beneficiary}
              onChange={(e) => onBeneficiary(e.target.value)}
              placeholder={owner ? shortenAddress(owner) : 'Your address'}
              spellCheck={false}
              aria-label="Beneficiary address"
              className="w-44 px-2.5 py-1.5 rounded-lg text-[12px] font-mono text-right outline-none"
              style={inputStyle}
            />
            <span className="flex items-center">
              Owner
              <Tooltip text="Can pause the pool, change fees and ramp A. Fixed to your wallet." label="About the owner" />
            </span>
            <span className="font-medium tabular-nums text-right" style={{ color: 'var(--c-text)' }}>
              {owner ? `${shortenAddress(owner)} · you` : 'Connect wallet'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Grid rows come in pairs; a fragment keeps the markup honest without a div
// that would break the two-column grid.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
