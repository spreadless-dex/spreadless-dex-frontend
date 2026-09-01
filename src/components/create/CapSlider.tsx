import { useEffect, useRef, useState } from 'react'
import { logToSlider, sliderToLog } from '../../lib/stellar/poolParams'
import HairlineSlider from './HairlineSlider'

// A cap starts unlimited and is pulled down, so the track runs from a small
// floor up to one extra stop past the maximum that means "No cap" — the
// right end is where the pool is free to grow. Dragging is for the shape of
// the number; typing is for the exact one, so the value itself is a button
// that turns into an input. Decimals are written the German way there: a
// typed dot is turned into a comma on the spot, and the draft keeps the
// canonical dot form the contract math expects.

export const CAP_MIN = 1_000
export const CAP_MAX = 1_000_000_000
const STEPS = 100
/** One stop past the log range: unlimited. */
const NO_CAP_STEP = STEPS + 1

const groups = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 })

// Decade ticks (1k, 10k … 1B) as fractions of the whole range, which runs
// one stop past the last decade to hold "No cap".
const DECADES = [0, 1, 2, 3, 4, 5, 6].map((i) => (i / 6) * (STEPS / NO_CAP_STEP))

/** "1.200,5" or "1200.5" → "1200.5". Keeps a trailing separator while typing. */
function toCanonical(text: string): string {
  const [whole = '', ...rest] = text.replace(/[^\d.,]/g, '').replace(/\./g, ',').split(',')
  if (rest.length === 0) return whole
  return `${whole}.${rest.join('')}`
}

/** The other direction, for the input: dot decimals shown as a comma. */
function toTyped(canonical: string): string {
  return canonical.replace('.', ',')
}

/** Two significant digits, so a drag lands on a number worth reading. */
function nice(v: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1)
  return Math.round(v / mag) * mag
}

interface CapSliderProps {
  /** Canonical value in human units. Empty string: no cap. */
  value: string
  onChange: (value: string) => void
  /** Accessible name, e.g. "USDx cap". */
  label: string
}

export default function CapSlider({ value, onChange, label }: CapSliderProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const n = Number(value)
  const set = value.trim() !== '' && Number.isFinite(n) && n > 0
  const step = set ? Math.round(logToSlider(n, CAP_MIN, CAP_MAX)) : NO_CAP_STEP

  const inputStyle = {
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-2)',
    color: 'var(--c-text)',
  } as const

  const commit = () => {
    setEditing(false)
    const canonical = toCanonical(text)
    // A lone separator or a zero is the same request as an empty field.
    onChange(Number(canonical) > 0 ? canonical : '')
  }

  return (
    <div className="flex items-center gap-2.5 w-[244px]">
      <HairlineSlider
        min={0}
        max={NO_CAP_STEP}
        step={1}
        value={step}
        onChange={(v) => onChange(v === NO_CAP_STEP ? '' : String(nice(sliderToLog(v, CAP_MIN, CAP_MAX))))}
        ariaLabel={label}
        ariaValueText={set ? groups.format(n) : 'No cap'}
        marks={DECADES}
        fadeFrom={0.78}
        ticks={19}
        dimThumb={!set}
        className="flex-1 min-w-0"
      />
      {editing ? (
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            const typed = toTyped(toCanonical(e.target.value))
            setText(typed)
            const canonical = toCanonical(typed)
            onChange(Number(canonical) > 0 ? canonical : '')
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(toTyped(value))
              setEditing(false)
            }
          }}
          inputMode="decimal"
          aria-label={`${label}, exact value`}
          className="w-[92px] px-2 py-1.5 rounded-lg text-[13px] text-right tabular-nums outline-none"
          style={inputStyle}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setText(toTyped(value))
            setEditing(true)
          }}
          aria-label={`${label}: ${set ? groups.format(n) : 'no cap'}. Type an exact value`}
          className="w-[92px] px-2 py-1.5 rounded-lg text-[13px] text-right tabular-nums transition-colors hover:opacity-80"
          style={{
            ...inputStyle,
            // Dashed while unset: an empty field reads as "nothing here yet",
            // a solid one as a value you chose.
            borderStyle: set ? 'solid' : 'dashed',
            color: set ? 'var(--c-text)' : 'var(--c-text-faint)',
          }}
        >
          {set ? groups.format(n) : 'No cap'}
        </button>
      )}
    </div>
  )
}
