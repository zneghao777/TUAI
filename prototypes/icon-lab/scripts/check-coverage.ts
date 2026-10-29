import assert from 'node:assert/strict'
import { icons, inventory, currentCount, futureCount, styles } from '../src/catalog'
import { variantParts } from '../src/variants'
import { svgMarkup, sequence, groupSequence } from '../src/AnimatedIcon'
import { exportColor, fileColor, palettes } from '../src/palettes'
import svgpath from 'svgpath'
import { inlineMapping, preserved } from '../src/source-map'
const ids = new Set(icons.map((icon) => icon.id))
assert.equal(ids.size, icons.length, 'duplicate icon identifiers')
for (const entry of inventory.registry)
  assert(ids.has(entry.id), `Missing shared glyph: ${entry.id}`)
for (const type of inventory.codeTypes)
  assert(ids.has(`file-${type}`), `Missing code file: ${type}`)
for (const entry of inventory.inline) {
  assert(entry.path in inlineMapping, `Unreviewed inline SVG: ${entry.path}`)
  const mapped = inlineMapping[entry.path]
  assert(mapped.length || preserved[entry.path], `Missing reason: ${entry.path}`)
  for (const id of mapped)
    if (!id.startsWith('file-types:')) assert(ids.has(id), `Missing inline mapping: ${id}`)
}
for (const icon of icons) {
  assert(icon.parts.length, `Empty icon ${icon.id}`)
  assert(
    icon.parts.some((part) => part.motion),
    `No animated layer: ${icon.id}`,
  )
  assert(icon.sources.length, `Missing provenance: ${icon.id}`)
}
for (const icon of icons) {
  for (const style of styles) {
    const parts = variantParts(icon, style.id)
    assert(parts.length, `Empty ${icon.id}/${style.id}`)
    for (const part of parts) {
      assert(!/NaN|Infinity|undefined/.test(part.d), `Invalid geometry: ${icon.id}/${style.id}`)
      const path = svgpath(part.d)
      assert(!('err' in path && path.err), `Invalid SVG path: ${icon.id}/${style.id}`)
    }
    const output = svgMarkup(icon, style.id)
    assert(!/fill="(?!none")/.test(output), `Unexpected fill: ${icon.id}/${style.id}`)
    assert(
      !/<text|<linearGradient|<filter/.test(output),
      'All artwork, including type labels, must be strokes',
    )
    assert(output.includes('stroke="currentColor"'), 'Missing inherited stroke')
  }
}
for (const id of [
  'agent-preset-outline',
  'new-chat-outline',
  'memory',
  'browse-outline',
  'skill-outline',
  'schedule',
]) {
  const item = icons.find((icon) => icon.id === id)!
  const geometry = new Set(
    styles.map((style) =>
      variantParts(item, style.id)
        .map((part) => part.d)
        .join('|'),
    ),
  )
  assert.equal(geometry.size, 5, `Representative shapes did not change: ${id}`)
  const animations = new Set(
    styles.map((style) =>
      JSON.stringify([
        groupSequence(style.id),
        sequence(variantParts(item, style.id)[0], style.id, id, 0),
      ]),
    ),
  )
  assert.equal(animations.size, 5, `Representative animation programs did not change: ${id}`)
}
for (const palette of palettes) {
  assert.equal(exportColor('file-pdf', palette.id, false), '#c53942')
  assert.equal(exportColor('file-typescript', palette.id, false), '#3178c6')
  assert.equal(exportColor('new-chat-outline', palette.id, false), palette.light)
}
assert.notEqual(fileColor('file-pdf'), fileColor('file-excel'))
console.log(
  JSON.stringify(
    {
      shared: inventory.registry.length,
      codeFiles: inventory.codeTypes.length,
      inlineSources: inventory.inline.length,
      current: currentCount,
      future: futureCount,
      total: icons.length,
      styles: styles.length,
      variants: icons.length * styles.length,
    },
    null,
    2,
  ),
)
