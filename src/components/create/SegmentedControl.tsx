import { useLayoutEffect, useRef, useState } from 'react'

// Presets as one control with a sliding thumb: the thumb moves to the picked
// option instead of each button repainting, so a choice reads as one motion.
// Options carry an optional second line (the hint under the label). On a
// narrow screen four hints do not fit beside each other without wrapping, so
// there the control shows labels only and the picked option's hint sits
// below it as a single quiet line, crossfading as the choice changes.

export interface SegmentOption<K extends string | number> {
  key: K
  label: string
  hint?: string
}

interface SegmentedControlProps<K extends string | number> {
  options: SegmentOption<K>[]
  value: K
  onChange: (key: K) => void
  /** Compact: single-line labels, tighter padding. */
  size?: 'md' | 'sm'
  ariaLabel: string
}

export default function SegmentedControl<K extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
}: SegmentedControlProps<K>) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  const measure = () => {
    const el = ref.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }

  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length])

  const activeHint = options.find((o) => o.key === value)?.hint
  const hasHints = options.some((o) => o.hint)

  return (
    <div>
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        className={`relative grid grid-flow-col auto-cols-fr gap-1 rounded-xl ${size === 'sm' ? 'p-[3px]' : 'p-1'}`}
        style={{
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
        }}
      >
        {thumb && (
          <span
            aria-hidden
            className="absolute rounded-lg transition-all duration-300"
            style={{
              top: size === 'sm' ? 3 : 4,
              bottom: size === 'sm' ? 3 : 4,
              left: thumb.left,
              width: thumb.width,
              backgroundColor: 'var(--c-surface)',
              boxShadow: 'var(--c-widget-shadow, 0 1px 3px rgba(0,0,0,0.14))',
              transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          />
        )}
        {options.map((o) => {
          const active = o.key === value
          return (
            <button
              key={String(o.key)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.key)}
              className={`relative z-10 rounded-lg text-center transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-2 py-1.5'}`}
              style={{
                color: active ? 'var(--c-text)' : 'var(--c-text-muted)',
              }}
            >
              <span className="block text-[13px] font-semibold leading-tight">{o.label}</span>
              {o.hint && <span className="hidden sm:block text-[11px] leading-tight mt-0.5 opacity-80">{o.hint}</span>}
            </button>
          )
        })}
      </div>
      {hasHints && (
        <p
          key={String(value)}
          className="sm:hidden text-[11px] leading-tight mt-2 px-1 animate-blur-in truncate"
          style={{ color: 'var(--c-text-faint)' }}
          aria-hidden
        >
          {activeHint ?? '\u00a0'}
        </p>
      )}
    </div>
  )
}
