import { useRef, useEffect, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'

interface RainButtonProps {
  children: ReactNode
  onClick?: () => void | Promise<void>
  className?: string
  style?: CSSProperties
  disabled?: boolean
  /**
   * When false, the button behaves normally (no rain, no loading state).
   * Useful for actions like "Connect Wallet" that resolve instantly.
   */
  enableLoader?: boolean
  /** ms the rain runs when onClick is not async — placeholder until real calls are wired. */
  duration?: number
}

export default function RainButton({
  children,
  onClick,
  className = '',
  style,
  disabled,
  enableLoader = true,
  duration = 2200,
}: RainButtonProps) {
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const rafRef = useRef<number>(0)

  const handleClick = async () => {
    if (loading || disabled) return
    if (!enableLoader) {
      onClick?.()
      return
    }
    setLoading(true)
    try {
      const result = onClick?.()
      if (result instanceof Promise) {
        await result
      } else {
        await new Promise((r) => setTimeout(r, duration))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loading) return
    const canvas = canvasRef.current
    const btn = btnRef.current
    if (!canvas || !btn) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    let width = 0
    let height = 0

    const setSize = () => {
      width = btn.clientWidth
      height = btn.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    setSize()

    // Rain contrasts against the button fill (cta-bg): black button → white rain,
    // white button → black rain. Mirrors --c-cta-text.
    const isDark = document.documentElement.classList.contains('dark')
    const rgb = isDark ? '0,0,0' : '255,255,255'

    // ~18° diagonal so it reads as rain, not a straight loading bar.
    const angle = (18 * Math.PI) / 180
    const dx = Math.sin(angle)
    const dy = Math.cos(angle)

    const makeDrop = (seed = true) => ({
      x: Math.random() * (width + 40) - 20,
      y: seed ? Math.random() * height : -Math.random() * 20,
      speed: Math.random() * 3 + 3,
      opacity: Math.random() * 0.5 + 0.25,
      length: Math.random() * 10 + 6,
    })

    const drops = Array.from({ length: 42 }, () => makeDrop(true))

    // "loading" sits centered at the bottom; rain lands on its top edge.
    const label = 'loading'
    ctx.font = '600 11px system-ui, sans-serif'
    const labelW = ctx.measureText(label).width
    const labelY = height - 11 // vertical center of the text
    const surfaceY = labelY - 6 // top edge where drops "hit"
    const halfSpan = labelW / 2 + 3

    // splash particles kicked up when a drop hits the text
    const splashes: { x: number; y: number; vx: number; vy: number; life: number }[] = []
    const spawnSplash = (x: number) => {
      const n = 2 + Math.floor(Math.random() * 2)
      for (let i = 0; i < n; i++) {
        splashes.push({
          x,
          y: surfaceY,
          vx: (Math.random() - 0.5) * 2.4,
          vy: -(Math.random() * 1.8 + 0.6),
          life: 1,
        })
      }
    }

    const drawLabel = () => {
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = `rgba(${rgb},0.9)`
      ctx.fillText(label, width / 2, labelY)
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.lineCap = 'round'
      ctx.lineWidth = 1
      for (const d of drops) {
        ctx.strokeStyle = `rgba(${rgb},${d.opacity})`
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - dx * d.length, d.y - dy * d.length)
        ctx.stroke()
        d.x += dx * d.speed
        d.y += dy * d.speed
        // land + splash on the text, otherwise recycle at the floor
        if (d.y >= surfaceY && Math.abs(d.x - width / 2) <= halfSpan) {
          spawnSplash(d.x)
          Object.assign(d, makeDrop(false))
        } else if (d.y - dy * d.length > height) {
          Object.assign(d, makeDrop(false))
        }
      }

      drawLabel()

      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i]
        s.x += s.vx
        s.y += s.vy
        s.vy += 0.16 // gravity
        s.life -= 0.055
        if (s.life <= 0) {
          splashes.splice(i, 1)
          continue
        }
        ctx.fillStyle = `rgba(${rgb},${s.life * 0.75})`
        ctx.fillRect(s.x, s.y, 1.5, 1.5)
      }

      rafRef.current = requestAnimationFrame(render)
    }
    render()

    return () => cancelAnimationFrame(rafRef.current)
  }, [loading])

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      disabled={disabled}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      <span
        className="block transition-opacity duration-200"
        style={{ opacity: loading ? 0 : 1 }}
      >
        {children}
      </span>
      {loading && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      )}
    </button>
  )
}
