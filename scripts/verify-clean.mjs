import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'

const original = process.cwd()
const stage = process.argv[2] ?? 'P2'
assert.ok(['P1', 'P2'].includes(stage), 'Expected P1 or P2')
const temporary = mkdtempSync(join(tmpdir(), `tianzhiai-${stage.toLowerCase()}-`))
const checkout = join(temporary, '天质 clean workspace')
const report = {
  stage,
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
  '.release',
  '.DS_Store',
])
const runtimeFiles = globSync([
  'apps/*/src/**/*',
  'apps/*/public/**/*',
  'patches/*',
  'apps/*/index.html',
  'apps/*/vite.config.ts',
  'packages/*/*/src/**/*.ts',
  'packages/*/*/src/**/*.tsx',
  'packages/*/*/src/**/*.css',
  'packages/*/*/tsconfig*.json',
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
  'native/system/packages/*/package.json',
  'native/system/packages/*/src/**/*',
  'native/system/scripts/*',
])
  .filter((path) => statSync(path).isFile())
  .sort()
report.runtimeFingerprint = createHash('sha256')
  .update(
    runtimeFiles
      .map((file) => `${file}\0${createHash('sha256').update(readFileSync(file)).digest('hex')}`)
      .join('\n'),
  )
  .digest('hex')
async function run(args) {
  const started = Date.now()
  const timeoutMs = args[0] === 'run' && args[1] === 'check' ? 600_000 : 180_000
  const child = spawn('npx', ['--yes', 'pnpm@11.28.5', ...args], {
    cwd: checkout,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_cache: join(temporary, 'npm-cache'),
      TUAI_HOME: join(temporary, 'host-data'),
    },
  })
  let stdout = '',
    stderr = '',
    failure
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    process.stdout.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
    process.stderr.write(chunk)
  })
  const terminate = (signal) => {
    try {
      if (process.platform === 'win32') child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  let force
  const timer = setTimeout(() => {
    failure = `Independent acceptance exceeded ${timeoutMs / 1000} seconds`
    terminate('SIGTERM')
    force = setTimeout(() => terminate('SIGKILL'), 1000)
  }, timeoutMs)
  let status
  try {
    status = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
  } finally {
    clearTimeout(timer)
    clearTimeout(force)
  }
  report.steps.push({
    command: `pnpm ${args.join(' ')}`,
    exitCode: status,
    elapsedMs: Date.now() - started,
    stdout,
    stderr,
    error: failure,
  })
  assert.equal(status, 0, failure ?? `Clean checkout failed: pnpm ${args[0]}`)
}
try {
  cpSync(original, checkout, {
    recursive: true,
    filter: (source) =>
      !relative(original, source)
        .split(/[\\/]/)
        .some((part) => excluded.has(part)) &&
      !basename(source).endsWith('.tsbuildinfo') &&
      !/^native\/system\/packages\/[^/]+\/bin(?:\/|$)/.test(relative(original, source)) &&
      !/^\.env(?:\.|$)/.test(basename(source)),
  })
  // Both npm's package-manager cache and pnpm's content store start empty.
  await run(['install', '--frozen-lockfile', '--store-dir', join(temporary, 'empty-pnpm-store')])
  await run(['run', 'check'])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  mkdirSync(join(original, 'reports'), { recursive: true })
  writeFileSync(
    join(original, `reports/${stage.toLowerCase()}-clean.json`),
    JSON.stringify(report, null, 2) + '\n',
  )
  rmSync(temporary, { recursive: true, force: true })
}
console.log(
  `Clean-cache ${stage} acceptance: ${report.result}; reports/${stage.toLowerCase()}-clean.json`,
)
