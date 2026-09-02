import { useEffect, useMemo, useRef, useState } from 'react'

// The builder's slider, drawn as a hairline ruler instead of a native track.
// Monochrome ticks stand in for the rail; the taller ones sit on the log
// scale's decades, so the ruler shows what kind of number lives where. While
// you drag (or hold keyboard focus) the ticks around the thumb swell and the
// swell trails the thumb slightly — follow-through, not decoration — then
// relaxes flat when you let go. A ruler can also dissolve toward its right
// end (`fadeFrom`), which is how the cap slider says "past here, unlimited".
//
// The real <input type="range"> sits invisible on top, a little taller than
// the ruler (see .hairline-slider in global.css) so a finger has room, and
// pointer, touch, keyboard and screen-reader behaviour stay stock. Reduced
// motion drops the trailing and the swell; the ruler still fills and moves.

interface HairlineSliderProps {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  ariaLabel: string
  ariaValueText?: string
  /** Fractions (0..1) of the range that get a decade tick. */
  marks?: number[]
  /** Fraction after which ticks fade out toward nothing. 1: no fade. */
  fadeFrom?: number
  /** Minor tick count. Decade ticks from `marks` are added on top. */
  ticks?: number
  /** Render the thumb at half strength, for a parked "nothing set" state. */
  dimThumb?: boolean
  className?: string
}

interface Tick {
  at: number
  mark: boolean
}

const WAVE_WIDTH = 0.07

export default function HairlineSlider({
  min,
  max,
  step,
  value,
  onChange,
  ariaLabel,
  ariaValueText,
  marks = [],
  fadeFrom = 1,
  ticks = 33,
  dimThumb = false,
  className,
}: HairlineSliderProps) {
  const tickEls = useRef<(HTMLSpanElement | null)[]>([])
  const thumbEl = useRef<HTMLSpanElement>(null)
  const anim = useRef({ target: 0, pos: -1, wave: 0, amp: 0, ampTarget: 0, raf: 0, reduce: false })
  const [held, setHeld] = useState(false)
  const [focused, setFocused] = useState(false)

  const all = useMemo<Tick[]>(() => {
    const minor: Tick[] = []
    for (let i = 0; i < ticks; i++) {
      const at = i / (ticks - 1)
      // Skip minors that sit on a decade; the mark tick takes that spot.
      if (!marks.some((m) => Math.abs(m - at) < 0.4 / (ticks - 1))) minor.push({ at, mark: false })
    }
    return [...minor, ...marks.map((at) => ({ at, mark: true }))]
  }, [ticks, marks])

  const fraction = (max - min) > 0 ? (value - min) / (max - min) : 0

  // Resting look, shared by SSR render and the paint loop: filled ticks are
  // brighter, decade ticks brighter still, and the fade zone thins out.
  const restOpacity = (t: Tick, pos: number) => {
    const filled = t.at <= pos + 1e-6
    const base = t.mark ? (filled ? 0.62 : 0.3) : filled ? 0.42 : 0.15
    if (fadeFrom >= 1 || t.at <= fadeFrom) return base
    const fade = Math.max(0, 1 - (t.at - fadeFrom) / (1 - fadeFrom))
    return base * fade * fade
  }

  const paint = () => {
    const a = anim.current
    for (let i = 0; i < all.length; i++) {
      const el = tickEls.current[i]
      if (!el) continue
      const t = all[i]
      const d = (t.at - a.wave) / WAVE_WIDTH
      const env = a.amp * Math.exp(-d * d)
      el.style.opacity = String(Math.min(1, restOpacity(t, a.pos) + 0.38 * env))
      el.style.transform = `translateX(-50%) scaleY(${1 + (t.mark ? 0.5 : 1.1) * env})`
    }
    if (thumbEl.current) thumbEl.current.style.left = `${a.pos * 100}%`
  }

  // One spring loop, alive only while something is still settling. The thumb
  // chases the value stiffly, the wave chases the thumb loosely, and the
  // swell's amplitude eases in while held and back out after release.
  const kick = () => {
    const a = anim.current
    if (a.raf) return
    const frame = () => {
      const a = anim.current
      if (a.reduce) {
        a.pos = a.target
        a.wave = a.target
        a.amp = 0
        paint()
        a.raf = 0
        return
      }
      a.pos += (a.target - a.pos) * 0.3
      a.wave += (a.pos - a.wave) * 0.16
      a.amp += (a.ampTarget - a.amp) * 0.12
      const settled =
        Math.abs(a.target - a.pos) < 0.0004 &&
        Math.abs(a.pos - a.wave) < 0.0004 &&
        Math.abs(a.ampTarget - a.amp) < 0.01
      if (settled) {
        a.pos = a.target
        a.wave = a.target
        a.amp = a.ampTarget
      }
      paint()
      a.raf = settled ? 0 : requestAnimationFrame(frame)
    }
    a.raf = requestAnimationFrame(frame)
  }

  useEffect(() => {
    const a = anim.current
    a.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    a.target = Math.min(1, Math.max(0, fraction))
    if (a.pos < 0) {
      // First paint: appear settled, no travel from zero.
      a.pos = a.target
      a.wave = a.target
      paint()
      return
    }
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fraction])

  useEffect(() => {
    anim.current.ampTarget = held || focused ? 1 : 0
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, focused])

  useEffect(() => () => cancelAnimationFrame(anim.current.raf), [])

  return (
    <div className={`hairline-slider relative ${className ?? ''}`}>
      {/* Baseline: the faintest possible ground under the ticks. */}
      <span
        aria-hidden
        className="absolute left-0 right-0 top-1/2 h-px"
        style={{ backgroundColor: 'var(--c-text)', opacity: 0.07 }}
      />
      {all.map((t, i) => (
        <span
          aria-hidden
          key={`${t.mark ? 'm' : 't'}${t.at}`}
          ref={(el) => {
            tickEls.current[i] = el
          }}
          className="absolute top-1/2 w-px"
          style={{
            left: `${t.at * 100}%`,
            height: t.mark ? 12 : 7,
            marginTop: t.mark ? -6 : -3.5,
            backgroundColor: 'var(--c-text)',
            opacity: restOpacity(t, fraction),
            transform: 'translateX(-50%)',
          }}
        />
      ))}
      <span
        aria-hidden
        ref={thumbEl}
        className="absolute top-1/2 rounded-full transition-[height,box-shadow,opacity] duration-150"
        style={{
          left: `${fraction * 100}%`,
          width: 'var(--thumb-w)',
          height: held ? 20 : 16,
          backgroundColor: 'var(--c-text)',
          opacity: dimThumb && !held ? 0.4 : 1,
          transform: 'translate(-50%, -50%)',
          boxShadow: focused
            ? '0 0 0 4px color-mix(in srgb, var(--c-text) 18%, transparent)'
            : 'none',
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onFocus={(e) => setFocused(e.target.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
        className="absolute left-0 right-0 w-full opacity-0 cursor-pointer m-0"
      />
    </div>
  )
}
