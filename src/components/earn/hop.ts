// The token hop: a copy of the deposit sheet's token icon jumps, in a small
// arc, into the icon stack of the pool the deposit will go to, and the
// stack's own icon lands with a little give. It answers "where does my money
// go" at the moment the pool is chosen.
//
// The target is re-read on every frame, so a row that is still opening or
// closing, or a list that scrolls while the icon is in the air, does not
// throw it off. Returns a cancel function.

const DURATION = 700
const ARC = 46

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function hopToken(source: HTMLElement, target: HTMLElement, host: HTMLElement, delay = 0): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const h0 = host.getBoundingClientRect()
  const a = source.getBoundingClientRect()
  if (!a.width) return () => {}

  const clone = source.cloneNode(true) as HTMLElement
  for (const attr of [...clone.attributes]) clone.removeAttribute(attr.name)
  clone.className = 'earn-hop'
  clone.style.cssText = `left:${a.left - h0.left}px;top:${a.top - h0.top}px;width:${a.width}px;height:${a.height}px;opacity:0`
  host.appendChild(clone)
  target.classList.add('is-waiting')

  const start = performance.now() + delay
  let raf = 0
  let over = false
  const end = () => {
    over = true
    cancelAnimationFrame(raf)
    clone.remove()
    target.classList.remove('is-waiting')
  }

  const frame = (now: number) => {
    const t = (now - start) / DURATION
    if (t < 0) {
      raf = requestAnimationFrame(frame)
      return
    }
    if (t >= 1 || !target.isConnected) {
      end()
      target.classList.remove('is-landing')
      void target.offsetWidth
      target.classList.add('is-landing')
      return
    }
    const e = ease(t)
    const h = host.getBoundingClientRect()
    const b = target.getBoundingClientRect()
    const dx = b.left - h.left - (a.left - h0.left)
    const dy = b.top - h.top - (a.top - h0.top)
    const k = 1 + (b.width / a.width - 1) * e
    clone.style.opacity = String(Math.min(1, t * 8))
    clone.style.transform = `translate(${dx * e}px, ${dy * e - Math.sin(Math.PI * t) * ARC}px) scale(${k})`
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    if (!over) end()
  }
}
