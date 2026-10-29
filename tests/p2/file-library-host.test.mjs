import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fixtureHost } from './fixture-host.mjs'
import { clientFor } from './client.mjs'

async function call(ctx, agent, args) {
  const signal = AbortSignal.timeout(15000)
  const toolSet = await ctx.tools.resolve({
    agent,
    signal,
    modelSelection: { provider: 'p2-controlled', model: 'controlled' },
  })
  try {
    const { results } = await ctx.tools.execute({
      agent,
      signal,
      toolSet,
      calls: [
        { type: 'tool-call', id: crypto.randomUUID(), name: 'publish_file', arguments: args },
      ],
    })
    return results[0].result
  } finally {
    toolSet.dispose()
  }
}

test('file registration stays in the owning workspace and validates supported files', async () => {
  const host = await fixtureHost({ fileLibrary: true, defaultPreset: 'full-access' })
  const client = await clientFor(host.runtime)
  try {
    const id = await client.ctx.sessions.create({})
    const ctx = host.runtime.ctx
    const agent = ctx.agents.get(id)
    const valid = await call(ctx, agent, { file_path: '.seed.png' })
    assert.equal(valid.isError, false)
    assert.equal(valid.meta.operation, 'publish')
    const outside = await call(ctx, agent, { file_path: join(host.home, 'outside.png') })
    assert.equal(outside.isError, true)
    const unsupported = await call(ctx, agent, { file_path: 'package.json' })
    assert.equal(unsupported.isError, true)
    const missing = await call(ctx, agent, { file_path: 'missing.png' })
    assert.equal(missing.isError, true)
  } finally {
    await client.dispose()
    await host.dispose()
  }
})
