import { useState } from 'react'
import { shortenAddress } from '../../lib/utils'
import type { PoolDraft, TokenMeta } from '../../lib/stellar/poolParams'
import Tooltip from '../Tooltip'
import CapSlider from './CapSlider'
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
}

export default function AdvancedSection({ draft, tokens, owner, onCap, onLpCap }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false)

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
          <span style={{ color: 'var(--c-text-faint)' }}>caps · LP cap · owner</span>
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
                  <Tooltip text="Max reserve for this token. Protects LPs if one asset floods the pool. Drag to set it, or click the number to type one." label={`About the ${t.symbol} cap`} />
                </span>
                <CapSlider
                  value={draft.caps[t.address] ?? ''}
                  onChange={(v) => onCap(t.address, v)}
                  label={`${t.symbol} cap`}
                />
              </FragmentRow>
            ))}
            <span className="flex items-center">
              LP supply cap
              <Tooltip text="Ceiling on total LP shares. Caps how large the pool can grow. Drag to set it, or click the number to type one." label="About the LP supply cap" />
            </span>
            <CapSlider value={draft.lpMaxSupply} onChange={onLpCap} label="LP supply cap" />
            <span className="flex items-center">
              Owner
              <Tooltip text="Fixed to your wallet. The owner is the only address that can pause the pool, ramp A and change the swap fee after launch, and can hand that right to the protocol." label="About the owner" />
            </span>
            <span className="font-medium tabular-nums text-right" style={{ color: 'var(--c-text)' }}>
              {owner ? `${shortenAddress(owner)} · you` : 'Log in'}
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
