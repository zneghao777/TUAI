import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startWebHost } from '../../apps/cli/lib/web.js'

test('TZ-077 appearance validates atomic settings and restores after a Host restart', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tianzhiai-appearance-'))
  const previous = process.env.TUAI_HOME
  process.env.TUAI_HOME = home
  let runtime
  try {
    runtime = await startWebHost({ port: 0 })
    const settings = runtime.ctx.settingsController
    const view = async () => (await settings.describe()).namespaces.find((s) => s.ns === 'ui-theme')
    const initial = await view()
    assert.equal(initial.value.palette, 'white')
    assert.equal(initial.value.preference, 'light')
    const file = join(runtime.ctx.tianzhiaiHost.paths.config, 'ui-theme-preferences.json')
    await settings.update('ui-theme', { fontSize: 17 })
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).user, {
      palette: 'white',
      fontSize: 17,
    })
    await settings.update('ui-theme', { palette: 'forest', preference: 'dark' })
    const dark = await view()
    await assert.rejects(settings.update('ui-theme', { palette: 'dawn' }))
    await assert.rejects(settings.update('ui-theme', { palette: 'white' }))
    await assert.rejects(settings.update('ui-theme', { palette: 'unknown' }))
    assert.equal((await view()).revision, dark.revision)
    await settings.mutate(
      'ui-theme',
      [
        { op: 'set', path: ['palette'], value: 'dawn' },
        { op: 'set', path: ['preference'], value: 'light' },
      ],
      dark.revision,
    )
    const dawn = await view()
    assert.equal(dawn.value.palette, 'dawn')
    assert.equal(dawn.value.preference, 'light')
    assert.equal(dawn.value.fontSize, 17)
    assert.equal(dawn.revision, dark.revision + 1)
    await assert.rejects(settings.update('ui-theme', { palette: 'forest' }, dark.revision))
    for (const preference of ['dark', 'system'])
      await assert.rejects(settings.update('ui-theme', { preference }))
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).user, {
      preference: 'light',
      fontSize: 17,
      palette: 'dawn',
    })
    await runtime.dispose()
    runtime = await startWebHost({ port: 0 })
    const restored = (await runtime.ctx.settingsController.describe()).namespaces.find(
      (s) => s.ns === 'ui-theme',
    )
    assert.equal(restored.value.palette, 'dawn')
    assert.equal(restored.value.fontSize, 17)
    const url = runtime.ctx.connection.authenticatedUrl(
      `http://127.0.0.1:${runtime.ctx.webServer.port}/`,
    )
    // Fetch retains no cookies; exchange the existing one-use login and read its authenticated index.
    const login = await fetch(url, { redirect: 'manual' })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const index = await fetch(new URL('/', url), { headers: { Cookie: cookie } })
    const html = await index.text()
    assert.match(html, /document\.body\.dataset\.tzPalette = "dawn"/)
    assert.match(html, /body:not\(\[data-tz-appearance-ready\]\)\{background-color:#f5f8fc\}/)
    assert.match(html, /const preference = "light"/)
    assert.match(html, /--dsh-content-font-size.*17px/)
    await runtime.ctx.settingsController.update('ui-theme', {
      palette: 'forest',
      preference: 'system',
    })
    const forest = (await runtime.ctx.settingsController.describe()).namespaces.find(
      (s) => s.ns === 'ui-theme',
    )
    assert.equal(forest.value.palette, 'forest')
    assert.equal(forest.value.preference, 'system')
    await runtime.ctx.settingsController.mutate(
      'ui-theme',
      [
        { op: 'set', path: ['palette'], value: 'white' },
        { op: 'set', path: ['preference'], value: 'light' },
      ],
      forest.revision,
    )
    const white = (await runtime.ctx.settingsController.describe()).namespaces.find(
      (s) => s.ns === 'ui-theme',
    )
    assert.equal(white.revision, forest.revision + 1)
    assert.equal(white.value.fontSize, 17)
    for (const preference of ['dark', 'system'])
      await assert.rejects(runtime.ctx.settingsController.update('ui-theme', { preference }))
    await runtime.dispose()
    runtime = await startWebHost({ port: 0 })
    const restoredWhite = (await runtime.ctx.settingsController.describe()).namespaces.find(
      (s) => s.ns === 'ui-theme',
    )
    assert.equal(restoredWhite.value.palette, 'white')
    assert.equal(restoredWhite.value.fontSize, 17)
    assert.equal(restoredWhite.value.preference, 'light')
  } finally {
    await runtime?.dispose()
    if (previous === undefined) delete process.env.TUAI_HOME
    else process.env.TUAI_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})

test('TZ-082 legacy and explicit choices load without rewriting; new font-only saves retain white', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tianzhiai-appearance-legacy-'))
  const previous = process.env.TUAI_HOME
  process.env.TUAI_HOME = home
  let runtime
  try {
    runtime = await startWebHost({ port: 0 })
    const file = join(runtime.ctx.tianzhiaiHost.paths.config, 'ui-theme-preferences.json')
    await assert.rejects(readFile(file), { code: 'ENOENT' })
    await runtime.ctx.settingsController.update('ui-theme', { fontSize: 18 })
    await runtime.dispose()
    const cases = [
      { user: { palette: 'white', fontSize: 18 }, palette: 'white', preference: 'light' },
      ...['light', 'dark', 'system'].map((preference) => ({
        user: { preference, fontSize: 18, codeFontSize: 13 },
        palette: 'forest',
        preference,
      })),
      { user: { fontSize: 18 }, palette: 'forest', preference: 'light' },
      {
        user: { palette: 'forest', preference: 'dark', fontSize: 18 },
        palette: 'forest',
        preference: 'dark',
      },
      {
        user: { palette: 'dawn', preference: 'light', fontSize: 18 },
        palette: 'dawn',
        preference: 'light',
      },
      { user: {}, palette: 'white', preference: 'light' },
    ]
    for (const item of cases) {
      const original = JSON.stringify({ revision: 13, user: item.user }) + '\n'
      await writeFile(file, original)
      runtime = await startWebHost({ port: 0 })
      const current = (await runtime.ctx.settingsController.describe()).namespaces.find(
        (s) => s.ns === 'ui-theme',
      )
      assert.equal(current.value.palette, item.palette)
      assert.equal(current.value.preference, item.preference)
      assert.equal(current.value.fontSize, item.user.fontSize ?? 15)
      assert.equal(current.revision, 13)
      assert.equal(await readFile(file, 'utf8'), original)
      const url = runtime.ctx.connection.authenticatedUrl(
        `http://127.0.0.1:${runtime.ctx.webServer.port}/`,
      )
      const login = await fetch(url, { redirect: 'manual' })
      const index = await fetch(new URL('/', url), {
        headers: { Cookie: login.headers.get('set-cookie').split(';')[0] },
      })
      const html = await index.text()
      assert.ok(html.includes(`document.body.dataset.tzPalette = "${item.palette}"`))
      assert.ok(html.includes(`const preference = "${item.preference}"`))
      if (item.palette === 'white') assert.match(html, /background-color:#ffffff/)
      await runtime.ctx.settingsController.update('ui-theme', { fontSize: 19 }, current.revision)
      const saved = JSON.parse(await readFile(file, 'utf8'))
      assert.equal(saved.user.palette, item.palette)
      assert.equal(saved.revision, 14)
      await runtime.dispose()
    }
    runtime = undefined
  } finally {
    await runtime?.dispose()
    if (previous === undefined) delete process.env.TUAI_HOME
    else process.env.TUAI_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})
