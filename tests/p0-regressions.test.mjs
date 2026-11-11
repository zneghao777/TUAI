import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile, fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { bootProfile } from '../apps/cli/lib/boot.js'
import { loadHostSettings, resolveHostPaths } from '../packages/product/host-config/lib/index.js'

const execute = promisify(execFile)
const cli = fileURLToPath(new URL('../apps/cli/lib/index.js', import.meta.url))

async function fixture(t, source = 'export default function() {}') {
  const directory = await mkdtemp(join(tmpdir(), '天质 P0 回归 '))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const manifest = join(directory, 'profile.json')
  await writeFile(
    manifest,
    JSON.stringify({ version: 1, name: 'regression', config: './cordis.yml', patches: [] }),
  )
  await writeFile(
    join(directory, 'cordis.yml'),
    JSON.stringify([{ id: 'fixture', name: './fixture.mjs' }]),
  )
  await writeFile(join(directory, 'fixture.mjs'), source)
  return { directory, manifest }
}

test('dispose rejects sync and async cleanup errors, drains siblings and is idempotent', async (t) => {
  const { manifest } = await fixture(t)
  for (const asyncFailure of [false, true]) {
    let cleaned = 0
    let broken = 0
    const runtime = await bootProfile(manifest, {
      prepare(ctx) {
        // A handled operational error before shutdown must not poison cleanup.
        ctx.logger.error(new Error('handled before disposal'))
        ctx.effect(() => () => {
          cleaned++
        })
        ctx.effect(() => () => {
          broken++
          if (asyncFailure) return Promise.reject(new Error('ASYNC_CLEANUP_FAILED'))
          throw new Error('SYNC_CLEANUP_FAILED')
        })
      },
    })
    const first = runtime.dispose()
    const second = runtime.dispose()
    await Promise.all([
      assert.rejects(first, /CLEANUP_FAILED/),
      assert.rejects(second, /CLEANUP_FAILED/),
    ])
    assert.equal(cleaned, 1)
    assert.equal(broken, 1)
    await assert.rejects(runtime.dispose(), /CLEANUP_FAILED/)
  }
  const healthy = await bootProfile(manifest, {
    prepare(ctx) {
      ctx.logger.error(new Error('handled operational error'))
    },
  })
  await healthy.dispose()
})

test('CLI check reports cleanup failure with nonzero exit and redacts diagnostics', async (t) => {
  const { directory, manifest } = await fixture(
    t,
    `
    export default function(ctx) {
      ctx.effect(() => () => {
        throw new Error('CLEANUP_FAILED ' + process.env.TIANZHIAI_SECRET_REVIEW)
      })
    }
  `,
  )
  await assert.rejects(
    execute(process.execPath, ['--expose-internals', cli, '--profile', manifest, '--check'], {
      env: {
        ...process.env,
        TUAI_HOME: join(directory, 'host'),
        TIANZHIAI_SECRET_REVIEW: 'synthetic-review-secret',
      },
      timeout: 4000,
      killSignal: 'SIGKILL',
    }),
    (error) => {
      assert.equal(error.code, 1)
      assert.equal(error.signal, null)
      assert.match(error.stderr, /CLEANUP_FAILED/)
      assert.match(error.stderr, /\[REDACTED\]/)
      assert.equal(error.stderr.includes('synthetic-review-secret'), false)
      return true
    },
  )
})

test(
  'CLI exits after startup and cleanup deadlines even with a live plugin timer',
  { timeout: 16000 },
  async (t) => {
    const { directory, manifest } = await fixture(
      t,
      `
    export default async function(ctx) {
      ctx.effect(() => {
        const timer = setInterval(() => {}, 1000)
        return () => clearInterval(timer)
      })
      await new Promise(() => {})
    }
  `,
    )
    await assert.rejects(
      execute(process.execPath, ['--expose-internals', cli, '--profile', manifest, '--check'], {
        env: { ...process.env, TUAI_HOME: join(directory, 'host') },
        timeout: 13000,
        killSignal: 'SIGKILL',
      }),
      (error) => {
        assert.equal(error.code, 1)
        assert.equal(error.signal, null)
        assert.match(error.stderr, /Profile 启动.*超时/)
        assert.match(error.stderr, /启动失败清理.*超时/)
        return true
      },
    )
  },
)

test('startup timeout cancels prepare and prevents loading entries after it resumes', async (t) => {
  const { manifest } = await fixture(t)
  let signal
  let context
  let finish
  const prepared = new Promise((resolve) => {
    finish = resolve
  })
  const starting = bootProfile(manifest, {
    timeoutMs: 30,
    prepare(ctx, cancellation) {
      context = ctx
      signal = cancellation
      return prepared
    },
  })
  await assert.rejects(starting, /超时/)
  assert.equal(signal?.aborted, true)
  finish()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(context.get('loader'), undefined)
  assert.equal(
    context.logger.buffer.some((message) => message.type === 'error'),
    false,
  )
})

test('concurrent first starts publish a complete configuration with one persistent identity', async (t) => {
  const { directory } = await fixture(t)
  for (let round = 0; round < 30; round++) {
    const paths = resolveHostPaths({ env: { TUAI_HOME: join(directory, String(round)) } })
    const results = await Promise.allSettled(
      Array.from({ length: 32 }, () => loadHostSettings(paths)),
    )
    const rejected = results.filter((result) => result.status === 'rejected')
    assert.equal(rejected.length, 0, rejected.map((result) => result.reason.message).join('; '))
    const ids = new Set(results.map((result) => result.value.hostId))
    assert.equal(ids.size, 1)
    const stored = JSON.parse(await readFile(paths.hostConfig, 'utf8'))
    assert.equal(stored.hostId, [...ids][0])
    assert.equal((await loadHostSettings(paths)).hostId, stored.hostId)
    assert.deepEqual(await readdir(paths.config), ['host.json'])
    if (process.platform !== 'win32')
      assert.equal((await stat(paths.hostConfig)).mode & 0o777, 0o600)
  }
})

test(
  'independent processes racing first creation retain the same Host identity',
  { timeout: 10000 },
  async (t) => {
    const { directory } = await fixture(t)
    const children = Array.from({ length: 4 }, () =>
      fork(
        fileURLToPath(new URL('./fixtures/host-config-race.mjs', import.meta.url)),
        [join(directory, 'host')],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
      ),
    )
    t.after(() => {
      for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
    })
    const exits = children.map((child) => once(child, 'close'))
    await Promise.all(children.map((child) => once(child, 'message')))
    const results = children.map((child) => once(child, 'message'))
    for (const child of children) child.send('start')
    const identities = (await Promise.all(results)).flatMap(([message]) => {
      assert.deepEqual(message.errors, [])
      return message.ids
    })
    assert.equal(identities.length, 128)
    assert.equal(new Set(identities).size, 1)
    for (const [code, signal] of await Promise.all(exits)) {
      assert.equal(code, 0)
      assert.equal(signal, null)
    }
  },
)
