import { useEffect, useState, type ReactNode } from 'react'

// Content that condenses out of nothing and dissolves back. The outer grid
// row grows from 0fr so the layout morphs instead of jumping, while the block
// inside blurs in like smoke settling into shape (see .smoke-in). It stays
// mounted through the exit so the reverse can play before it leaves the tree.
// A child marked .smoke-late arrives a beat after the rest.

interface SmokeProps {
  show: boolean
  children: ReactNode
  className?: string
}

export default function Smoke({ show, children, className }: SmokeProps) {
  const [mounted, setMounted] = useState(show)

  useEffect(() => {
    if (show) {
      setMounted(true)
      return
    }
    // animationend does the unmount; this covers a hidden tab, where the
    // browser may finish the animation without ever dispatching the event.
    const t = window.setTimeout(() => setMounted(false), 600)
    return () => window.clearTimeout(t)
  }, [show])

  if (!mounted) return null

  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ${className ?? ''}`}
      style={{ gridTemplateRows: show ? '1fr' : '0fr', transitionTimingFunction: 'cubic-bezier(0.2,0.8,0.2,1)' }}
    >
      <div className="overflow-hidden min-h-0">
        <div
          className={show ? 'smoke-in' : 'smoke-out'}
          // Dissolving content must not stay reachable by tab or finger.
          inert={!show}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && !show) setMounted(false)
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
