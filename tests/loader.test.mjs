import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, FiberState, Service } from '../vendor/cordis/lib/index.js'
import Loader, { Group as LoaderGroup } from '../vendor/loader/lib/index.js'
import Group from '../vendor/group/lib/index.js'
import Include from '../vendor/include/lib/index.js'
import { frameworkIdentity, lifecycle } from './fixtures/loader-plugin.mjs'

test(
  'real Loader imports, injects, emits and disposes one shared service',
  { timeout: 5000 },
  async () => {
    assert.equal(frameworkIdentity, Context)
    assert.equal(Group, LoaderGroup, 'Group must reuse the installed Loader identity')
    const directory = await mkdtemp(join(tmpdir(), '天质 Loader '))
    const ctx = new Context()
    try {
      ctx.baseUrl = pathToFileURL(directory + '/').href
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const filename = join(directory, 'cordis.json')
      await writeFile(
        filename,
        JSON.stringify([
          {
            id: 'probe',
            name: new URL('./fixtures/loader-plugin.mjs', import.meta.url).href,
            config: { value: '中文路径服务' },
          },
        ]),
      )
      await ctx.loader.create({
        id: 'root',
        name: 'cordis:include',
        config: { path: pathToFileURL(filename).href },
      })
      await ctx.loader.await()
      assert.equal(ctx.get('migrationProbe').value, '中文路径服务')
      assert.ok(ctx.get('migrationProbe') instanceof Service)
      assert.ok([...ctx.loader.entries()].every((entry) => entry.fiber.state === FiberState.ACTIVE))
      ctx.emit('migration/ping', 'before')
      assert.deepEqual(lifecycle.events, ['before'])
      await ctx.fiber.dispose()
      await ctx.fiber.dispose()
      assert.equal(ctx.get('migrationProbe'), undefined)
      ctx.emit('migration/ping', 'after')
      assert.deepEqual(lifecycle.events, ['before'])
      assert.equal(lifecycle.created, 1)
      assert.equal(lifecycle.disposed, 1)
    } finally {
      await ctx.fiber.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
