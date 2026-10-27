import assert from 'node:assert/strict'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// Source-vendored READMEs stay byte-identical and are checked by provenance hashes.
const files = [
  'AGENTS.md',
  'README.md',
  '总开发计划与进度记录.md',
  ...globSync('docs/**/*.md'),
  'vendor/README.md',
]
const read = (path) => readFileSync(path, 'utf8')
const withoutFences = (text) => text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
function anchors(text) {
  const counts = new Map()
  const result = new Set()
  for (const match of withoutFences(text).matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}_ -]/gu, '')
      .replace(/ /g, '-')
    const count = counts.get(base) ?? 0
    result.add(count ? `${base}-${count}` : base)
    counts.set(base, count + 1)
  }
  for (const match of text.matchAll(/<(?:a|h[1-6])\b[^>]*\bid=["']([^"']+)["']/g))
    result.add(match[1])
  return result
}
let links = 0
for (const file of files) {
  const text = read(file)
  assert.equal((text.match(/^```/gm)?.length ?? 0) % 2, 0, `${file}: unbalanced fences`)
  for (const match of withoutFences(text).matchAll(
    /!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\)/g,
  )) {
    const href = match[1] ?? match[2]
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue
    const [path, fragment] = href.split('#')
    const target = path ? resolve(dirname(file), decodeURIComponent(path)) : resolve(file)
    assert.ok(existsSync(target), `${file}: missing ${href}`)
    if (fragment && target.endsWith('.md'))
      assert.ok(
        anchors(read(target)).has(decodeURIComponent(fragment)),
        `${file}: missing anchor ${href}`,
      )
    links++
  }
}

const plan = read('总开发计划与进度记录.md')
const rows = [...plan.matchAll(/^\| [☑☐] \| \[TZ-\d{3}\].*$/gm)].map((match) =>
  match[0]
    .split('|')
    .slice(1, -1)
    .map((value) => value.trim()),
)
assert.equal(rows.length, 61)
const completed = rows.filter((row) => row[5] === '已完成')
assert.equal(Number(plan.match(/\*\*(\d+) \/ 61 已完成/)[1]), completed.length)
for (let i = 0; i < rows.length; i++) {
  const row = rows[i]
  const id = `TZ-${String(i + 1).padStart(3, '0')}`
  assert.ok(row[1].startsWith(`[${id}]`))
  assert.equal(row[0] === '☑', row[5] === '已完成', `${id}: checkbox/status mismatch`)
  for (const dependency of row[4].matchAll(/TZ-(\d+)/g))
    assert.ok(Number(dependency[1]) < i + 1, `${id}: forward dependency`)
  const section = plan.split(`#### ${id}\n`)[1]?.split(/\n#### TZ-|\n### P[1-7]/)[0]
  assert.ok(section, `${id}: missing detail`)
  if (row[5] === '已完成') {
    assert.equal((section.match(/^- \[x\]/gm) ?? []).length, 4, `${id}: incomplete steps`)
    assert.ok(row[6].includes('RUN-'), `${id}: missing execution evidence`)
  }
}
for (const phase of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']) {
  const expected = rows.filter((row) => row[2] === phase)
  const count = expected.filter((row) => row[5] === '已完成').length
  assert.ok(
    new RegExp(`\\| ${phase} \\| [^\\n]+\\| ${count} / ${expected.length} \\|`).test(plan),
    `${phase}: statistics mismatch`,
  )
}
console.log(
  `Documentation: ${files.length} files, ${links} local links, 61 task states and phase counts verified`,
)
