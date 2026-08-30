import { useEffect, useRef, useState } from 'react'

// A number that counts to its new value instead of jumping. Used for the
// preview's price impact and LP earnings so a preset change is felt, not
// just read. Honors reduced motion.

interface TickNumberProps {
  value: number
  format: (v: number) => string
  className?: string
  style?: React.CSSProperties
}

export default function TickNumber({ value, format, className, style }: TickNumberProps) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = from.current
    const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const step = (t: number) => {
      const k = 1 - Math.pow(1 - Math.min(1, (t - t0) / 400), 2)
      const v = start + (value - start) * k
      setShown(v)
      if (k < 1) raf.current = requestAnimationFrame(step)
      else from.current = value
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value])

  return (
    <span className={`tabular-nums ${className ?? ''}`} style={style}>
      {format(shown)}
    </span>
  )
}
