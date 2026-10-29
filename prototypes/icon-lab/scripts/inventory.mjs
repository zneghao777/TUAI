import { format, resolveConfig } from 'prettier'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const sources = []
function walk(dir) {
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    if (['node_modules', 'lib', 'tests', 'dist'].includes(entry.name)) continue
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(path)
    else if (/\.(tsx?|svg)$/.test(path))
      sources.push({ path, text: readFileSync(resolve(root, path), 'utf8') })
  }
}
walk('apps/web/src')
walk('packages/client')
const shared = 'packages/client/ui-primitives/src/icons/index.tsx'
const declarations = sources.find((s) => s.path === shared).text
const symbols = [...declarations.matchAll(/export const (\w+) = productIcon\('([^']+)'/g)]
for (const match of declarations.matchAll(/export const (\w+) = appsAddIcon\(/g)) {
  for (const glyph of ['apps-add-outline', 'apps-add-compact-outline'])
    symbols.push(['', match[1], glyph])
}
const glyphs = [...new Set([...declarations.matchAll(/productIcon\('([^']+)'/g)].map((m) => m[1]))]
const refs = (names) =>
  sources.flatMap((s) => {
    if (s.path === shared || /artwork|icon-sprite/.test(s.path)) return []
    return s.text
      .split('\n')
      .flatMap((line, i) =>
        names.some((n) => new RegExp(`\\b${n}\\b`).test(line))
          ? [{ path: s.path, line: i + 1 }]
          : [],
      )
  })
const registry = glyphs.map((id) => ({
  id,
  symbols: symbols.filter((s) => s[2] === id).map((s) => s[1]),
  sources: refs(symbols.filter((s) => s[2] === id).map((s) => s[1])),
  registry: shared,
}))
const fileSource = 'packages/client/ui-primitives/src/code-file-types.ts'
const codeTypes = [
  ...readFileSync(resolve(root, fileSource), 'utf8')
    .split('] as const')[0]
    .matchAll(/'([^']+)'/g),
].map((m) => m[1])
const inline = sources
  .filter((s) => /<svg\b/.test(s.text) && !s.path.includes('/icons/') && !/artwork/.test(s.path))
  .map((s) => ({ path: s.path, line: s.text.slice(0, s.text.indexOf('<svg')).split('\n').length }))
const inventory = {
  scope: '源码目录与引用，不代表运行时可达性；品牌 Logo、供应商与站点商标保留',
  registry,
  codeTypes,
  fileSource,
  inline,
}
const target = fileURLToPath(new URL('../src/inventory.json', import.meta.url))
writeFileSync(
  target,
  await format(JSON.stringify(inventory), { ...(await resolveConfig(target)), parser: 'json' }),
)
console.log(
  `${registry.length} shared glyphs, ${codeTypes.length} code file types, ${inline.length} inline SVG source files → ${relative(root, target)}`,
)
