import { createContext, useContext, useRef, useState, memo } from 'react'
import { motion, useInView } from 'framer-motion'
import type { IconSpec, StyleId } from './catalog'
import { variantParts, styleMetrics, type StrokePart } from './variants'
import { fileColor } from './palettes'

export type PlayMode = 'hover' | 'loop' | 'still'
export const Playback = createContext({
  mode: 'hover' as PlayMode,
  reduced: false,
  visible: true,
  speed: 1,
  dark: false,
})
export const rest = {
  x: 0,
  y: 0,
  rotate: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  pathLength: 1,
  pathOffset: 0,
  opacity: 1,
}
export function groupSequence(style: StyleId) {
  return style === 'round'
    ? { scaleX: [1, 1.1, 0.94, 1], scaleY: [1, 0.87, 1.12, 1], y: [0, 1, -1.3, 0] }
    : rest
}
export function sequence(part: StrokePart, style: StyleId, id: string, index: number) {
  if (style === 'angular') {
    const horizontal = index % 2 === 0,
      direction = index % 3 === 0 ? -1 : 1
    return {
      x: horizontal ? [0, 3 * direction, 3 * direction, 0] : [0, 0, 0, 0],
      y: horizontal ? [0, 0, 0, 0] : [0, 3 * direction, 3 * direction, 0],
      opacity: [1, 0.45, 0.7, 1],
    }
  }
  if (style === 'open') return { pathLength: [1, 0.04, 0.04, 1], opacity: [1, 0.35, 0.6, 1] }
  if (style === 'prism') {
    if (part.layer === 'back') return { x: [0, -1.5, -1.5, 0], y: [0, -1.5, -1.5, 0] }
    if (part.layer === 'bridge')
      return { pathLength: [1, 0.08, 0.08, 1], opacity: [1, 0.3, 0.7, 1] }
    return { x: [0, 1.7, 1.7, 0], y: [0, 1.2, 1.2, 0] }
  }
  if (style === 'round') {
    if (part.motion === 'blink') return { scaleY: [1, 0.15, 1.2, 1] }
    if (part.role === 'accent') return { y: [0, -2.6, 0.8, 0], rotate: [0, -10, 4, 0] }
    return {}
  }
  switch (part.motion) {
    case 'turn':
      return { rotate: id === 'loading-outline' ? [0, 180, 360] : [0, 24, 0] }
    case 'lift':
      return { y: [0, -1.8, 0] }
    case 'slide':
      return { x: [0, 1.8, 0] }
    case 'pulse':
      return { scale: [1, 1.09, 1] }
    case 'swing':
      return { rotate: [0, -7, 5, 0] }
    case 'send':
      return { x: [0, 1.5, 0], y: [0, -1.5, 0] }
    case 'blink':
      return { scaleY: [1, 0.2, 1] }
    case 'wave':
      return { y: [0, -1.2, 0], rotate: [0, 3, 0] }
    case 'draw':
      return { pathLength: [1, 0.25, 1], opacity: [1, 0.65, 1] }
    default:
      return {}
  }
}
export const AnimatedIcon = memo(function AnimatedIcon({
  icon,
  style = 'line',
  size = 32,
  play = false,
  replay = 0,
  interactive = false,
}: {
  icon: IconSpec
  style?: StyleId
  size?: number
  play?: boolean
  replay?: number
  interactive?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null),
    inView = useInView(ref, { margin: '30px' })
  const { mode, reduced, visible, speed, dark } = useContext(Playback),
    [hover, setHover] = useState(false)
  const running =
    !reduced && visible && inView && mode !== 'still' && (play || hover || mode === 'loop')
  const metrics = styleMetrics[style],
    parts = variantParts(icon, style),
    color = fileColor(icon.id, dark)
  const transition = {
    duration: metrics.duration / speed,
    ease: [0.4, 0, 0.2, 1] as const,
    repeat: mode === 'loop' ? Infinity : 0,
    repeatDelay: 1.15 / speed,
  }
  return (
    <span
      ref={ref}
      className={`motion-icon style-${style}`}
      data-playing={running}
      data-color-source={color ? 'file' : 'theme'}
      style={color ? { color } : undefined}
      onPointerEnter={interactive ? () => setHover(true) : undefined}
      onPointerLeave={interactive ? () => setHover(false) : undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
        data-glyph={icon.id}
        data-style={style}
        strokeLinecap={metrics.cap}
        strokeLinejoin={metrics.join}
      >
        <motion.g
          key={`group-${style}-${replay}`}
          initial={rest}
          animate={running ? groupSequence(style) : rest}
          style={{ transformOrigin: '12px 12px' }}
          transition={running ? transition : { duration: 0 }}
        >
          {parts.map((part, i) => (
            <motion.path
              key={`${i}-${style}-${replay}`}
              data-part={part.role}
              data-layer={part.layer}
              d={part.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={part.width ?? metrics.width}
              style={{ transformOrigin: part.origin ?? '12px 12px' }}
              initial={rest}
              animate={running ? sequence(part, style, icon.id, i) : rest}
              transition={
                running
                  ? {
                      ...transition,
                      delay:
                        (style === 'open'
                          ? Math.min(i * 0.085, 0.55)
                          : style === 'angular'
                            ? Math.min(i * 0.055, 0.3)
                            : 0) / speed,
                    }
                  : { duration: 0 }
              }
            />
          ))}
        </motion.g>
      </svg>
    </span>
  )
})
export function svgMarkup(icon: IconSpec, style: StyleId, color = '#58786d') {
  const escape = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const metrics = styleMetrics[style]
  const paths = variantParts(icon, style)
    .map(
      (part) =>
        `<path d="${part.d}" fill="none" stroke="currentColor" stroke-width="${part.width ?? metrics.width}"/>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" color="${escape(color)}" fill="none" stroke="currentColor" stroke-linecap="${metrics.cap}" stroke-linejoin="${metrics.join}"><title>${escape(icon.name)}</title>${paths}</svg>`
}
