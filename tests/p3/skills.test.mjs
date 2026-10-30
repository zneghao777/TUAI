import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkillStore } from '../../packages/product/agent-runtime/lib/skills.js'
import { fixtureHost } from '../p2/fixture-host.mjs'
import { clientFor } from '../p2/client.mjs'
import { startWebHost } from '../../apps/cli/lib/web.js'
import { createUserMessage } from '../../packages/llm/llm/lib/index.js'
import {
  textResponse,
  toolCallResponse,
} from '../../packages/product/agent-runtime/lib/fixture-model.js'

export const skillPackage = (body = '版本一正文', extra = []) => ({
  source: '测试技能',
  files: [
    {
      path: 'SKILL.md',
      data: Buffer.from(
        `---\nname: test-skill\ndescription: 测试技能的用途\n---\n${body}`,
      ).toString('base64'),
    },
    ...extra,
  ],
})
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
const send = async (agent, text) => {
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
  await agent.whenIdle()
}
async function call(ctx, agent, name, args) {
  const signal = AbortSignal.timeout(15000)
  const toolSet = await ctx.tools.resolve({
    agent,
    signal,
    modelSelection: { provider: 'p2-controlled', model: 'controlled' },
  })
  try {
    return (
      await ctx.tools.execute({
        agent,
        signal,
        toolSet,
        calls: [{ type: 'tool-call', id: crypto.randomUUID(), name, arguments: args }],
      })
    ).results[0].result
  } finally {
    toolSet.dispose()
  }
}

test('skill runtime resources stay outside workspace and remain scoped to the loading session', async () => {
  const host = await fixtureHost()
  const client = await clientFor(host.runtime)
  let reboot
  try {
    const ctx = host.runtime.ctx
    const api = client.ctx.remote.skillLibrary
    let skill = ok(
      await api.import(
        skillPackage('读取资源', [
          {
            path: 'scripts/probe.sh',
            data: Buffer.from('printf skill-script-ok').toString('base64'),
          },
        ]),
      ),
    )
    skill = ok(await api.check({ id: skill.id, revision: skill.revision, version: 1 }))
    ok(await api.activate({ id: skill.id, revision: skill.revision, version: 1 }))
    const a = await client.ctx.sessions.create({})
    const b = await client.ctx.sessions.create({})
    const agent = ctx.agents.get(a),
      other = ctx.agents.get(b)
    const loaded = await ctx.skills.get('test-skill', { scope: agent })
    assert.equal(loaded.resourceBase.kind, 'directory')
    const base = loaded.resourceBase.path
    assert.ok(!base.startsWith(agent.session.header.cwd + '/'), '技能副本不应出现在工作区')
    assert.deepEqual(
      (await readdir(agent.session.header.cwd)).filter((name) => name.startsWith('.skill-')),
      [],
    )
    const resource = join(base, 'scripts/probe.sh')
    const own = await call(ctx, agent, 'read', { file_path: resource })
    assert.equal(Boolean(own.isError), false, JSON.stringify(own))
    assert.match(JSON.stringify(own), /skill-script-ok/)
    const cross = await call(ctx, other, 'read', { file_path: resource })
    assert.equal(cross.isError, true)
    const privateFile = join(ctx.tianzhiaiHost.paths.cache, 'not-a-skill.txt')
    await writeFile(privateFile, 'private-data')
    assert.equal((await call(ctx, agent, 'read', { file_path: privateFile })).isError, true)
    assert.equal(
      (await call(ctx, agent, 'write', { file_path: resource, content: 'blocked' })).isError,
      true,
    )
    const approve = ctx.on('approval/request', () => 'allowed-once')
    const command = `bash '${resource.replaceAll("'", "'\\''")}'`
    let step = 0
    host.model.stream = async function* () {
      if (step++ === 0)
        yield* toolCallResponse(crypto.randomUUID(), 'bash', {
          description: '只读执行技能测试脚本',
          command,
        })
      else yield* textResponse('已完成')
    }
    await send(agent, '执行技能测试脚本')
    const readonlyShell = agent.session
      .snapshotEvents()
      .filter((event) => event.type === 'tool/result')
      .at(-1).data.message
    approve()
    assert.equal(Boolean(readonlyShell.isError), false, JSON.stringify(readonlyShell))
    assert.match(JSON.stringify(readonlyShell), /skill-script-ok/)
    ctx.permissionPresets.set(agent.session, 'full-access')
    assert.equal(
      (await call(ctx, agent, 'write', { file_path: resource, content: 'blocked' })).isError,
      true,
    )
    assert.equal((await call(ctx, agent, 'read', { file_path: privateFile })).isError, true)
    assert.equal((await call(ctx, other, 'read', { file_path: resource })).isError, true)
    const shell = await call(ctx, agent, 'bash', { description: '执行技能测试脚本', command })
    assert.equal(Boolean(shell.isError), false, JSON.stringify(shell))
    assert.match(JSON.stringify(shell), /skill-script-ok/)
    host.model.stream = async function* () {
      yield* textResponse('已完成')
    }
    await send(agent, '完成一个回合')
    const fork = ok(await client.ctx.remote.session.fork({ sessionId: a }))
    const forkAgent = ctx.agents.get(fork.sessionId)
    assert.equal(forkAgent.session.header.cwd, agent.session.header.cwd)
    assert.equal(
      Boolean((await call(ctx, forkAgent, 'read', { file_path: resource })).isError),
      false,
    )
    await client.dispose()
    await host.runtime.dispose()
    reboot = await startWebHost({ port: 0, provider: 'p2-controlled', model: 'controlled' })
    const resumed = (await reboot.ctx.agents.resume({ resumeSessionId: a })).agent
    assert.equal(
      Boolean((await call(reboot.ctx, resumed, 'read', { file_path: resource })).isError),
      false,
    )
  } finally {
    await reboot?.dispose()
    await client.dispose()
    await host.dispose()
  }
})

test('immutable versions, CAS, validation, disable and restart retain turn snapshots and evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tz-skill-store-'))
  let store = new SkillStore(join(directory, 'skills.db'))
  try {
    let skill = store.import(skillPackage())
    assert.deepEqual(store.selection(), {})
    assert.throws(
      () => store.activate({ id: skill.id, revision: skill.revision, version: 1 }, []),
      /检查/,
    )
    assert.throws(() => store.import(skillPackage()), /同名/)
    skill = store.check({ id: skill.id, revision: skill.revision, version: 1 }, [])
    skill = store.activate({ id: skill.id, revision: skill.revision, version: 1 }, [])
    assert.deepEqual(store.selection('session-a', 1), { [skill.id]: 1 })
    const revision = skill.revision
    skill = store.edit({ ...skillPackage('版本二正文'), id: skill.id, revision })
    assert.throws(() => store.disable(skill.id, revision), /刷新/)
    skill = store.check({ id: skill.id, revision: skill.revision, version: 2 }, [])
    skill = store.activate({ id: skill.id, revision: skill.revision, version: 2 }, [])
    assert.equal(store.selection('session-a', 1)[skill.id], 1)
    assert.equal(store.selection('session-a', 2)[skill.id], 2)
    store.used(skill.id, 1, 'session-a', 1)
    store.used(skill.id, 1, 'session-a', 1)
    assert.equal(store.detail(skill.id).uses.length, 1)
    store.close()
    store = new SkillStore(join(directory, 'skills.db'))
    assert.equal(store.selection('session-a', 1)[skill.id], 1)
    assert.equal(store.package(skill.id, 1).body, '版本一正文')
    skill = store.activate({ id: skill.id, revision: skill.revision, version: 1 }, [])
    assert.equal(skill.activeVersion, 1)
    skill = store.disable(skill.id, skill.revision)
    assert.deepEqual(store.selection(), {})
    assert.equal(store.detail(skill.id).uses[0].version, 1)
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('reject traversal, duplicate paths, invalid YAML, missing instructions and unavailable dependencies', () => {
  const store = new SkillStore(':memory:')
  try {
    for (const path of ['../secret', '/secret', 'a\\secret', 'a/../secret', 'C:secret', 'a//b'])
      assert.throws(() => store.import(skillPackage('body', [{ path, data: '' }])), /路径/)
    assert.throws(
      () => store.import(skillPackage('body', [{ path: 'skill.md', data: '' }])),
      /重名/,
    )
    assert.throws(
      () =>
        store.import({
          source: 'x',
          files: [{ path: 'SKILL.md', data: Buffer.from('missing yaml').toString('base64') }],
        }),
      /YAML/,
    )
    let skill = store.import(
      skillPackage('body', [
        {
          path: 'tianzhiai.manifest.json',
          data: Buffer.from('{"requiredTools":["missing-tool"]}').toString('base64'),
        },
      ]),
    )
    skill = store.check({ id: skill.id, revision: skill.revision, version: 1 }, [])
    assert.deepEqual(skill.versions[0].issues, ['缺少工具：missing-tool'])
    assert.throws(
      () => store.activate({ id: skill.id, revision: skill.revision, version: 1 }, []),
      /检查/,
    )
    assert.throws(() => store.file({ id: skill.id, version: 1, path: '../secret' }), /不存在/)
  } finally {
    store.close()
  }
})

test('real Host RPC, explicit invocation, model loading, resource access, frozen versions and unchanged tool permission', async () => {
  const host = await fixtureHost(),
    client = await clientFor(host.runtime),
    ctx = host.runtime.ctx
  try {
    const api = client.ctx.remote.skillLibrary
    let skill = ok(
      await api.import(
        skillPackage('版本一正文', [
          { path: 'references/note.md', data: Buffer.from('资源证据').toString('base64') },
        ]),
      ),
    )
    skill = ok(await api.check({ id: skill.id, revision: skill.revision, version: 1 }))
    skill = ok(await api.activate({ id: skill.id, revision: skill.revision, version: 1 }))
    const id = await client.ctx.sessions.create({}),
      agent = ctx.agents.get(id)
    assert.equal(
      ok(await client.ctx.remote.skills.list({ sessionId: id })).skills[0].name,
      'test-skill',
    )
    let seen = []
    host.model.stream = async function* (options) {
      seen.push(options)
      yield* textResponse('已读取技能')
    }
    await send(agent, '/test-skill 请执行')
    assert.ok(
      seen[0].messages.some(
        (m) => m.source?.kind === 'skill-invocation' && JSON.stringify(m).includes('版本一正文'),
      ),
    )
    assert.equal(ok(await api.get(skill.id)).uses.length, 1)
    let calls = 0
    host.model.stream = async function* (options) {
      calls++
      if (calls === 1) {
        yield* toolCallResponse(crypto.randomUUID(), 'skill', { name: 'test-skill' })
        return
      }
      if (calls === 2) {
        assert.ok(JSON.stringify(options.messages).includes('版本一正文'))
        const store = ctx.skillLibrary.store
        skill = store.edit({
          ...skillPackage('版本二正文', [
            { path: 'references/note.md', data: Buffer.from('新资源').toString('base64') },
          ]),
          id: skill.id,
          revision: skill.revision,
        })
        skill = store.check({ id: skill.id, revision: skill.revision, version: 2 }, [])
        skill = store.activate({ id: skill.id, revision: skill.revision, version: 2 }, [])
        yield* toolCallResponse(crypto.randomUUID(), 'skill_resource', {
          name: 'test-skill',
          path: 'references/note.md',
        })
        return
      }
      assert.ok(JSON.stringify(options.messages.at(-1)).includes('资源证据'))
      yield* textResponse('资源读取完成')
    }
    await send(agent, '使用测试技能处理资料')
    assert.equal(calls, 3)
    assert.equal(ok(await api.get(skill.id)).uses.at(0).version, 1)
    const before = agent.session.snapshotEvents().length
    calls = 0
    host.model.stream = async function* () {
      if (calls++ === 0)
        yield* toolCallResponse(crypto.randomUUID(), 'write', {
          file_path: 'denied.txt',
          content: '禁止绕过权限',
        })
      else yield* textResponse('已拒绝')
    }
    await send(agent, '/test-skill 尝试写文件')
    assert.equal(ctx.permissionPresets.current(agent.session), 'readonly')
    assert.ok(
      agent.session
        .snapshotEvents()
        .slice(before)
        .some((e) => e.type === 'tool/result' && e.data.message.isError),
    )
    skill = ok(await api.disable(skill.id, skill.revision))
    assert.deepEqual(ok(await client.ctx.remote.skills.list({ sessionId: id })).skills, [])
    seen = []
    host.model.stream = async function* (options) {
      seen.push(options)
      yield* textResponse('已停用')
    }
    const useCount = ok(await api.get(skill.id)).uses.length
    await send(agent, '/test-skill 不应加载')
    assert.equal(ok(await api.get(skill.id)).uses.length, useCount)
    assert.equal((await api.disable(skill.id, skill.revision - 1)).ok, false)
    const response = await fetch(new URL('/api/remote', client.base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.notEqual(response.status, 200)
  } finally {
    await client.dispose()
    await host.dispose()
  }
})
