import type { ARight } from '../../lib/stellar/poolParams'
import { Landmark, Lock } from 'lucide-react'

// Step 3: who may move A after launch. Two cards, one ring, and a sketch that
// shows what "move" means for each: a slow glide from one A to the next for
// Flexible, a flat line for Fixed. The creator is never an option; the pool
// contract has one role for this, and a creator who kept it could ramp A
// themselves, which is exactly what the rule rules out.

interface ARightPickerProps {
  value: ARight
  onChange: (value: ARight) => void
}

const CARDS: { key: ARight; icon: React.ReactNode; title: string; hint: string; tag?: string }[] = [
  {
    key: 'flexible',
    icon: <Landmark size={18} />,
    title: 'Flexible',
    hint: 'Spreadless may ramp A later.',
    tag: 'Recommended',
  },
  {
    key: 'fixed',
    icon: <Lock size={18} />,
    title: 'Fixed',
    hint: 'A never changes. Nobody can.',
  },
]

export default function ARightPicker({ value, onChange }: ARightPickerProps) {
  return (
    <div>
      <div role="radiogroup" aria-label="Right to change A" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CARDS.map((c) => {
          const checked = c.key === value
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(c.key)}
              className="wallet-option aright-card flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl"
              style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
            >
              <span
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors duration-200"
                style={{
                  backgroundColor: checked ? 'var(--c-cta-bg)' : 'var(--c-surface)',
                  color: checked ? 'var(--c-cta-text)' : 'var(--c-text-muted)',
                  border: checked ? '1px solid var(--c-cta-bg)' : '1px solid var(--c-border-2)',
                }}
              >
                {c.icon}
              </span>
              <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{c.title}</span>
                  {c.tag && (
                    <span
                      className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-px rounded-md whitespace-nowrap"
                      style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-muted)' }}
                    >
                      {c.tag}
                    </span>
                  )}
                </span>
                <span className="text-[12px] leading-snug" style={{ color: 'var(--c-text-muted)' }}>{c.hint}</span>
              </span>
              <span
                className="w-4 h-4 shrink-0 rounded-full flex items-center justify-center transition-all duration-200"
                style={{ border: `1px solid ${checked ? 'var(--c-text)' : 'var(--c-border-2)'}` }}
                aria-hidden
              >
                <span
                  className="w-2 h-2 rounded-full transition-all duration-200"
                  style={{ backgroundColor: 'var(--c-text)', scale: checked ? '1' : '0', opacity: checked ? 1 : 0 }}
                />
              </span>
            </button>
          )
        })}
      </div>

      {/* The sketch and the sentence swap together; keyed so the new pair
          settles in out of a blur instead of repainting in place. */}
      <div key={value} className="animate-blur-in mt-3 flex items-start gap-3.5">
        <RampSketch flexible={value === 'flexible'} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--c-text)' }}>
            {value === 'flexible'
              ? 'Spreadless becomes the owner. If the market shifts, its admins can move A, never as a jump: the value glides in a straight line from where it is to the new target over a set time, minutes to days.'
              : 'Right after the deploy you give ownership up in a second signature. From then on A is locked, for you, for Spreadless, for everyone. On chain this shows as a pool with no owner.'}
          </p>
          <p className="learn-only text-[12px] mt-1.5 leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
            {value === 'flexible'
              ? 'You never change A yourself. The owner role also covers pausing the pool and adjusting the swap fee, so those move to Spreadless with it.'
              : 'The fee and the pause switch freeze with it. If a peg breaks, nobody can retune the curve. Choose this for a pool whose terms must never move.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// A tiny A-over-time chart. Flexible draws a line that holds, then glides
// up to a new level and holds again; Fixed draws one flat line. The stroke
// draws itself in so a change of choice reads as the line being redrawn.
function RampSketch({ flexible }: { flexible: boolean }) {
  const path = flexible ? 'M2 30 H30 L58 12 H86' : 'M2 21 H86'
  return (
    <svg width="88" height="40" viewBox="0 0 88 40" aria-hidden className="shrink-0 mt-0.5">
      <line x1="2" y1="38" x2="86" y2="38" stroke="var(--c-border-2)" strokeWidth="1" />
      {flexible && (
        <>
          <line x1="30" y1="30" x2="30" y2="38" stroke="var(--c-border-2)" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="58" y1="12" x2="58" y2="38" stroke="var(--c-border-2)" strokeWidth="1" strokeDasharray="2 2" />
        </>
      )}
      <path
        d={path}
        fill="none"
        stroke="var(--c-text)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ramp-draw"
      />
      <text x="4" y="10" fontSize="7" fill="var(--c-text-faint)" fontFamily="ui-monospace, monospace">A</text>
    </svg>
  )
}
