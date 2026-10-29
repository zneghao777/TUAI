import svgpath from 'svgpath'
import type { IconSpec, Part, StyleId } from './catalog'

export type StrokePart = Part & { width?: number; layer?: 'back' | 'bridge' | 'front' }
export type Point = [number, number]
const p = (d: string): StrokePart => ({ d, role: 'detail', motion: 'draw' })
const b = (d: string): StrokePart => ({ d, role: 'body', motion: 'lift' })
const a = (d: string, motion: Part['motion'] = 'pulse'): StrokePart => ({
  d,
  role: 'accent',
  motion,
})
const circle = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
const capsule = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}q${r} 0 ${r} ${r}v${h - 2 * r}q0 ${r} ${-r} ${r}h${-w + 2 * r}q${-r} 0 ${-r} ${-r}v${-h + 2 * r}q0 ${-r} ${r} ${-r}Z`
const cutBox = (x: number, y: number, w: number, h: number, c = 2) =>
  `M${x + c} ${y}h${w - 2 * c}l${c} ${c}v${h - 2 * c}l${-c} ${c}h${-w + 2 * c}l${-c} ${-c}v${-h + 2 * c}Z`
const rounded: Record<string, StrokePart[]> = {
  'new-chat-outline': [
    b('M21 11a9 8 0 0 1-13 7l-5 2 1-5a9 8 0 1 1 17-4Z'),
    a('M12 7v8M8 11h8', 'turn'),
  ],
  'search-outline': [b(circle(10, 10, 6.5)), a('M15 15q6 2 5 5t-5-5', 'swing')],
  'agent-preset-outline': [
    b(capsule(3, 7, 18, 13, 6)),
    p('M9 7V4q3-4 6 0v3'),
    a('M7 13q1.5-3 3 0M14 13q1.5-3 3 0', 'blink'),
    p('M9 17q3 2 6 0'),
  ],
  'browse-outline': [
    b(capsule(2.5, 4, 19, 16, 5)),
    p('M3 10h18'),
    a('M7 7h.01M10 7h.01M13 7h.01'),
    a('m10 13 5 2-2 1-1 3Z', 'slide'),
  ],
  memory: [b('M3 8q9-10 18 0-9 9-18 0Z'), p('M3 13q9 9 18 0'), a('M3 18q9 8 18 0', 'lift')],
  'skill-outline': [b(circle(12, 12, 9)), a('M12 5q0 7 6 7-6 0-6 7 0-7-6-7 6 0 6-7Z', 'pulse')],
  schedule: [
    b(capsule(3, 5, 18, 16, 5)),
    p('M8 3v5M16 3v5'),
    a(circle(12, 14, 4), 'turn'),
    p('M12 11v3l2 1'),
  ],
  'settings-outline': [
    b('M7 4q-4 0-4 4v8q0 4 4 4h10q4 0 4-4V8q0-4-4-4Z'),
    p('M7 8v8M17 8v8'),
    a(circle(7, 11, 2), 'lift'),
    a(circle(17, 14, 2), 'lift'),
  ],
  'folder-open-outline': [
    b('M3 16V7q0-3 3-3h3q2 0 3 3h6q3 0 3 3v6'),
    a('M3 12q9 4 18 0v5q0 4-4 4H7q-4 0-4-4Z', 'lift'),
  ],
  'archive-outline': [
    b(capsule(4, 7, 16, 14, 4)),
    a(capsule(2, 3, 20, 6, 3), 'lift'),
    p('M9 13q3 3 6 0'),
  ],
  'trash-outline': [
    b('M5 8h14l-1 10q0 4-6 4t-6-4Z'),
    a('M3 7q9-2 18 0M9 6q0-5 6 0', 'swing'),
    p('M10 11v6M14 11v6'),
  ],
  'copy-outline': [b(capsule(3, 3, 13, 15, 4)), a(capsule(8, 7, 13, 15, 4), 'slide')],
  'send-outline': [a('M12 21V4q0-1-1 0l-6 7M12 4q0-1 1 0l6 7', 'lift'), p('M7 16q5 3 10 0')],
  'paper-plane-outline': [
    b('M3 10Q1 8 5 7l15-4q3 0 2 3l-6 15q-2 3-3-1l-3-6Z'),
    a('m10 14 9-8', 'send'),
  ],
  'microphone-outline': [
    b(capsule(7, 2, 10, 14, 5)),
    p('M3 11v1a9 8 0 0 0 18 0v-1M12 20v2'),
    a('M10 7h4M10 11h4', 'wave'),
  ],
  'shield-outline': [b('M12 3q5 3 9 3 1 12-9 16C2 18 2 9 3 6q4 0 9-3Z')],
  'permission-read': [
    b('M12 3q5 3 9 3 1 12-9 16C2 18 2 9 3 6q4 0 9-3Z'),
    a('M7 12q3 7 10-4', 'draw'),
  ],
  'users-outline': [
    b(circle(8, 7, 3.5)),
    b('M2 20c0-10 13-10 13 0q-6 3-13 0Z'),
    a('M17 4c6 1 5 7 0 7M18 14q6 0 4 7', 'slide'),
  ],
  notification: [b('M4 18q3-3 3-8c0-8 10-8 10 0q0 5 3 8Z'), a('M9 21q3 3 6 0', 'swing')],
  'globe-outline': [
    b(circle(12, 12, 9)),
    p('M4 8q8 5 16 0M4 16q8-5 16 0'),
    a('M12 3c-6 4-6 14 0 18M12 3c6 4 6 14 0 18', 'swing'),
  ],
  'goal-outline': [
    b(circle(11, 13, 8)),
    p(circle(11, 13, 4)),
    a('M11 13Q13 4 22 3m-4-1 4 1-1 4', 'send'),
  ],
  'refresh-outline': [p('M19 8c-5-9-17-2-14 6 2 8 13 9 15 1'), a('M20 3q3 8-6 7', 'turn')],
  'check-outline': [a('M4 12q5 9 8 3l8-11', 'draw')],
  'plus-outline': [p('M4 12h16'), a('M12 4v16', 'turn')],
  'close-outline': [p('M6 5q5 8 12 14'), a('M18 5q-4 8-12 14', 'swing')],
  'data-outline': [
    b(capsule(2, 13, 5, 9, 2.5)),
    b(capsule(9.5, 7, 5, 15, 2.5)),
    a(capsule(17, 2, 5, 20, 2.5), 'lift'),
  ],
  'play-outline': [b('M6 6q0-3 3-1l10 5q4 2 0 4L9 19q-3 2-3-1Z')],
  'pause-outline': [b(capsule(5, 3, 4, 18, 2)), a(capsule(15, 3, 4, 18, 2))],
  workflow: [
    b(circle(12, 4, 3)),
    b(circle(5, 19, 3)),
    b(circle(19, 19, 3)),
    a('M12 7v3q0 3-4 3t-3 3M12 10q0 3 4 3t3 3', 'draw'),
  ],
  'code-outline': [p('M8 5q-12 7 0 14'), a('M16 5q12 7 0 14', 'slide'), p('M14 3q-4 9-4 18')],
  handoff: [b('M8 13V5q0-3 3-3t3 3v5q7-1 8 5 0 7-8 7-4 0-7-5l-4-5q0-3 3-1Z')],
  mcp: [b(circle(12, 12, 5)), p('M12 2v5M12 17v5M2 12h5M17 12h5'), a(circle(12, 12, 1.5))],
}
const angular: Record<string, StrokePart[]> = {
  'new-chat-outline': [b('M3 3h16v13l-6 5H3Z'), p('M13 21v-5h6'), a('M7 7h8M7 11h5', 'draw')],
  'search-outline': [b('M6 3h8l4 4v7l-4 4H6l-4-4V7Z'), a('m16 16 6 6m-4-6 4 4', 'slide')],
  'agent-preset-outline': [
    b(cutBox(3, 6, 18, 15, 2)),
    p('M9 6V2h6v4M1 11v5M23 11v5'),
    a('M7 11h3v3H7ZM14 11h3v3h-3Z', 'blink'),
    p('M8 18h8'),
  ],
  'browse-outline': [b('M2 4h20v16H2Z'), p('M2 9h20M5 6.5h3'), a('M8 13h8m-3-3 3 3-3 3', 'slide')],
  memory: [b('m2 7 10-5 10 5-10 5Z'), p('M2 7v5l10 5 10-5V7'), a('M2 12v5l10 5 10-5v-5', 'lift')],
  'skill-outline': [b('M7 2h10l5 5v10l-5 5H7l-5-5V7Z'), a('M13 5 7 13h5l-1 6 7-9h-5Z')],
  schedule: [
    b('M3 4h18v17H3Z'),
    p('M7 2v4M17 2v4M3 9h18'),
    a('M7 12h4v5H7ZM15 12h3M15 16h3', 'draw'),
  ],
  'settings-outline': [
    b('M8 2h8v4l4 2 2 6-4 2v4l-6 2-4-2v-4l-6-2 2-6 4-2Z'),
    a('M9 9h6v6H9Z', 'turn'),
  ],
  'folder-open-outline': [b('M2 18V3h7l4 4h8v4'), a('M6 11h16l-5 10H2Z', 'lift')],
  'archive-outline': [b('M4 8h16v13H4Z'), a('M2 3h20v5H2Z', 'lift'), p('M9 12h6v3H9Z')],
  'trash-outline': [b('M5 7h14l-2 14H7Z'), a('M2 4h20M8 4V1h8v3', 'slide'), p('M9 10v7M15 10v7')],
  'copy-outline': [b('M3 3h13v14H3Z'), a('M8 7h13v15H8Z', 'slide'), p('M11 11h7M11 15h5')],
  'send-outline': [a('M9 22V10H3l9-9 9 9h-6v12', 'lift')],
  'paper-plane-outline': [b('M2 3h20L12 22 9 12Z'), a('M9 12 22 3', 'send')],
  'microphone-outline': [
    b(cutBox(8, 2, 8, 13, 2)),
    p('M4 9v7l4 4h8l4-4V9M12 20v3'),
    a('M11 6h2M11 10h2'),
  ],
  'shield-outline': [b('M3 3h18v11l-9 9-9-9Z'), p('M6 6h12')],
  'permission-read': [b('M3 3h18v11l-9 9-9-9Z'), a('m7 12 4 4 6-8', 'draw')],
  'users-outline': [
    b(cutBox(4, 2, 7, 7, 1)),
    b('M1 22v-8l4-3h6l4 3v8Z'),
    a('M15 3h5v6h-5M17 12h3l3 3v7', 'slide'),
  ],
  notification: [b('M8 4h8l3 4v7l3 3H2l3-3V8Z'), a('M9 21h6', 'swing'), p('M12 1v3')],
  'globe-outline': [
    b('M7 2h10l5 5v10l-5 5H7l-5-5V7Z'),
    p('M2 8h20M2 16h20'),
    a('M9 2v20M15 2v20', 'slide'),
  ],
  'goal-outline': [b('M3 5h16v16H3Z'), p('M7 9h8v8H7Z'), a('m11 13 11-11m-6 0h6v6', 'send')],
  'refresh-outline': [p('M20 9V5l-4-3H7L3 6v12l4 4h10l4-4v-4'), a('M16 9h5V4', 'turn')],
  'check-outline': [a('m3 11 7 7L22 4', 'draw'), p('m3 16 7 7')],
  'plus-outline': [p('M2 12h20'), a('M12 2v20', 'turn'), p('M2 9v6M22 9v6M9 2h6M9 22h6')],
  'close-outline': [p('M3 3 21 21'), a('M21 3 3 21', 'turn'), p('M3 6V3h3M18 21h3v-3')],
  'data-outline': [b('M2 22V12h5v10ZM9 22V7h5v15Z'), a('M17 22V2h5v20Z', 'lift')],
  'play-outline': [b('M5 3v18l16-9Z'), p('M2 3v18')],
  'pause-outline': [b('M4 3h5v18H4Z'), a('M15 3h5v18h-5Z')],
  workflow: [
    b('M8 2h8v5H8Z'),
    b('M1 17h8v5H1Z'),
    b('M15 17h8v5h-8Z'),
    a('M12 7v5H5v5m7-5h7v5', 'draw'),
  ],
  'code-outline': [p('m8 3-7 9 7 9'), a('m16 3 7 9-7 9', 'slide'), p('M14 1 10 23')],
  handoff: [b('M8 13V3l2-2 3 2v7h6l3 3v5l-4 4h-7l-9-9 2-2 4 4Z')],
  mcp: [
    b('M7 7h10v10H7Z'),
    p('M10 1v6M14 1v6M10 17v6M14 17v6M1 10h6M1 14h6M17 10h6M17 14h6'),
    a('M10 10h4v4h-4Z'),
  ],
}
// Related actions keep their semantics while inheriting the same family geometry.
const aliases: Record<string, string> = {
  'folder-open': 'folder-open-outline',
  'file-folder': 'folder-open-outline',
  'folder-close': 'folder-open-outline',
  'plan-outline': 'schedule',
  'alarm-clock-outline': 'schedule',
  'web-action': 'browse-outline',
  'inspect-outline': 'browse-outline',
  'check-circle-fill': 'check-circle-outline',
  'close-fill': 'close-outline',
  'pin-fill': 'pin-outline',
}

// A small stroke font keeps even file abbreviations free of filled glyphs.
const font: Record<string, string> = {
  A: 'M0 5 1.5 0 3 5M.6 3h1.8',
  B: 'M0 5V0h2l1 1-1 1.5H0m2 0 1 1.5-1 1H0',
  C: 'M3 0H1L0 1v3l1 1h2',
  D: 'M0 0v5h1l2-1V1L1 0Z',
  E: 'M3 0H0v5h3M0 2.5h2',
  F: 'M3 0H0v5M0 2.5h2',
  G: 'M3 1 2 0H1L0 1v3l1 1h2V3H2',
  H: 'M0 0v5M3 0v5M0 2.5h3',
  I: 'M0 0h3M1.5 0v5M0 5h3',
  J: 'M3 0v4L2 5H1L0 4',
  K: 'M0 0v5M3 0 0 2.5 3 5',
  L: 'M0 0v5h3',
  M: 'M0 5V0l1.5 2L3 0v5',
  N: 'M0 5V0l3 5V0',
  O: 'M1 0h1l1 1v3L2 5H1L0 4V1Z',
  P: 'M0 5V0h2l1 1v1l-1 1H0',
  Q: 'M1 0h1l1 1v3L2 5H1L0 4V1ZM2 4l2 2',
  R: 'M0 5V0h2l1 1v1l-1 1H0m2 0 1 2',
  S: 'M3 0H1L0 1l3 3-1 1H0',
  T: 'M0 0h3M1.5 0v5',
  U: 'M0 0v4l1 1h1l1-1V0',
  V: 'M0 0 1.5 5 3 0',
  W: 'M0 0v5l1.5-2L3 5V0',
  X: 'M0 0 3 5M3 0 0 5',
  Y: 'M0 0 1.5 2.5 3 0M1.5 2.5V5',
  Z: 'M0 0h3L0 5h3',
  '0': 'M1 0h1l1 1v3L2 5H1L0 4V1Z',
  '1': 'M0 1 1.5 0v5M0 5h3',
  '2': 'M0 1 1 0h1l1 1L0 5h3',
  '3': 'M0 0h3L1 2.5 3 3v2H0',
  '4': 'M2 5V0L0 3h3',
  '5': 'M3 0H0v2.5h2l1 1v1L2 5H0',
  '6': 'M3 0H1L0 1v3l1 1h1l1-1V3L2 2H0',
  '7': 'M0 0h3L1 5',
  '8': 'M1 0h1l1 1-3 3 1 1h1l1-1L0 1Z',
  '9': 'M3 3H1L0 2V1l1-1h1l1 1v3L2 5H0',
  '+': 'M0 2.5h3M1.5 1v3',
  '-': 'M0 2.5h3',
  '#': 'M1 0v5M2.5 0v5M0 1.5h3.5M0 3.5h3.5',
  '<': 'm3 0-3 2.5L3 5',
  '>': 'm0 0 3 2.5L0 5',
  '/': 'M3 0 0 5',
}
function badgeParts(label?: string): StrokePart[] {
  if (!label) return []
  const scale = label.length > 3 ? 0.65 : 0.8,
    total = (label.length * 4 - 1) * scale,
    start = (24 - total) / 2
  return [
    {
      d: [...label.toUpperCase()]
        .map((letter, i) => {
          const glyph = font[letter]
          if (!glyph) throw new Error(`Missing stroke font: ${letter}`)
          return svgpath(glyph)
            .scale(scale)
            .translate(start + i * 4 * scale, 12)
            .round(3)
            .toString()
        })
        .join(' '),
      role: 'detail',
      motion: 'draw',
      width: 0.8,
    },
  ]
}
const n = (v: number) => Number(v.toFixed(3))
const point = (v: Point) => `${n(v[0])} ${n(v[1])}`
interface Contour {
  points: Point[]
  closed: boolean
}
// Absolute contours, including multiple moves. No browser measurements or random jitter.
function contours(d: string, steps = 4): Contour[] {
  const result: Contour[] = [],
    path = svgpath(d).unarc().unshort().abs()
  if ('err' in path && typeof path.err === 'string' && path.err) throw new Error(path.err)
  let current: Contour | undefined
  path.iterate((segment, _i, x, y) => {
    const cmd = segment[0].toUpperCase(),
      values = segment.slice(1) as number[]
    if (cmd === 'M') {
      current = { points: [[values[0], values[1]]], closed: false }
      result.push(current)
      return
    }
    if (!current) return
    if (cmd === 'Z') {
      current.closed = true
      return
    }
    if (cmd === 'L') current.points.push([values[0], values[1]])
    else if (cmd === 'H') current.points.push([values[0], y])
    else if (cmd === 'V') current.points.push([x, values[0]])
    else if (cmd === 'C' || cmd === 'Q') {
      const count = cmd === 'Q' ? Math.max(1, steps - 1) : steps
      for (let i = 1; i <= count; i++) {
        const t = i / count,
          u = 1 - t
        current.points.push(
          cmd === 'C'
            ? [
                u * u * u * x +
                  3 * u * u * t * values[0] +
                  3 * u * t * t * values[2] +
                  t * t * t * values[4],
                u * u * u * y +
                  3 * u * u * t * values[1] +
                  3 * u * t * t * values[3] +
                  t * t * t * values[5],
              ]
            : [
                u * u * x + 2 * u * t * values[0] + t * t * values[2],
                u * u * y + 2 * u * t * values[1] + t * t * values[3],
              ],
        )
      }
    } else throw new Error(`Unsupported SVG command ${cmd}`)
  })
  for (const c of result) {
    c.points = c.points.filter(
      (p, i, arr) => i === 0 || Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) > 0.001,
    )
    if (
      c.closed &&
      c.points.length > 1 &&
      Math.hypot(c.points[0][0] - c.points.at(-1)![0], c.points[0][1] - c.points.at(-1)![1]) < 0.001
    )
      c.points.pop()
  }
  return result
}
function polygon(d: string): string {
  return contours(d, 2)
    .map((c) => `M${c.points.map(point).join('L')}${c.closed ? 'Z' : ''}`)
    .join(' ')
}
function roundedCorners(d: string): string {
  return contours(d, 4)
    .map(({ points: pts, closed }) => {
      if (pts.length < 3) return `M${pts.map(point).join('L')}`
      const result: string[] = []
      const cut = (v: Point, t: Point) => {
        const length = Math.hypot(t[0] - v[0], t[1] - v[1])
        const f = Math.min(0.3, 1.8 / (length || 1))
        return [v[0] + (t[0] - v[0]) * f, v[1] + (t[1] - v[1]) * f] as Point
      }
      for (let i = 0; i < pts.length; i++) {
        if (!closed && (i === 0 || i === pts.length - 1)) {
          result.push(`${i ? 'L' : 'M'}${point(pts[i])}`)
          continue
        }
        const prev = pts[(i - 1 + pts.length) % pts.length],
          v = pts[i],
          next = pts[(i + 1) % pts.length]
        result.push(`${i ? 'L' : 'M'}${point(cut(v, prev))}Q${point(v)} ${point(cut(v, next))}`)
      }
      return result.join(' ') + (closed ? 'Z' : '')
    })
    .join(' ')
}
function openSegments(part: StrokePart): StrokePart[] {
  if (part.width) return [part]
  return contours(part.d, 7).flatMap((c) => {
    if (c.points.length < 3) return [{ ...part, d: `M${c.points.map(point).join('L')}` }]
    const pts = c.closed ? [...c.points, c.points[0]] : c.points
    const spans: number[] = [0]
    for (let i = 1; i < pts.length; i++)
      spans.push(spans[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    const total = spans.at(-1)!
    if (total < 5) return [part]
    const slices = total > 32 ? 3 : 2,
      gap = Math.min(1.7, total * 0.08),
      segmentLength = total / slices
    function at(distance: number): Point {
      const i = Math.max(
        1,
        spans.findIndex((l) => l >= distance),
      )
      const f = (distance - spans[i - 1]) / (spans[i] - spans[i - 1] || 1)
      return [
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
      ]
    }
    return Array.from({ length: slices }, (_, i) => {
      const lo = i * segmentLength + gap / 2,
        hi = (i + 1) * segmentLength - gap / 2
      const points = [at(lo), ...pts.filter((_p, j) => spans[j] > lo && spans[j] < hi), at(hi)]
      return { ...part, d: `M${points.map(point).join('L')}`, motion: 'draw' as const }
    })
  })
}
const prismMatrix = [0.78, -0.19, 0.26, 0.76, -0.4, 4.6]
function spatial(parts: StrokePart[]): StrokePart[] {
  const fronts = parts.map((part) => ({
    ...part,
    d: svgpath(part.d).matrix(prismMatrix).round(3).toString(),
    layer: 'front' as const,
  }))
  const bodies = fronts.filter((part) => part.role === 'body' && !part.width)
  const hosts = bodies.length ? bodies : fronts.slice(0, 1)
  const backs = hosts.map((part) => ({
    ...part,
    d: svgpath(part.d).translate(-1.7, -2.1).round(3).toString(),
    layer: 'back' as const,
    width: 0.85,
  }))
  const bridges = hosts.flatMap((part) =>
    contours(part.d).flatMap((c) => {
      const pts = c.points
      const indices = [0, Math.floor(pts.length / 3), Math.floor((pts.length * 2) / 3)]
      return indices
        .filter((i, j) => indices.indexOf(i) === j)
        .map((i) => ({
          d: `M${point(pts[i])}l-1.7-2.1`,
          role: 'detail' as const,
          motion: 'draw' as const,
          layer: 'bridge' as const,
          width: 0.85,
        }))
    }),
  )
  return [...backs, ...bridges, ...fronts]
}
const cache = new Map<string, StrokePart[]>()
export function variantParts(icon: IconSpec, style: StyleId): StrokePart[] {
  const key = `${icon.id}:${style}`,
    cached = cache.get(key)
  if (cached) return cached
  const alias = aliases[icon.id] ?? icon.id
  let base: StrokePart[] = icon.parts.map(({ solid: _solid, ...part }) => part)
  const family =
    style === 'round' ? rounded : style === 'angular' || style === 'prism' ? angular : undefined
  if (family?.[alias]) base = family[alias]
  if (icon.badge) {
    if (style === 'round')
      base = [b('M8 2h6q7 3 7 7v9q0 4-4 4H7q-4 0-4-4V6q0-4 5-4Z'), p('M14 2v5q0 2 3 2h4')]
    else if (style === 'angular' || style === 'prism')
      base = [b('M4 2h11l6 6v14H4Z'), p('M15 2v6h6')]
    base = [...base, ...badgeParts(icon.badge)]
  }
  let parts: StrokePart[]
  if (style === 'angular') parts = base.map((part) => ({ ...part, d: polygon(part.d) }))
  else if (style === 'round')
    parts =
      family?.[alias] || icon.badge
        ? base
        : base.map((part) => ({ ...part, d: roundedCorners(part.d) }))
  else if (style === 'open') parts = base.flatMap(openSegments)
  else if (style === 'prism') parts = spatial(base.map((part) => ({ ...part, d: polygon(part.d) })))
  else parts = base
  cache.set(key, parts)
  return parts
}
export const styleMetrics: Record<
  StyleId,
  {
    width: number
    cap: 'round' | 'butt' | 'square'
    join: 'round' | 'miter' | 'bevel'
    duration: number
  }
> = {
  line: { width: 1.2, cap: 'round', join: 'round', duration: 0.85 },
  round: { width: 1.35, cap: 'round', join: 'round', duration: 1.35 },
  angular: { width: 1.15, cap: 'square', join: 'miter', duration: 1.6 },
  open: { width: 1.15, cap: 'round', join: 'round', duration: 1.85 },
  prism: { width: 1.05, cap: 'round', join: 'round', duration: 1.8 },
}
