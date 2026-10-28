import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { workspacePackages } from './workspace.mjs'

const listing = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--json'], { encoding: 'utf8' }),
)
const allowed = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
])
const notices = []
for (const [license, packages] of Object.entries(listing)) {
  for (const pkg of packages) {
    const developmentCss = license === 'MPL-2.0' && /^lightningcss(?:-|$)/.test(pkg.name)
    // jsdom's unchanged dependency; package LICENSE.md includes the required notice.
    const developmentCache = license === 'BlueOak-1.0.0' && pkg.name === 'lru-cache'
    assert.ok(
      allowed.has(license) || developmentCss || developmentCache,
      `${pkg.name}: unreviewed license ${license}`,
    )
    notices.push({
      name: pkg.name,
      versions: pkg.versions,
      license,
      scope:
        developmentCss || developmentCache
          ? 'test/build development dependency; unchanged license notice retained'
          : 'installed dependency',
    })
  }
}
for (const pkg of workspacePackages().filter((pkg) => pkg.name.startsWith('@deepseek-ai/'))) {
  const native = pkg.dir.startsWith('native/system/')
  assert.equal(pkg.license, native ? 'BSD-3-Clause' : 'MIT', pkg.name)
  assert.ok(
    readFileSync(`${pkg.dir}/LICENSE`, 'utf8').includes(
      native ? 'Redistribution and use' : 'MIT License',
    ),
    pkg.name,
  )
  notices.push({
    name: pkg.name,
    versions: [pkg.version],
    license: pkg.license,
    scope: 'source migrated; LICENSE retained',
  })
}
mkdirSync('reports', { recursive: true })
writeFileSync('reports/dependency-licenses.json', JSON.stringify(notices, null, 2) + '\n')
console.log(
  `Licenses: ${notices.length} dependency/package entries reviewed; source notices preserved`,
)
