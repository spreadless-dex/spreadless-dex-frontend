import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// One-sentence explanations next to a label. Hover or focus opens it on
// desktop, tap toggles it on touch; Escape and an outside tap close it.
// Text only, so it stays a sentence and never turns into a paragraph.
//
// The bubble lives in a portal on <body> with fixed coordinates measured off
// the trigger: several of the places it is used sit inside cards and
// accordions that clip their overflow, and a centred bubble near a column
// edge would otherwise run off screen.
//
// In Pro mode (html[data-mode="pro"]) the trigger folds away through the
// .learn-only-inline transition in global.css; nothing here needs to know.

const WIDTH = 230
const MARGIN = 8 // gap to the trigger and to the viewport edge

interface TooltipProps {
  text: string
  /** Accessible name for the trigger. Defaults to "More about <label>". */
  label?: string
}

interface Position {
  left: number
  top: number
  width: number
  above: boolean
}

export default function Tooltip({ text, label }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Position | null>(null)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)

  const place = useCallback(() => {
    const trigger = ref.current
    const bubble = bubbleRef.current
    if (!trigger || !bubble) return
    const r = trigger.getBoundingClientRect()
    const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2)
    const height = bubble.offsetHeight
    const above = r.top >= height + MARGIN || r.bottom + height + MARGIN > window.innerHeight
    const left = Math.min(
      Math.max(r.left + r.width / 2 - width / 2, MARGIN),
      window.innerWidth - width - MARGIN,
    )
    const top = above ? r.top - height - MARGIN : r.bottom + MARGIN
    setPos({ left, top, width, above })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
  }, [open, place, text])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const close = () => { setOpen(false); setPos(null) }

  return (
    <span ref={ref} className="learn-only-inline relative inline-flex align-middle ml-1.5">
      <button
        type="button"
        aria-label={label ?? 'More about this'}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={close}
        onFocus={() => setOpen(true)}
        onBlur={close}
        className="w-[15px] h-[15px] rounded-full text-[10px] font-medium leading-none flex items-center justify-center cursor-help transition-colors"
        style={{
          border: '1px solid var(--c-border-2)',
          color: open ? 'var(--c-text)' : 'var(--c-text-muted)',
          backgroundColor: open ? 'var(--c-surface-2)' : 'transparent',
        }}
      >
        i
      </button>
      {open && createPortal(
        <span
          ref={bubbleRef}
          role="tooltip"
          id={id}
          className="fixed px-2.5 py-1.5 rounded-lg text-[12px] leading-snug font-normal text-left z-50 pointer-events-none"
          style={{
            backgroundColor: 'var(--c-cta-bg)',
            color: 'var(--c-cta-text)',
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            width: pos?.width ?? `min(${WIDTH}px, calc(100vw - ${MARGIN * 2}px))`,
            visibility: pos ? 'visible' : 'hidden',
            animation: 'tooltipIn 150ms ease-out both',
          }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
