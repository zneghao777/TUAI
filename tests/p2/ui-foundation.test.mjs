import test from 'node:test'
import assert from 'node:assert/strict'
import * as Renderer from '../../packages/client/ui-renderer/lib/client.js'
import * as UiSession from '../../packages/client/ui-session/lib/client.js'
import * as Access from '../../packages/api/remote-access/lib/client.js'
import { fixtureHost } from './fixture-host.mjs'
import { clientFor, until } from './client.mjs'

test('DSH UI Session uses real Controller identities and releases stale bindings on unload', async () => {
  const host = await fixtureHost()
  let client, reference
  try {
    client = await clientFor(host.runtime)
    await until(() => client.ctx.sessions)
    await client.ctx.plugin(Renderer)
    await client.ctx.plugin(Access)
    const ui = await client.ctx.plugin(UiSession)
    await until(() => client.ctx.uiSession)
    const id = await client.ctx.sessions.create({})
    reference = client.ctx.sessions.retain(id, { source: 'mainView' })
    const binding = await reference.ready
    const source = client.ctx.uiSession.bindingSource(reference)
    assert.equal(source.getSnapshot().key, id)
    assert.equal(source.getSnapshot().hooks.session, binding.session)
    assert.equal(source.getSnapshot().ctx, binding.ctx)
    assert.equal(client.ctx.sessions.retainInfo(id).getSnapshot().retainedBy.mainView, 1)
    const result = await binding.session.prompt([{ type: 'text', text: 'UI 绑定测试' }], 'queue')
    assert.equal(result.ok, true)
    await until(() =>
      binding.eventSource.getSnapshot().entries.some((e) => e.event.type === 'assistant/message'),
    )
    assert.equal(source.getSnapshot().hooks.session.getSnapshot().blank, false)
    let invalidations = 0
    const unsubscribe = source.subscribe(() => invalidations++)
    await ui.dispose()
    await until(() => source.getSnapshot().key === undefined)
    assert.ok(invalidations > 0)
    unsubscribe()
    // UI plugin disposal does not cancel or destroy the Controller-owned Session.
    assert.equal(client.ctx.sessions.binding(id), binding)
    await client.ctx.plugin(UiSession)
    const rebound = client.ctx.uiSession.bindingSource(reference)
    assert.equal(rebound.getSnapshot().hooks.session, binding.session)
    assert.notEqual(rebound, source)
    reference.release()
    reference = undefined
    await until(() => rebound.getSnapshot().key === undefined)
    assert.equal(client.ctx.sessions.retainInfo(id).getSnapshot().referenceCount, 0)
    // TZ-063 now mounts the settings contract; credential writes remain outside this composition.
    assert.ok(host.runtime.ctx.get('settingsController'))
    assert.equal(host.runtime.ctx.get('credentialsController'), undefined)
    assert.equal(client.ctx.get('remote.settings'), undefined)
  } finally {
    reference?.release()
    await client?.dispose()
    await host.dispose()
  }
})
