import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

// A figure that breathes when it changes. Anywhere a number follows a
// slider (step headers in the pool builder, a cap's own readout) the new
// value gets one faint, short glow so the eye finds what moved without the
// page shouting about it. Nothing on first paint: only a change glows.

interface GlowValueProps {
  value: ReactNode
  className?: string
  style?: CSSProperties
}

export default function GlowValue({ value, className, style }: GlowValueProps) {
  const key = typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)
  const [pulse, setPulse] = useState(0)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    // Remounting the span restarts the animation from the top on every change.
    setPulse((p) => p + 1)
  }, [key])

  return (
    <span key={pulse} className={`${pulse ? 'value-glow ' : ''}${className ?? ''}`} style={style}>
      {value}
    </span>
  )
}
