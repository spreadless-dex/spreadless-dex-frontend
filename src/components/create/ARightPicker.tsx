import type { ARight } from '../../lib/stellar/poolParams'
import { Landmark, Lock } from 'lucide-react'

// Step 3: who may move A after launch. Two cards, one ring, and a sketch that
// shows what "move" means for each: a slow glide from one A to the next for
// Flexible, a flat line for Fixed. The creator is never an option, and since
// the 2026-09-05 contract that is enforced rather than arranged: the choice is
// the `amp_control` constructor argument, Locked or ProtocolManaged, immutable
// from the first ledger. It says nothing about who owns the pool. The creator
// owns it either way and keeps the fee, the caps and pause with it.

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
              ? 'If the market shifts, Spreadless can move A, never as a jump: the value glides in a straight line from where it is to the new target over a set time, minutes to days. You stay the owner of the pool.'
              : 'A is written into the pool as locked when it is created. From that ledger on nobody can move it, not you, not Spreadless, not ever. It takes no second signature and cannot be undone later.'}
          </p>
          <p className="learn-only text-[12px] mt-1.5 leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
            {value === 'flexible'
              ? 'You never change A yourself, and this is the only thing the choice decides. The swap fee, the caps and the pause switch stay yours as the pool\u2019s owner.'
              : 'Only A freezes. The swap fee, the caps and the pause switch stay yours, and you can give those up too on the pool page once it is live. If a peg breaks, nobody can retune the curve: choose this for a pool whose curve must never move.'}
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
