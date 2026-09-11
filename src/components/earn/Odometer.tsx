import { useEffect, useRef, useState, type CSSProperties } from 'react'

// A figure whose digits roll like a counter. Each digit is a reel of 0–9
// that slides to its place, the rightmost first, so a changing APY or yearly
// yield reads as "moved from here to there" instead of simply swapping. When
// the figure's shape changes ("—" to "4.6%", "$0.00" to "$101.25") the reels
// are rebuilt at 0 and roll up. A change also breathes once, like GlowValue.

const isDigit = (c: string) => c >= '0' && c <= '9'

function Reels({ value }: { value: string }) {
  // First paint at 0, then roll to the digits.
  const [live, setLive] = useState(false)
  useEffect(() => {
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setLive(true))
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const chars = [...value]
  let fromRight = chars.filter(isDigit).length
  return (
    <>
      {chars.map((c, i) =>
        isDigit(c) ? (
          <span key={i} className="odo-digit">
            <span
              className="odo-reel"
              style={{
                transform: `translateY(${live ? -Number(c) * 10 : 0}%)`,
                transitionDelay: `${--fromRight * 28}ms`,
              }}
            >
              {'0123456789'.split('').map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className="odo-char">
            {c}
          </span>
        ),
      )}
    </>
  )
}

export default function Odometer({
  value,
  className = '',
  style,
}: {
  value: string
  className?: string
  style?: CSSProperties
}) {
  const shape = [...value].map((c) => (isDigit(c) ? '#' : c)).join('')
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(value)

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.animate(
      [
        { textShadow: '0 0 0 transparent' },
        { textShadow: '0 0 10px color-mix(in srgb, currentColor 45%, transparent)', offset: 0.3 },
        { textShadow: '0 0 0 transparent' },
      ],
      { duration: 800, easing: 'ease-out' },
    )
  }, [value])

  return (
    <span ref={ref} className={`odo ${className}`} style={style}>
      <span className="sr-only">{value}</span>
      <span className="odo-track" aria-hidden="true">
        <Reels key={shape} value={value} />
      </span>
    </span>
  )
}
