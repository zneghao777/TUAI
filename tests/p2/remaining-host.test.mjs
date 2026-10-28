import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureHost } from './fixture-host.mjs'
import { clientFor, until } from './client.mjs'
import { createUserMessage } from '../../packages/llm/llm/lib/index.js'
import {
  textResponse,
  toolCallResponse,
} from '../../packages/product/agent-runtime/lib/fixture-model.js'
import * as AutoReview from '../../packages/experimental/auto-review/lib/index.js'
import workspaceFiles from '../../packages/api/workspace-files/lib/typert.remote-client.js'

const command = (ctx, agent, line) =>
  ctx.commands.execute(agent, line, [], AbortSignal.timeout(10000))
test('TZ-066/069 production defaults, command effects, Auto review decisions and authenticated file scope', async () => {
  const host = await fixtureHost({ defaultPreset: 'workspace-write' })
  const client = await clientFor(host.runtime)
  const ctx = host.runtime.ctx
  try {
    assert.equal(ctx.tianzhiaiHost.settings.defaultPermissionPreset, 'workspace-write')
    const a = await client.ctx.sessions.create({}),
      b = await client.ctx.sessions.create({})
    const agent = ctx.agents.get(a),
      other = ctx.agents.get(b)
    assert.equal(ctx.permissionPresets.current(agent.session), 'workspace-write')
    await ctx.settingsController.update('permission', { defaultPreset: 'readonly' })
    const c = await client.ctx.sessions.create({})
    assert.equal(ctx.permissionPresets.current(ctx.agents.get(c).session), 'readonly')
    assert.equal(ctx.permissionPresets.current(agent.session), 'workspace-write')
    await assert.rejects(ctx.settingsController.update('permission', { defaultPreset: 'auto' }))
    const names = ctx.commands.list(agent).map((x) => x.name)
    for (const name of ['plan', 'goal', 'feedback', 'compact', 'permission', 'export'])
      assert.ok(names.includes(name), name)
    await command(ctx, agent, '/plan on')
    assert.equal(
      agent.session
        .snapshotEvents()
        .filter((e) => e.type === 'plan/mode')
        .at(-1).data.active,
      true,
    )
    await command(ctx, agent, '/plan off')
    await command(ctx, agent, '/feedback 本地反馈')
    assert.equal(
      agent.session.snapshotEvents().filter((e) => e.type === 'feedback/record').length,
      1,
    )
    assert.equal((await command(ctx, agent, '/compact wrong')).result.kind, 'error')
    const stream = host.model.stream.bind(host.model)
    let decision = 'allow',
      reviews = 0,
      runs = 0
    host.model.stream = async function* (options) {
      if (options.system?.startsWith('REVIEW_POLICY')) {
        reviews++
        if (decision === 'failure') {
          yield* textResponse('not JSON')
          return
        }
        yield* textResponse(
          decision === 'allow'
            ? '{"risk":"low","decision":"allow"}'
            : '{"risk":"high","decision":"deny","reason":"fixture refusal"}',
        )
        return
      }
      if (options.messages.at(-1)?.role === 'tool') {
        yield* textResponse('Auto 场景结束')
        return
      }
      yield* toolCallResponse(crypto.randomUUID(), 'sum_numbers', { a: 2, b: 3 })
    }
    const stop = ctx.on('tools/post-execute', (_exec, _result, next) => {
      runs++
      return next()
    })
    for (const outcome of ['allow', 'deny', 'failure']) {
      decision = outcome
      ctx.permissionPresets.set(agent.session, 'auto')
      const deny = ctx.on('approval/request', () => 'denied')
      agent.followup(
        createUserMessage({
          content: [{ type: 'text', text: `Auto ${outcome}` }],
          source: { kind: 'user' },
        }),
      )
      await agent.whenIdle()
      const result = agent.session
        .snapshotEvents()
        .filter((e) => e.type === 'tool/result')
        .at(-1).data.message
      assert.equal(Boolean(result.isError), outcome !== 'allow', JSON.stringify(result))
      deny()
    }
    assert.ok(reviews >= 3)
    assert.ok(runs >= 1)
    stop()
    host.model.stream = stream
    const auto = [...ctx.registry.values()].find(
      (runtime) => runtime.name === AutoReview.name,
    )?.fibers
    assert.ok(auto?.length)
    for (const fiber of [...auto]) await fiber.dispose()
    assert.equal(ctx.permissionPresets.current(agent.session), 'readonly')
    assert.equal(ctx.approval.overrideOf(agent.session), 'ask')
    await client.ctx.remote.$mount(workspaceFiles)
    await writeFile(join(agent.session.header.cwd, 'own.txt'), 'own')
    await writeFile(join(other.session.header.cwd, 'other.txt'), 'other')
    const own = await client.ctx.remote.workspaceFiles.read(
      a,
      join(agent.session.header.cwd, 'own.txt'),
      {},
    )
    assert.equal(own.ok, true, JSON.stringify(own))
    const cross = await client.ctx.remote.workspaceFiles.read(
      a,
      join(other.session.header.cwd, 'other.txt'),
      {},
    )
    assert.equal(cross.ok, false)
    const unauth = await fetch(new URL(`/api/session-log?sessionId=${a}`, client.base))
    assert.notEqual(unauth.status, 200)
    const config = JSON.parse(await readFile(ctx.tianzhiaiHost.paths.hostConfig, 'utf8'))
    assert.equal(config.defaultPermissionPreset, 'workspace-write')
  } finally {
    await client.dispose()
    await host.dispose()
  }
})
