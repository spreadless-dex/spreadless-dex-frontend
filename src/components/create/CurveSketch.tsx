import { useEffect, useRef } from 'react'
import { constantProductPoints, stableCurvePoints } from '../../lib/stellar/poolParams'

// The preview's curve. When A changes the path is tweened point by point
// (same x samples for every A), so the curve bends into its new shape rather
// than swapping. Constant product sits behind it as a dashed reference.

const W = 240
const H = 150
const M = 8

function toSvg([x, y]: [number, number]): [number, number] {
  return [M + (x / 200) * (W - 2 * M), M + (H - 2 * M) - (y / 200) * (H - 2 * M)]
}

function pathFrom(points: [number, number][]): string {
  return points
    .map(toSvg)
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join('')
}

const CP_PATH = pathFrom(constantProductPoints())

interface CurveSketchProps {
  amp: number
  className?: string
}

export default function CurveSketch({ amp, className }: CurveSketchProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const current = useRef<[number, number][]>(stableCurvePoints(amp))
  const raf = useRef<number>(0)

  useEffect(() => {
    const target = stableCurvePoints(amp)
    const path = pathRef.current
    if (!path) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      current.current = target
      path.setAttribute('d', pathFrom(target))
      return
    }
    const from = current.current.map((p) => [...p] as [number, number])
    const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const step = (t: number) => {
      const k = 1 - Math.pow(1 - Math.min(1, (t - t0) / 450), 3)
      current.current = from.map((p, i) => [p[0], p[1] + (target[i][1] - p[1]) * k])
      path.setAttribute('d', pathFrom(current.current))
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [amp])

  const [cx, cy] = toSvg([100, 100])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-label={`StableSwap curve at A ${amp}`} role="img">
      <path d={CP_PATH} fill="none" stroke="var(--c-border-2)" strokeDasharray="3 4" strokeWidth={1.2} />
      <path ref={pathRef} d={pathFrom(current.current)} fill="none" stroke="var(--c-accent)" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3} fill="var(--c-text)" />
    </svg>
  )
}
