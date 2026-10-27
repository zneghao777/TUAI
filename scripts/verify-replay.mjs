// Explicit read-only baseline verification; normal builds need no reference repo.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { createRequire, isBuiltin } from 'node:module'
import { build } from 'esbuild'

const upstream = resolve(process.argv[2] ?? '')
assert.ok(process.argv[2], 'Usage: verify-replay <locked-upstream>')
const root = process.cwd()
const commit = JSON.parse(readFileSync('docs/migration/M1-迁移登记.json')).upstreamCommit
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim(),
  commit,
)
const paths = JSON.parse(readFileSync('tsconfig.base.json')).compilerOptions.paths
mkdirSync('.cache', { recursive: true })
const temporary = mkdtempSync(resolve('.cache/p1-replay-'))
const sourceHashes = new Map()
function sourcePath(name) {
  if (paths[name]) return resolve(paths[name][0])
  for (const [key, values] of Object.entries(paths))
    if (key.endsWith('*') && name.startsWith(key.slice(0, -1)))
      return resolve(values[0].replace('*', name.slice(key.length - 1)))
  throw new Error(`Unmapped replay dependency: ${name}`)
}
function canonical(value) {
  const identities = new Map()
  function visit(value) {
    if (typeof value === 'string')
      return value.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        (id) => {
          if (!identities.has(id)) identities.set(id, `identity-${identities.size}`)
          return identities.get(id)
        },
      )
    if (Array.isArray(value)) return value.map(visit)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !['time', 'createdAt', 'elapsedMs'].includes(key))
          .map(([key, value]) => [key, visit(value)]),
      )
    return value
  }
  return visit(value)
}
try {
  const results = []
  for (const baseline of [true, false]) {
    const outfile = resolve(temporary, baseline ? 'baseline.mjs' : 'product.mjs')
    await build({
      entryPoints: [resolve('tests/fixtures/core-replay.ts')],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'es2024',
      tsconfigRaw: { compilerOptions: {} },
      plugins: [
        {
          name: 'locked-replay-sources',
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, (args) => {
              if (isBuiltin(args.path)) return { path: args.path, external: true }
              if (args.path.startsWith('@deepseek-ai/'))
                return { path: sourcePath(args.path), namespace: 'replay' }
              if (args.kind === 'entry-point' || args.path.startsWith('.'))
                return {
                  path: resolve(args.importer ? dirname(args.importer) : root, args.path),
                  namespace: 'replay',
                }
              return {
                path: createRequire(resolve(dirname(args.importer), 'package.json')).resolve(
                  args.path,
                ),
                external: true,
              }
            })
            builder.onLoad({ filter: /.*/, namespace: 'replay' }, (args) => {
              const path = relative(root, args.path)
              let content =
                baseline && /^(?:packages|vendor)\//.test(path)
                  ? execFileSync('git', ['show', `${commit}:${path}`], {
                      cwd: upstream,
                      encoding: 'utf8',
                    })
                  : readFileSync(args.path, 'utf8')
              if (baseline)
                sourceHashes.set(path, createHash('sha256').update(content).digest('hex'))
              // One-file test packaging only: the immutable DSH package version.
              if (path.endsWith('/llm/src/attribution.ts'))
                content = content.replace(
                  "createRequire(import.meta.url)('../package.json')",
                  JSON.stringify({ version: '0.2.1-rc.3' }),
                )
              return { contents: content, loader: 'ts', resolveDir: dirname(args.path) }
            })
          },
        },
      ],
    })
    const child = spawnSync(process.execPath, ['--expose-internals', outfile], {
      encoding: 'utf8',
      timeout: 15000,
    })
    assert.equal(child.status, 0, child.stderr)
    results.push(canonical(JSON.parse(child.stdout)))
  }
  assert.deepEqual(
    results[1],
    results[0],
    'Migrated model inputs/events/results/cancellation differ from locked baseline',
  )
  const report = {
    stage: 'P1',
    result: 'passed',
    upstreamCommit: commit,
    normalization: [
      'wall-clock time/createdAt/elapsedMs',
      'UUID identities preserving relationships',
      'one-file package-version lookup',
    ],
    cases: [
      'text',
      'two tools and model-visible results',
      'invalid tool arguments',
      'partial-stream cancellation',
    ],
    sourceFiles: sourceHashes.size,
    digest: createHash('sha256').update(JSON.stringify(results[0])).digest('hex'),
  }
  mkdirSync('reports', { recursive: true })
  writeFileSync('reports/p1-replay.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
