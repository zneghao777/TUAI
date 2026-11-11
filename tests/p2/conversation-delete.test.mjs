import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { setSandboxMode } from '../../packages/sandbox/sandbox-policy/lib/index.js'
import { sessionDir } from '../../packages/spill/spill-local/lib/index.js'
import { join } from 'node:path'
import { fixtureHost } from './fixture-host.mjs'
import { clientFor, until } from './client.mjs'
import { startWebHost } from '../../apps/cli/lib/web.js'
import workspace from '../../packages/api/workspace-controller/lib/typert.remote-client.js'

const checkDenied = (result) => {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.match(result.error.message, /删除/)
}

test('CHAT-SIMPLE durable deletion: two clients, denied access, idempotency, restart and preserved files', async () => {
  const host = await fixtureHost()
  const client = await clientFor(host.runtime)
  const other = await clientFor(host.runtime)
  let reboot, resumed
  try {
    const a = await client.ctx.sessions.create({}),
      b = await client.ctx.sessions.create({})
    const cwd = host.runtime.ctx.sessions.get(a).header.cwd
    await writeFile(join(cwd, 'keep.txt'), 'keep my files')
    const artifactDir = sessionDir(join(host.runtime.ctx.tianzhiaiHost.paths.artifacts, 'spill'), a)
    await mkdir(artifactDir, { recursive: true, mode: 0o700 })
    await writeFile(join(artifactDir, 'sample.txt'), 'download fixture')
    const url = new URL('/api/artifact', client.base)
    url.searchParams.set('sessionId', a)
    url.searchParams.set('artifactId', 'spill:sample.txt')
    const before = await fetch(url, { headers: { Cookie: client.cookie } })
    assert.equal(before.status, 200)
    assert.equal(await before.text(), 'download fixture')
    await other.ctx.sessions.refresh()
    assert.ok(other.ctx.sessions.list.getSnapshot().ids.includes(a))
    assert.equal((await client.ctx.remote.platform.deleteConversation({ id: a })).ok, true)
    await until(() => !other.ctx.sessions.list.getSnapshot().ids.includes(a))
    await client.ctx.sessions.refresh()
    assert.ok(!client.ctx.sessions.list.getSnapshot().ids.includes(a))
    const after = await fetch(url, { headers: { Cookie: client.cookie } })
    assert.equal(after.status, 404)
    assert.ok(client.ctx.sessions.list.getSnapshot().ids.includes(b))
    const search = await client.ctx.remote.session.search({ query: 'keep' })
    assert.equal(search.ok, true)
    assert.ok(!search.value.items.some((item) => item.sessionId === a))
    checkDenied(await client.ctx.remote.session.projections({ sessionId: a }))
    checkDenied(await client.ctx.remote.session.rename({ sessionId: a, title: 'cannot revive' }))
    checkDenied(await client.ctx.remote.session.fork({ sessionId: a }))
    await client.ctx.remote.$mount(workspace)
    checkDenied(await client.ctx.remote.workspace.unarchiveSession({ sessionId: a }))
    await assert.rejects(client.ctx.sessions.create({ sessionId: a }))
    assert.equal((await client.ctx.remote.platform.deleteConversation({ id: a })).ok, true)
    assert.equal(await readFile(join(cwd, 'keep.txt'), 'utf8'), 'keep my files')
    assert.equal((await stat(cwd)).isDirectory(), true)
    await client.dispose()
    await other.dispose()
    await host.runtime.dispose()
    reboot = await startWebHost({ port: 0 })
    resumed = await clientFor(reboot)
    await resumed.ctx.sessions.refresh()
    assert.ok(!resumed.ctx.sessions.list.getSnapshot().ids.includes(a))
    assert.ok(resumed.ctx.sessions.list.getSnapshot().ids.includes(b))
    checkDenied(await resumed.ctx.remote.session.projections({ sessionId: a }))
    assert.equal(await readFile(join(cwd, 'keep.txt'), 'utf8'), 'keep my files')
  } finally {
    await resumed?.dispose()
    await reboot?.dispose()
    await client.dispose()
    await other.dispose()
    await host.dispose()
  }
})

test('CHAT-SIMPLE permission catalog, retired default migration and rejected retired switches', async () => {
  const host = await fixtureHost()
  let reboot, resumed
  const client = await clientFor(host.runtime)
  try {
    const catalog = host.runtime.ctx.permissionPresets.catalog()
    assert.deepEqual(
      catalog.options.map((option) => option.value),
      ['readonly', 'full-access'],
    )
    const id = await client.ctx.sessions.create({})
    const session = host.runtime.ctx.sessions.get(id)
    assert.equal(host.runtime.ctx.permissionPresets.current(session), 'readonly')
    assert.throws(() => host.runtime.ctx.permissionPresets.set(session, 'workspace-write'))
    await assert.rejects(
      host.runtime.ctx.settingsController.update('permission', {
        defaultPreset: 'workspace-write',
      }),
    )
    // Simulate an existing pre-upgrade workspace-write Session without re-enabling the retired preset.
    setSandboxMode(session, 'workspace-write')
    const path = join(host.runtime.ctx.tianzhiaiHost.paths.config, 'permission-preferences.json')
    await client.dispose()
    await host.runtime.dispose()
    await writeFile(
      path,
      JSON.stringify({ revision: 7, user: { defaultPreset: 'workspace-write' } }),
    )
    reboot = await startWebHost({ port: 0 })
    resumed = await clientFor(reboot)
    await reboot.ctx.sessionController.resolveAgent(id)
    assert.equal(reboot.ctx.permissionPresets.current(reboot.ctx.sessions.get(id)), 'readonly')
    const next = await resumed.ctx.sessions.create({})
    assert.equal(reboot.ctx.permissionPresets.current(reboot.ctx.sessions.get(next)), 'readonly')
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      revision: 8,
      user: { defaultPreset: 'readonly' },
    })
  } finally {
    await resumed?.dispose()
    await reboot?.dispose()
    await client.dispose()
    await host.dispose()
  }
})
