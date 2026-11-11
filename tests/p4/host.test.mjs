import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixtureHost } from '../p2/fixture-host.mjs'
import { clientFor } from '../p2/client.mjs'
import { defineTool } from '../../packages/core/tools/lib/index.js'
class GuardConnector {
  async start() {
    return {
      spaceId: 1,
      pageId: 'p1',
      pages: [{ id: 'p1', title: 'Fixture', url: 'https://test.invalid/', openedBy: 'agent' }],
      viewport: { width: 1000, height: 700, dpr: 1, version: 1 },
      capabilities: {
        available: true,
        png: true,
        semantic: true,
        directInput: true,
        nativeHandoff: true,
        downloads: true,
        cliVersion: 'fixture',
        browserVersion: 'fixture',
      },
    }
  }
  onStop() {
    return () => {}
  }
  onFrame() {
    return () => {}
  }
  async close() {}
}
test('Final DSH guard blocks shell, network, Skill, MCP and batch extensions during a browser task', async (t) => {
  const host = await fixtureHost()
  const client = await clientFor(host.runtime)
  t.after(async () => {
    try {
      await client.dispose()
    } finally {
      await host.dispose()
    }
  })
  const ctx = host.runtime.ctx,
    sessionId = await client.ctx.sessions.create({}),
    agent = ctx.agents.get(sessionId)
  ctx.permissionPresets.set(agent.session, 'full-access')
  ctx.browsers.connectorFactory = () => new GuardConnector()
  await ctx.browsers.open(
    { ownerId: ctx.browsers.ownerId, sessionId },
    'Controlled browser task',
    'guard-open',
  )
  let invoked = 0
  for (const name of ['mcp_probe', 'skill_probe', 'cli_probe', 'batch_probe'])
    ctx.tools.register(
      defineTool({
        name,
        description: 'Intrusion fixture',
        parameters: {},
        output: { schema: { type: 'string' }, render: () => [] },
        async execute() {
          invoked++
          return 'forbidden'
        },
      }),
    )
  for (const [name, args] of [
    ['bash', { command: 'printf forbidden', description: 'Guard acceptance' }],
    ['web_fetch', { url: 'https://test.invalid/' }],
    ...['mcp_probe', 'skill_probe', 'cli_probe', 'batch_probe'].map((name) => [name, {}]),
  ]) {
    const signal = AbortSignal.timeout(5000),
      toolSet = await ctx.tools.resolve({
        agent,
        signal,
        modelSelection: { provider: 'p2-controlled', model: 'controlled' },
      })
    try {
      const result = (
        await ctx.tools.execute({
          agent,
          signal,
          toolSet,
          calls: [{ type: 'tool-call', id: crypto.randomUUID(), name, arguments: args }],
        })
      ).results[0].result
      assert.equal(result.isError, true, name)
      assert.match(JSON.stringify(result), /BrowserService|旁路权限/, name)
    } finally {
      toolSet.dispose()
    }
  }
  assert.equal(invoked, 0)
})

test('Media admission binds owner, Origin and Session; a slow viewer retains only the latest pending frame', async (t) => {
  const { createRequire } = await import('node:module'),
    require = createRequire(
      new URL('../../packages/product/web-host/package.json', import.meta.url),
    ),
    WebSocket = require('ws')
  class MediaConnector extends GuardConnector {
    frames = new Set()
    stream = false
    onFrame(fn) {
      this.frames.add(fn)
      return () => this.frames.delete(fn)
    }
    async call(method, params) {
      if (method === 'stream') this.stream = params.enabled
      return null
    }
  }
  const host = await fixtureHost(),
    client = await clientFor(host.runtime),
    ctx = host.runtime.ctx,
    connector = new MediaConnector()
  t.after(async () => {
    await client.dispose()
    await host.dispose()
  })
  ctx.browsers.connectorFactory = () => connector
  const sessionId = await client.ctx.sessions.create({}),
    other = await client.ctx.sessions.create({}),
    caller = { ownerId: ctx.browsers.ownerId, sessionId }
  const state = await ctx.browsers.open(caller, 'Media acceptance', 'media-open')
  const url = new URL('api/browser/media', client.base)
  url.protocol = 'ws:'
  url.search = new URLSearchParams({ browserId: state.id, sessionId }).toString()
  const origin = new URL(client.base).origin,
    headers = { Cookie: client.cookie, Origin: origin }
  async function denied(target, extra) {
    const ws = new WebSocket(target, { headers: extra, handshakeTimeout: 2000 })
    let opened = false
    ws.on('open', () => {
      opened = true
      ws.close()
    })
    ws.on('error', () => {})
    await new Promise((resolve) => ws.once('close', resolve))
    assert.equal(opened, false)
  }
  await denied(url, { Origin: origin })
  await denied(url, { ...headers, Origin: 'https://other.invalid' })
  const wrong = new URL(url)
  wrong.searchParams.set('sessionId', other)
  await denied(wrong, headers)
  const ws = new WebSocket(url, { headers, handshakeTimeout: 2000 }),
    messages = [],
    frames = []
  ws.on('error', () => {})
  ws.on('message', (bytes, binary) => {
    if (binary) {
      const length = bytes.readUInt32BE(0)
      frames.push(JSON.parse(bytes.subarray(4, 4 + length)))
    } else messages.push(JSON.parse(bytes.toString()))
  })
  t.after(() => ws.terminate())
  const wait = async (fn) => {
    const until = Date.now() + 3000
    while (!fn()) {
      assert.ok(Date.now() < until, 'media condition timed out')
      await new Promise((r) => setTimeout(r, 5))
    }
  }
  await wait(() => messages.some((m) => m.type === 'welcome') && connector.stream)
  const emit = (id) => {
    for (const fn of connector.frames)
      fn(
        {
          pageId: 'p1',
          frameId: id,
          streamEpoch: 1,
          captureAt: Date.now(),
          receivedAt: Date.now(),
          pixelWidth: 1000,
          pixelHeight: 700,
          viewport: state.viewport,
          format: 'png',
        },
        Buffer.alloc(1024, id % 256),
      )
  }
  for (let n = 1; n <= 1000; n++) emit(n)
  await wait(() => frames.length === 1)
  assert.equal(frames[0].frameId, 1)
  ws.send(JSON.stringify({ type: 'frameAck', frameId: 1 }))
  await wait(() => frames.length === 2)
  assert.equal(frames[1].frameId, 1000)
  ws.close()
  await new Promise((resolve) => ws.once('close', resolve))
  await wait(() => connector.stream === false)
  assert.equal(ctx.browsers.get(state.id, caller).lifecycle, 'open')
})

test('The authenticated media carrier reports a dispatched input with a lost receipt as unknown', async (t) => {
  const { createRequire } = await import('node:module'),
    require = createRequire(
      new URL('../../packages/product/web-host/package.json', import.meta.url),
    ),
    WebSocket = require('ws')
  const { ConnectorError } = await import('../../packages/product/ego-connector/lib/index.js')
  class LostInputConnector extends GuardConnector {
    async fence() {}
    async call(method, params) {
      if (method === 'input') throw new ConnectorError('INPUT_RECEIPT_LOST', true)
      return null
    }
  }
  const host = await fixtureHost(),
    client = await clientFor(host.runtime),
    ctx = host.runtime.ctx
  t.after(async () => {
    await client.dispose()
    await host.dispose()
  })
  ctx.browsers.connectorFactory = () => new LostInputConnector()
  const sessionId = await client.ctx.sessions.create({}),
    caller = { ownerId: ctx.browsers.ownerId, sessionId },
    state = await ctx.browsers.open(caller, 'Unknown input wire acceptance', 'wire-open')
  const url = new URL('api/browser/media', client.base)
  url.protocol = 'ws:'
  url.search = new URLSearchParams({ browserId: state.id, sessionId }).toString()
  const ws = new WebSocket(url, {
      headers: { Cookie: client.cookie, Origin: new URL(client.base).origin },
      handshakeTimeout: 2000,
    }),
    messages = []
  t.after(() => ws.terminate())
  ws.on('error', () => {})
  ws.on('message', (bytes, binary) => {
    if (!binary) messages.push(JSON.parse(bytes.toString()))
  })
  const { until } = await import('../p2/client.mjs')
  await until(() => messages.some((m) => m.type === 'welcome'))
  const welcome = messages.find((m) => m.type === 'welcome'),
    current = ctx.browsers.get(state.id, caller)
  const taken = await client.ctx.remote.browsers.control(sessionId, {
    browserId: state.id,
    requestId: crypto.randomUUID(),
    expectedRevision: current.revision,
    controlEpoch: current.controlEpoch,
    connectionId: welcome.connectionId,
    action: 'take',
  })
  assert.equal(taken.ok, true)
  ws.send(
    JSON.stringify({
      type: 'input',
      sequence: 1,
      epoch: taken.value.controlEpoch,
      viewportVersion: 1,
      pageId: 'p1',
      input: { type: 'text', text: 'synthetic input' },
    }),
  )
  await until(() => messages.some((m) => m.type === 'inputResult'))
  const result = messages.find((m) => m.type === 'inputResult')
  assert.equal(result.status, 'unknown')
  assert.equal(result.error, 'INPUT_RECEIPT_LOST')
  assert.equal(ctx.browsers.get(state.id, caller).needsReconciliation, true)
})
