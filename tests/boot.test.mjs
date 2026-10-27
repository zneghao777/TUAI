import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootProfile } from '../apps/cli/lib/boot.js'

const cli = fileURLToPath(new URL('../apps/cli/lib/index.js', import.meta.url))
const development = fileURLToPath(new URL('../profiles/development.json', import.meta.url))
const production = fileURLToPath(new URL('../profiles/production.json', import.meta.url))

test('product profiles boot repeatedly, inject immutable arguments and dispose', async () => {
  for (let round = 0; round < 3; round++) {
    const runtime = await bootProfile(development, { args: ['中文', '--dry-run'] })
    const probe = runtime.ctx.get('tianzhiaiProbe')
    assert.equal(probe.label, 'TIanZhiAi P0')
    assert.deepEqual(probe.args, ['中文', '--dry-run'])
    assert.ok(Object.isFrozen(probe.args))
    runtime.ctx.emit('tianzhiai/probe/ping')
    assert.equal(probe.events, 1)
    await runtime.dispose()
    runtime.ctx.emit('tianzhiai/probe/ping')
    assert.equal(probe.events, 1)
    assert.equal(probe.disposed, true)
  }
  const runtime = await bootProfile(production)
  assert.equal(runtime.ctx.get('tianzhiaiProbe'), undefined)
  assert.equal(runtime.entries.length, 1)
  await runtime.dispose()
})

test('invalid manifests, YAML, missing imports and pending services reject startup', async t => {
  const directory = await mkdtemp(join(tmpdir(), '天质 Profile '))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const manifest = join(directory, 'profile.json')
  const config = join(directory, 'cordis.yml')
  await writeFile(manifest, JSON.stringify({ version: 1, name: 'fixture', config: './cordis.yml', patches: [] }))
  await writeFile(config, 'not: [valid')
  await assert.rejects(bootProfile(manifest), /插件未就绪/)
  await writeFile(config, '- id: missing\n  name: ./missing.mjs\n')
  await assert.rejects(bootProfile(manifest), /missing/)
  await writeFile(config, JSON.stringify([{ id: 'pending', name: 'cordis:pending' }]))
  await assert.rejects(bootProfile(manifest, { prepare(ctx) {
    ctx.loader.builtins.pending = { inject: ['nonexistent'], apply() {} }
  } }), /pending/)
  await writeFile(manifest, '{}')
  await assert.rejects(bootProfile(manifest), /invalid|Invalid/)
})

test('CLI check exits, unknown flags fail and SIGTERM releases a running profile', { timeout: 8000 }, async () => {
  const checked = spawnSync(process.execPath, ['--expose-internals', cli, '--profile', 'development', '--check'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(checked.status, 0, checked.stderr)
  assert.equal(JSON.parse(checked.stdout).profile, 'development')
  const invalid = spawnSync(process.execPath, [cli, '--not-an-option'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(invalid.status, 1)
  const child = spawn(process.execPath, ['--expose-internals', cli, '--profile', 'development'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const closed = once(child, 'close')
  try {
    await once(child.stdout, 'data')
    child.kill('SIGTERM')
    const [code, signal] = await closed
    assert.equal(code, 0)
    assert.equal(signal, null)
  } finally { if (child.exitCode === null) child.kill('SIGKILL') }
})
