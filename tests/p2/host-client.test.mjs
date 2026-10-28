import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebHost } from '../../apps/cli/lib/web.js'
import {
  MockAdapter,
  textResponse,
} from '../../packages/product/agent-runtime/lib/fixture-model.js'
import { clientFor, until } from './client.mjs'

test('real authenticated Host, generated codecs, Session objects, accepted identity, durable output and reattach', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tianzhiai-p2-client-'))
  process.env.TIANZHIAI_HOME = home
  let runtime, client, ref
  try {
    runtime = await startWebHost(
      { port: 0, provider: 'fixture', model: 'fixture' },
      async (ctx) => {
        const model = new MockAdapter([textResponse('实际 Host 回答')])
        model.listModels = async () => [{ provider: 'fixture', id: 'fixture', name: '受控模型' }]
        ctx.llm.registerAdapter(['fixture'], model)
      },
    )
    client = await clientFor(runtime)
    assert.equal(
      (await fetch(new URL('api/platform/hostStatus', client.base), { method: 'POST', body: '{}' }))
        .status,
      401,
    )
    const status = await client.ctx.remote.platform.hostStatus()
    assert.equal(status.ok, true)
    const id = await client.ctx.sessions.create({})
    ref = client.ctx.sessions.retain(id, { source: 'controllerOperation' })
    await ref.ready
    const session = ref.binding.session
    const receipt = await session.prompt(
      [{ type: 'text', text: '测试消息' }],
      'queue',
      undefined,
      'p2-stable-input',
    )
    assert.equal(receipt.ok, true)
    await until(() =>
      ref.binding.eventSource
        .getSnapshot()
        .entries.some((e) => e.event.type === 'assistant/message'),
    )
    assert.equal(
      (
        await session.prompt(
          [{ type: 'text', text: '测试消息' }],
          'queue',
          undefined,
          'p2-stable-input',
        )
      ).ok,
      true,
    )
    await client.ctx.sessions.refresh()
    const events = runtime.ctx.sessions.get(id).snapshotEvents()
    assert.equal(
      events.filter((e) => e.type === 'user/message' && e.data.source.rpcId === 'p2-stable-input')
        .length,
      1,
    )
    assert.equal(events.filter((e) => e.type === 'assistant/message').length, 1)
    ref.release()
    ref = undefined
    await client.dispose()
    client = await clientFor(runtime)
    // Connection ready precedes the Session list baseline on a fresh client.
    await client.ctx.sessions.refresh()
    ref = client.ctx.sessions.retain(id, { source: 'controllerOperation' })
    await ref.ready
    assert.equal(
      ref.binding.eventSource
        .getSnapshot()
        .entries.filter((e) => e.event.type === 'assistant/message').length,
      1,
    )
  } finally {
    ref?.release()
    await client?.dispose()
    await runtime?.dispose()
    await rm(home, { recursive: true, force: true })
  }
})
