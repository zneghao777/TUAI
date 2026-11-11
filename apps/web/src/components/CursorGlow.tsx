import { useEffect, useRef } from 'react'

/** Decorative light: frame-coalesced motion, no React renders or hit testing. */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const media = matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    )
    const light = ref.current
    if (!light) return
    let frame = 0,
      x = 0,
      y = 0,
      targetX = 0,
      targetY = 0,
      started = false
    const paint = () => {
      x += (targetX - x) * 0.24
      y += (targetY - y) * 0.24
      light.style.transform = `translate3d(${x}px, ${y}px, 0)`
      frame =
        Math.abs(targetX - x) + Math.abs(targetY - y) > 0.25 ? requestAnimationFrame(paint) : 0
    }
    const hide = () => {
      light.style.opacity = '0'
      cancelAnimationFrame(frame)
      frame = 0
      started = false
    }
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== 'mouse') {
        hide()
        return
      }
      targetX = event.clientX
      targetY = event.clientY
      if (!started) {
        x = targetX
        y = targetY
        started = true
      }
      light.style.opacity = '1'
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) hide()
    }
    const visibility = () => {
      if (document.hidden) hide()
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerout', leave)
    window.addEventListener('blur', hide)
    document.addEventListener('visibilitychange', visibility)
    media.addEventListener('change', hide)
    return () => {
      hide()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerout', leave)
      window.removeEventListener('blur', hide)
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', hide)
    }
  }, [])
  return <div ref={ref} className="tz-cursor-glow" aria-hidden="true" />
}
