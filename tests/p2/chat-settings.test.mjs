import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureHost } from './fixture-host.mjs'
import { clientFor } from './client.mjs'
import settings from '../../packages/api/settings-controller/lib/typert.remote-client.js'
import { startWebHost } from '../../apps/cli/lib/web.js'

const section = (result) => {
  assert.equal(result.ok, true)
  return result.value.namespaces.find((value) => value.ns === 'ui-chat')
}
test('DSH settings codec persists chat preferences, fences stale writers and preserves defaults on restart', async () => {
  const host = await fixtureHost()
  let client, other, reboot
  try {
    client = await clientFor(host.runtime)
    other = await clientFor(host.runtime)
    await client.ctx.remote.$mount(settings)
    await other.ctx.remote.$mount(settings)
    const locale = (await client.ctx.remote.settings.describe()).value.namespaces.find(
      (value) => value.ns === 'locale',
    )
    assert.equal(locale.value.preference, undefined)
    const languageSaved = await client.ctx.remote.settings.mutate(
      'locale',
      [{ op: 'set', path: ['preference'], value: 'it' }],
      locale.revision,
    )
    assert.equal(languageSaved.ok, true)
    const invalidLanguage = await client.ctx.remote.settings.update(
      'locale',
      { preference: 'invalid locale!' },
      undefined,
    )
    assert.equal(invalidLanguage.ok, false)
    const initial = section(await client.ctx.remote.settings.describe())
    assert.equal(initial.value.transcriptView, 'standard')
    const changed = await client.ctx.remote.settings.mutate(
      'ui-chat',
      [
        { op: 'set', path: ['transcriptView'], value: 'verbose' },
        { op: 'set', path: ['collapseTiming'], value: 'next-input' },
        { op: 'set', path: ['foldedReplies'], value: 'final' },
      ],
      initial.revision,
    )
    assert.equal(changed.ok, true)
    const stale = await other.ctx.remote.settings.update(
      'ui-chat',
      { transcriptView: 'compact' },
      initial.revision,
    )
    assert.equal(stale.ok, false)
    assert.equal(stale.error.code, 'settings/conflict')
    const invalid = await client.ctx.remote.settings.update(
      'ui-chat',
      { collapseTiming: 'invalid' },
      undefined,
    )
    assert.equal(invalid.ok, false)
    assert.equal(invalid.error.code, 'settings/rejected')
    const foreign = await client.ctx.remote.settings.replace(
      'permissions',
      { mode: 'danger-full-access' },
      undefined,
    )
    assert.equal(foreign.ok, false)
    assert.equal(host.runtime.ctx.get('credentialsController'), undefined)
    const saved = JSON.parse(
      await readFile(
        join(host.runtime.ctx.tianzhiaiHost.paths.config, 'chat-preferences.json'),
        'utf8',
      ),
    )
    assert.equal(saved.user.transcriptView, 'verbose')
    await client.dispose()
    client = undefined
    await other.dispose()
    other = undefined
    await host.runtime.dispose()
    reboot = await startWebHost({ port: 0 })
    client = await clientFor(reboot)
    await client.ctx.remote.$mount(settings)
    const restoredLocale = (await client.ctx.remote.settings.describe()).value.namespaces.find(
      (value) => value.ns === 'locale',
    )
    assert.equal(restoredLocale.value.preference, 'it')
    const restored = section(await client.ctx.remote.settings.describe())
    assert.equal(restored.value.transcriptView, 'verbose')
    assert.equal(restored.value.collapseTiming, 'next-input')
    assert.equal(restored.value.foldedReplies, 'final')
    const reset = await client.ctx.remote.settings.mutate(
      'ui-chat',
      [{ op: 'unset', path: ['transcriptView'] }],
      restored.revision,
    )
    assert.equal(reset.ok, true)
    assert.equal(reset.value.value.transcriptView, 'standard')
  } finally {
    await client?.dispose()
    await other?.dispose()
    await reboot?.dispose()
    await host.dispose()
  }
})
