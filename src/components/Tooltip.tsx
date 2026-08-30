import { useEffect, useId, useRef, useState } from 'react'

// One-sentence explanations next to a label. Hover or focus opens it on
// desktop, tap toggles it on touch; Escape and an outside tap close it.
// Text only, so it stays a sentence and never turns into a paragraph.

interface TooltipProps {
  text: string
  /** Accessible name for the trigger. Defaults to "More about <label>". */
  label?: string
}

export default function Tooltip({ text, label }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex align-middle ml-1.5">
      <button
        type="button"
        aria-label={label ?? 'More about this'}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-[15px] h-[15px] rounded-full text-[10px] font-medium leading-none flex items-center justify-center cursor-help transition-colors"
        style={{
          border: '1px solid var(--c-border-2)',
          color: open ? 'var(--c-text)' : 'var(--c-text-muted)',
          backgroundColor: open ? 'var(--c-surface-2)' : 'transparent',
        }}
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className="absolute left-1/2 bottom-full mb-2 w-[230px] px-2.5 py-1.5 rounded-lg text-[12px] leading-snug font-normal text-left z-20 pointer-events-none transition-all duration-150"
        style={{
          backgroundColor: 'var(--c-cta-bg)',
          color: 'var(--c-cta-text)',
          transform: `translateX(-50%) translateY(${open ? 0 : 4}px)`,
          opacity: open ? 1 : 0,
        }}
      >
        {text}
      </span>
    </span>
  )
}
