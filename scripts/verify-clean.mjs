import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'

const original = process.cwd()
const temporary = mkdtempSync(join(tmpdir(), 'tianzhiai-p0-'))
const checkout = join(temporary, '天质 clean workspace')
const report = {
  stage: 'P0',
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  packageManager: 'pnpm@11.28.5',
  result: 'running',
  steps: [],
}
const excluded = new Set([
  '.git',
  'node_modules',
  'lib',
  '.cache',
  '.runtime',
  'reports',
  'coverage',
  'dist',
  '.DS_Store',
])
const runtimeFiles = globSync([
  'apps/*/src/**/*.ts',
  'packages/*/*/src/**/*.ts',
  'scripts/*.mjs',
  'profiles/*',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig*.json',
  'apps/*/package.json',
  'packages/*/*/package.json',
  'vendor/*/package.json',
  'vendor/*/src/**/*.ts',
]).sort()
report.runtimeFingerprint = createHash('sha256')
  .update(
    runtimeFiles
      .map((file) => `${file}\0${createHash('sha256').update(readFileSync(file)).digest('hex')}`)
      .join('\n'),
  )
  .digest('hex')
function run(args) {
  const started = Date.now()
  const result = spawnSync('npx', ['--yes', 'pnpm@11.28.5', ...args], {
    cwd: checkout,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_cache: join(temporary, 'npm-cache'),
      TIANZHIAI_HOME: join(temporary, 'host-data'),
    },
  })
  report.steps.push({
    command: `pnpm ${args.join(' ')}`,
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  assert.equal(result.status, 0, result.error?.message ?? `Clean checkout failed: pnpm ${args[0]}`)
}
try {
  cpSync(original, checkout, {
    recursive: true,
    filter: (source) =>
      !relative(original, source)
        .split(/[\\/]/)
        .some((part) => excluded.has(part)) &&
      !basename(source).endsWith('.tsbuildinfo') &&
      !/^\.env(?:\.|$)/.test(basename(source)),
  })
  // Both npm's package-manager cache and pnpm's content store start empty.
  run(['install', '--frozen-lockfile', '--store-dir', join(temporary, 'empty-pnpm-store')])
  run(['run', 'check'])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  mkdirSync(join(original, 'reports'), { recursive: true })
  writeFileSync(join(original, 'reports/p0-clean.json'), JSON.stringify(report, null, 2) + '\n')
  rmSync(temporary, { recursive: true, force: true })
}
console.log(`Clean-cache P0 acceptance: ${report.result}; reports/p0-clean.json`)
