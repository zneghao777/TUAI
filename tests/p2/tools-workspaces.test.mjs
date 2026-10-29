import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureHost } from './fixture-host.mjs'
import { clientFor } from './client.mjs'
import workspace from '../../packages/api/workspace-controller/lib/typert.remote-client.js'
import { startWebHost } from '../../apps/cli/lib/web.js'

async function call(ctx, agent, name, args, signal = AbortSignal.timeout(15000)) {
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
      calls: [{ type: 'tool-call', id: crypto.randomUUID(), name, arguments: args }],
    })
    return results[0].result
  } finally {
    toolSet.dispose()
  }
}
const text = (result) => JSON.stringify(result)

test('TZ-064 managed directories and original archive/pin state survive reconnect and Host restart', async () => {
  const host = await fixtureHost()
  const client = await clientFor(host.runtime)
  let reboot, resumed
  try {
    await client.ctx.remote.$mount(workspace)
    const a = await client.ctx.sessions.create({})
    const b = await client.ctx.sessions.create({})
    const ctx = host.runtime.ctx
    const first = ctx.sessions.get(a),
      second = ctx.sessions.get(b)
    assert.notEqual(first.header.cwd, second.header.cwd)
    assert.equal((await stat(first.header.cwd)).isDirectory(), true)
    assert.ok(first.header.cwd.includes('/data/workspaces/'))
    await assert.rejects(client.ctx.sessions.create({ cwd: process.cwd() }), /新会话|bad-request/)
    assert.equal((await client.ctx.remote.workspace.create({ path: process.cwd() })).ok, false)
    const pin = await client.ctx.remote.workspace.pinSession({ sessionId: a })
    assert.equal(pin.ok, true)
    const archive = await client.ctx.remote.workspace.archiveSession({ sessionId: a })
    assert.equal(archive.ok, true)
    assert.ok(ctx.workspaceRegistry.archivedSessionIds.includes(a))
    assert.ok(!ctx.workspaceRegistry.pinnedSessionIds.includes(a))
    assert.equal((await stat(first.header.cwd)).isDirectory(), true)
    assert.equal((await client.ctx.remote.workspace.unarchiveSession({ sessionId: a })).ok, true)
    await client.dispose()
    const restored = await clientFor(host.runtime)
    try {
      await restored.ctx.remote.$mount(workspace)
      assert.ok(ctx.workspaceRegistry.list().some((item) => item.sessionIds.includes(a)))
    } finally {
      await restored.dispose()
    }
    await ctx.workspaceRegistry.pinSession(a)
    await ctx.workspaceRegistry.archiveSession(b)
    await host.runtime.dispose()
    reboot = await startWebHost({ port: 0 })
    resumed = await clientFor(reboot)
    await resumed.ctx.sessions.refresh()
    assert.ok(resumed.ctx.sessions.list.getSnapshot().ids.includes(a))
    assert.equal(resumed.ctx.sessions.list.getSnapshot().byId[a].cwd, first.header.cwd)
    assert.ok(reboot.ctx.workspaceRegistry.pinnedSessionIds.includes(a))
    assert.ok(reboot.ctx.workspaceRegistry.archivedSessionIds.includes(b))
    assert.equal((await stat(first.header.cwd)).isDirectory(), true)
  } finally {
    await resumed?.dispose()
    await reboot?.dispose()
    await client.dispose()
    await host.dispose()
  }
})

test(
  'TZ-064 real file policy, shell jobs, persistent terminal and cancellation in product Host',
  { timeout: 60000 },
  async () => {
    const host = await fixtureHost()
    const client = await clientFor(host.runtime)
    try {
      const ctx = host.runtime.ctx
      const a = await client.ctx.sessions.create({}),
        b = await client.ctx.sessions.create({})
      const agent = ctx.agents.get(a),
        other = ctx.agents.get(b)
      const cwd = agent.session.header.cwd
      ctx.permissionPresets.set(agent.session, 'readonly')
      const denied = await call(ctx, agent, 'write', { file_path: 'sample.txt', content: 'before' })
      assert.equal(denied.isError, true, text(denied))
      ctx.permissionPresets.set(agent.session, 'full-access')
      const write = await call(ctx, agent, 'write', { file_path: 'sample.txt', content: 'before' })
      assert.ok(!write.isError, text(write))
      assert.equal(await readFile(join(cwd, 'sample.txt'), 'utf8'), 'before')
      const edit = await call(ctx, agent, 'edit', {
        file_path: 'sample.txt',
        old_string: 'before',
        new_string: 'after',
      })
      assert.ok(!edit.isError, text(edit))
      assert.equal(await readFile(join(cwd, 'sample.txt'), 'utf8'), 'after')
      await writeFile(join(other.session.header.cwd, 'private.txt'), 'OTHER_SESSION')
      const cross = await call(ctx, agent, 'read', {
        file_path: join(other.session.header.cwd, 'private.txt'),
      })
      assert.equal(cross.isError, true)
      await symlink(other.session.header.cwd, join(cwd, 'escape'))
      assert.equal(
        (await call(ctx, agent, 'write', { file_path: 'escape/blocked.txt', content: 'blocked' }))
          .isError,
        true,
      )
      const search = await call(ctx, agent, 'grep', { pattern: 'after', path: '.' })
      assert.ok(!search.isError, text(search))
      assert.match(text(search), /after/)
      assert.equal(
        (
          await call(ctx, agent, 'grep', {
            pattern: 'OTHER_SESSION',
            path: other.session.header.cwd,
          })
        ).isError,
        true,
      )
      const bash = await call(ctx, agent, 'bash', {
        command: 'printf real-shell > shell.txt; cat shell.txt',
        description: '沙箱执行',
      })
      assert.ok(!bash.isError, text(bash))
      assert.match(text(bash), /real-shell/)
      const job = await call(ctx, agent, 'bash', {
        command: 'sleep 0.2; printf background-complete',
        description: '后台完成',
        run_in_background: true,
      })
      assert.ok(!job.isError, text(job))
      const jobId = ctx.jobs.list(a).find((job) => job.status === 'running')?.id
      assert.ok(jobId)
      const output = await call(ctx, agent, 'job_output', {
        job_id: jobId,
        wait: true,
        timeout_ms: 5000,
      })
      assert.ok(!output.isError, text(output))
      assert.match(text(output), /background-complete/)
      assert.equal((await call(ctx, other, 'job_output', { job_id: jobId })).isError, true)
      const terminal = await call(ctx, agent, 'terminal_open', { type: 'shell' })
      assert.ok(!terminal.isError, text(terminal))
      const terminalId = ctx.terminals.list(agent)[0]?.sessionId
      assert.ok(terminalId)
      const sent = await call(ctx, agent, 'terminal_send', {
        sessionId: terminalId,
        text: 'printf terminal-complete',
      })
      assert.ok(!sent.isError, text(sent))
      assert.match(text(sent), /terminal-complete/)
      assert.equal(
        (await call(ctx, other, 'terminal_read', { sessionId: terminalId })).isError,
        true,
      )
      assert.ok(!(await call(ctx, agent, 'terminal_close', { sessionId: terminalId })).isError)
      const controller = new AbortController()
      const pending = call(
        ctx,
        agent,
        'bash',
        { command: 'sleep 30', description: '取消执行' },
        controller.signal,
      )
      setTimeout(() => controller.abort(), 150)
      await pending
      const long = await call(ctx, agent, 'bash', {
        command: 'sleep 30',
        description: '清理后台',
        run_in_background: true,
      })
      assert.ok(!long.isError, text(long))
      const longId = ctx.jobs.list(a).find((job) => job.status === 'running').id
      await call(ctx, agent, 'job_kill', { job_id: longId })
      await ctx.jobs.wait(longId, 5000, a)
      assert.notEqual(ctx.jobs.get(longId, a).status, 'running')
      ctx.permissionPresets.set(agent.session, 'full-access')
      const full = await call(ctx, agent, 'bash', {
        command: 'printf full-mode',
        description: '完整权限执行',
      })
      assert.ok(!full.isError, text(full))
      assert.match(text(full), /full-mode/)
      const blockedFetch = await call(ctx, agent, 'web_fetch', {
        url: 'http://fixture:fixture@127.0.0.1/',
      })
      assert.equal(blockedFetch.isError, true)
      assert.match(text(blockedFetch), /credentials in URLs are not allowed/i)
      assert.ok(ctx.tools.get('web_search'))
      assert.ok(ctx.tools.get('web_fetch'))
    } finally {
      await client.dispose()
      await host.dispose()
    }
  },
)
