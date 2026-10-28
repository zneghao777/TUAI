import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { bootProfile } from '../../apps/cli/lib/boot.js'
import {
  EnvironmentCredentials,
  loadHostSettings,
  resolveHostPaths,
} from '../../packages/product/host-config/lib/index.js'
import { registerDemo, runPrompt } from '../../packages/product/agent-runtime/lib/index.js'
import { LlmAdapter } from '../../packages/llm/llm/lib/index.js'
import { defineTool } from '../../packages/core/tools/lib/index.js'
import {
  MockAdapter,
  textResponse,
  toolCallResponse,
} from '../../packages/product/agent-runtime/lib/types/fixture-model.js'
import { sessionDir } from '../../packages/spill/spill-local/lib/index.js'
import { readdir } from 'node:fs/promises'

async function boot(root) {
  const paths = resolveHostPaths({ env: { TIANZHIAI_HOME: root } })
  // P1 regression fixtures exercise the existing read-only Profile. Fresh P2
  // workspace-write defaults are covered separately by remaining-host.test.mjs.
  const settings = { ...(await loadHostSettings(paths)), defaultPermissionPreset: 'readonly' }
  return bootProfile('profiles/production.json', {
    prepare(ctx) {
      ctx.provide('tianzhiaiHost', { paths, settings, credentials: new EnvironmentCredentials({}) })
    },
  })
}

test('TZ-010 产品 Profile 完成两种工具、持久化与恢复，模型实际读到结果', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tianzhiai-core-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (let run = 0; run < 2; run++) {
    const runtime = await boot(root)
    try {
      const adapter = registerDemo(runtime.ctx)
      const result = await runPrompt(runtime.ctx, {
        sessionId: 'persisted-core',
        text: '测试工具',
        provider: 'fixture',
        model: 'fixture',
        resume: run === 1,
      })
      assert.equal(result.turnEndReason.kind, 'completed', JSON.stringify(result.turnEndReason))
      assert.equal(result.events.filter((e) => e.type === 'tool/result').length, (run + 1) * 2)
      assert.equal(result.events.filter((e) => e.type === 'turn/end').length, run + 1)
      assert.ok(
        adapter.requests[1].messages.some(
          (m) => m.role === 'tool' && m.content.some((b) => b.type === 'text' && b.text === '5'),
        ),
      )
      assert.ok(adapter.requests[2].messages.filter((m) => m.role === 'tool').length >= 2)
    } finally {
      await runtime.dispose()
    }
  }
})

test('TZ-014 无 Git 的中文空格目录可运行，根与子目录指令继承且不读取工作区外指令', async () => {
  const root = await mkdtemp(join(tmpdir(), '天质 独立 指令 '))
  const workspace = join(root, '工作区')
  const nested = join(workspace, '子目录')
  await mkdir(nested, { recursive: true })
  await writeFile(join(root, 'AGENTS.md'), 'PARENT_PRIVATE_INSTRUCTIONS')
  await writeFile(join(workspace, 'AGENTS.md'), 'ROOT_WORKSPACE_CONSTRAINT')
  await writeFile(join(nested, 'AGENTS.md'), 'NESTED_WORKSPACE_CONSTRAINT')
  const previous = process.cwd()
  const manifest = join(previous, 'profiles/production.json')
  process.chdir(workspace)
  let runtime
  try {
    const paths = resolveHostPaths({ env: { TIANZHIAI_HOME: join(root, 'host') } })
    const settings = await loadHostSettings(paths)
    runtime = await bootProfile(manifest, {
      prepare(ctx) {
        ctx.provide('tianzhiaiHost', {
          paths,
          settings,
          credentials: new EnvironmentCredentials({}),
        })
      },
    })
    const adapter = new MockAdapter([
      toolCallResponse('enter-nested', 'working_directory', { cd: nested }),
      textResponse('已继承指令'),
    ])
    runtime.ctx.llm.registerAdapter(['directory-fixture'], adapter)
    const result = await runPrompt(runtime.ctx, {
      sessionId: 'no-git-workspace',
      text: '读取工作区指令',
      provider: 'directory-fixture',
      model: 'fixture',
    })
    assert.equal(result.turnEndReason.kind, 'completed', JSON.stringify(result.turnEndReason))
    assert.ok(JSON.stringify(adapter.requests[0]).includes('ROOT_WORKSPACE_CONSTRAINT'))
    assert.ok(JSON.stringify(adapter.requests[1]).includes('ROOT_WORKSPACE_CONSTRAINT'))
    assert.ok(JSON.stringify(adapter.requests[1]).includes('NESTED_WORKSPACE_CONSTRAINT'))
    assert.ok(!JSON.stringify(adapter.requests).includes('PARENT_PRIVATE_INSTRUCTIONS'))
    await assert.rejects(runtime.ctx.fs.resolve(join(root, 'AGENTS.md')), /授权范围/)
  } finally {
    await runtime?.dispose()
    process.chdir(previous)
    await rm(root, { recursive: true, force: true })
  }
})

test('TZ-010 取消真实循环里的模型流，保留中断原因并清理服务', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tianzhiai-cancel-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = await boot(root)
  let cancelled = false
  const started = Promise.withResolvers()
  class Hanging extends LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, context: { contextWindow: 1000000 } }
    }
    async *stream(options) {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '已输出' }
      started.resolve()
      await new Promise((_, reject) =>
        options.signal.addEventListener(
          'abort',
          () => {
            cancelled = true
            reject(options.signal.reason)
          },
          { once: true },
        ),
      )
    }
  }
  try {
    runtime.ctx.llm.registerAdapter(['cancel-fixture'], new Hanging())
    const controller = new AbortController()
    const pending = runPrompt(runtime.ctx, {
      sessionId: 'cancel-core',
      text: '取消',
      provider: 'cancel-fixture',
      model: 'fixture',
      signal: controller.signal,
    })
    await started.promise
    controller.abort()
    const result = await pending
    assert.equal(result.turnEndReason.kind, 'aborted')
    assert.equal(cancelled, true)
    assert.equal(runtime.ctx.agents.get('cancel-core'), undefined)
  } finally {
    await runtime.dispose()
  }
  assert.equal(runtime.ctx.get('sessions'), undefined)
})

test('TZ-010 两次独立 CLI 进程从产品日志继续会话', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tianzhiai-process-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const resume of [false, true]) {
    const child = spawnSync(
      process.execPath,
      [
        '--expose-internals',
        'apps/cli/lib/index.js',
        '--demo',
        '--session',
        'process-core',
        ...(resume ? ['--resume'] : []),
      ],
      { encoding: 'utf8', timeout: 15000, env: { ...process.env, TIANZHIAI_HOME: root } },
    )
    assert.equal(child.status, 0, child.stderr)
    const result = JSON.parse(child.stdout)
    assert.equal(result.turnEndReason.kind, 'completed')
    assert.equal(result.events.filter((e) => e.type === 'turn/end').length, resume ? 2 : 1)
  }
})

test('TZ-011 产品文件只读范围和附件目录实际生效', async (t) => {
  await mkdir('.runtime', { recursive: true })
  const workspace = await mkdtemp(join(process.cwd(), '.runtime/p1-files-'))
  const outside = await mkdtemp(join(tmpdir(), 'tianzhiai-outside-'))
  t.after(async () => {
    await rm(workspace, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })
  const runtime = await boot(join(outside, 'host'))
  try {
    const path = join(workspace, 'allowed.txt')
    await writeFile(path, '只读文件')
    await writeFile(join(outside, 'private.txt'), '范围外')
    await symlink(join(outside, 'private.txt'), join(workspace, 'outside-link'))
    const target = await runtime.ctx.fs.resolve(path)
    assert.equal(await runtime.ctx.fs.readText(target), '只读文件')
    await assert.rejects(runtime.ctx.fs.resolve(join(workspace, 'outside-link')), /授权范围/)
    await assert.rejects(runtime.ctx.fs.resolve(join(outside, 'private.txt')), /授权范围/)
    await assert.rejects(runtime.ctx.fs.writeText(target, '禁止写入'), /denied|read-only/i)
    assert.equal(await readFile(path, 'utf8'), '只读文件')
    const ref = await runtime.ctx.attachments.saveFile({
      data: Buffer.from('附件'),
      name: 'fixture.txt',
    })
    assert.ok(ref.attachmentId)
    assert.ok(runtime.ctx.attachments.root.startsWith(join(outside, 'host', 'data')))
    assert.ok(runtime.ctx.tools.get('write'))
    assert.ok(runtime.ctx.tools.get('edit'))
  } finally {
    await runtime.dispose()
  }
})

test(
  'TZ-011 macOS 真实沙箱拒绝写入，命令超时能清理进程',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'tianzhiai-shell-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const runtime = await boot(root)
    try {
      const read = await runtime.ctx.shell.execute(
        runtime.ctx.shell.resolve({ command: 'printf sandbox-ok' }),
      )
      const result = await read.result()
      assert.equal(result.exitCode, 0)
      assert.equal(result.stdout.text, 'sandbox-ok')
      const write = await runtime.ctx.shell.execute(
        runtime.ctx.shell.resolve({ command: `printf denied > '${join(root, 'denied.txt')}'` }),
      )
      assert.notEqual((await write.result()).exitCode, 0)
      await assert.rejects(readFile(join(root, 'denied.txt')), /ENOENT/)
      const slow = await runtime.ctx.shell.execute(
        runtime.ctx.shell.resolve({ command: 'sleep 30', timeoutMs: 100 }),
      )
      const stopped = await slow.result()
      assert.equal(stopped.timedOut, true)
    } finally {
      await runtime.dispose()
    }
  },
)

test('TZ-012 大输出保留完整产物，模型结果受预算约束，其他会话读取被拒绝', async (t) => {
  await mkdir('.runtime', { recursive: true })
  const root = await mkdtemp(join(process.cwd(), '.runtime/p1-spill-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = await boot(root)
  try {
    await assert.rejects(
      runtime.ctx.fs.resolve(runtime.ctx.tianzhiaiHost.paths.hostConfig),
      /授权范围/,
    )
    const full = '完整内容'.repeat(40000) + '最终证据'
    runtime.ctx.tools.register(
      defineTool({
        name: 'large_fixture',
        description: '验收长输出',
        parameters: {},
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute() {
          return full
        },
      }),
    )
    const adapter = new MockAdapter([
      toolCallResponse('large-call', 'large_fixture', {}),
      textResponse('已读取摘要'),
    ])
    runtime.ctx.llm.registerAdapter(['large-fixture'], adapter)
    const result = await runPrompt(runtime.ctx, {
      sessionId: 'output-owner',
      text: '大输出',
      provider: 'large-fixture',
      model: 'fixture',
    })
    assert.equal(result.turnEndReason.kind, 'completed')
    const content = adapter.requests[1].messages
      .filter((m) => m.role === 'tool')
      .flatMap((m) => m.content)
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    assert.ok(content.length < full.length / 2)
    const directory = sessionDir(runtime.ctx.spillStore.root, 'output-owner')
    const path = join(directory, (await readdir(directory))[0])
    assert.ok((await readFile(path, 'utf8')).includes('最终证据'))
    for (const [sessionId, resume, allowed] of [
      ['output-owner', true, true],
      ['other-owner', false, false],
    ]) {
      const reader = new MockAdapter([
        toolCallResponse('read-artifact', 'read', { file_path: path }),
        textResponse('读取结束'),
      ])
      const provider = `reader-${sessionId}`
      runtime.ctx.llm.registerAdapter([provider], reader)
      await runPrompt(runtime.ctx, {
        sessionId,
        resume,
        text: '读取产物',
        provider,
        model: 'fixture',
      })
      const tool = reader.requests[1].messages.findLast((m) => m.role === 'tool')
      assert.equal(Boolean(tool.isError), !allowed)
    }
  } finally {
    await runtime.dispose()
  }
})

test('TZ-012 无进展工具循环会有界停止并记录真实失败', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tianzhiai-budget-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = await boot(root)
  try {
    const adapter = new MockAdapter(
      Array.from({ length: 40 }, (_, i) =>
        toolCallResponse(`repeat-${i}`, 'sum_numbers', { a: 1, b: 1 }),
      ),
    )
    runtime.ctx.llm.registerAdapter(['repeat-fixture'], adapter)
    const result = await runPrompt(runtime.ctx, {
      sessionId: 'repeat-owner',
      text: '重复工具',
      provider: 'repeat-fixture',
      model: 'fixture',
    })
    assert.equal(result.turnEndReason.kind, 'error')
    assert.match(result.turnEndReason.error.message, /32 步/)
    assert.ok(adapter.requests.length <= 32)
    assert.ok(result.events.some((event) => JSON.stringify(event).includes('repeat-tool-reminder')))
  } finally {
    await runtime.dispose()
  }
})

test(
  'TZ-013 模型 Shell 调用逐次审批，扩权和跳过前置策略都被最终权限检查拒绝',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'tianzhiai-approval-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const runtime = await boot(root)
    try {
      let asks = 0
      const off = runtime.ctx.on('approval/request', async () => {
        asks++
        return 'allowed-once'
      })
      const adapter = new MockAdapter([
        toolCallResponse('approved-1', 'bash', {
          description: '受控验收命令',
          command: 'printf approved',
        }),
        toolCallResponse('approved-2', 'bash', {
          description: '受控验收命令',
          command: 'printf approved',
        }),
        toolCallResponse('widen', 'bash', {
          description: '受控验收命令',
          command: 'printf refused',
          sandbox_permissions: 'require_escalated',
          justification: '模型要求扩权',
        }),
        textResponse('审批验收完成'),
      ])
      runtime.ctx.llm.registerAdapter(['approval-fixture'], adapter)
      const result = await runPrompt(runtime.ctx, {
        sessionId: 'approval-owner',
        text: '审批测试',
        provider: 'approval-fixture',
        model: 'fixture',
      })
      assert.equal(asks, 3)
      assert.equal(result.events.filter((e) => e.type === 'approval/asked').length, 3)
      const tools = adapter.requests.at(-1).messages.filter((m) => m.role === 'tool')
      assert.equal(Boolean(tools[0].isError), false, JSON.stringify(tools[0]))
      assert.equal(Boolean(tools[1].isError), false)
      assert.equal(tools[2].isError, true)
      off()
      const bypass = runtime.ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }))
      const denied = new MockAdapter([
        toolCallResponse('bypass', 'bash', {
          description: '受控验收命令',
          command: 'printf forbidden',
        }),
        textResponse('结束'),
      ])
      runtime.ctx.llm.registerAdapter(['bypass-fixture'], denied)
      await runPrompt(runtime.ctx, {
        sessionId: 'bypass-owner',
        text: '策略验收',
        provider: 'bypass-fixture',
        model: 'fixture',
      })
      assert.equal(denied.requests[1].messages.find((m) => m.role === 'tool').isError, true)
      bypass()
    } finally {
      await runtime.dispose()
    }
  },
)

test('TZ-013 测试 Client 回答问题，取消后旧审批回答不能执行工具', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tianzhiai-question-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = await boot(root)
  try {
    runtime.ctx.on('user-questions/request', async (request) => ({
      answers: request.questions.map((q) => ({ id: q.id, selected: ['测试回答'] })),
    }))
    const question = new MockAdapter([
      toolCallResponse('question-call', 'ask_user_question', {
        questions: [{ id: 'choice', question: '选择一个值' }],
      }),
      textResponse('已收到'),
    ])
    runtime.ctx.llm.registerAdapter(['question-fixture'], question)
    await runPrompt(runtime.ctx, {
      sessionId: 'question-owner',
      text: '提问',
      provider: 'question-fixture',
      model: 'fixture',
    })
    assert.ok(
      JSON.stringify(question.requests[1].messages.find((m) => m.role === 'tool')).includes(
        '测试回答',
      ),
    )
    if (process.platform !== 'win32') {
      const received = Promise.withResolvers()
      const answer = Promise.withResolvers()
      const off = runtime.ctx.on('approval/request', () => {
        received.resolve()
        return answer.promise
      })
      const controller = new AbortController()
      const adapter = new MockAdapter([
        toolCallResponse('stale-answer', 'bash', {
          description: '受控验收命令',
          command: 'printf should-not-run',
        }),
      ])
      runtime.ctx.llm.registerAdapter(['stale-fixture'], adapter)
      let executions = 0
      runtime.ctx.on('tools/execute', (exec, next) => {
        if (exec.name === 'bash') executions++
        return next()
      })
      const pending = runPrompt(runtime.ctx, {
        sessionId: 'stale-owner',
        text: '等待批准',
        provider: 'stale-fixture',
        model: 'fixture',
        signal: controller.signal,
      })
      await received.promise
      controller.abort()
      assert.equal((await pending).turnEndReason.kind, 'aborted')
      answer.resolve('allowed-once')
      await Promise.resolve()
      off()
      assert.equal(executions, 0)
    }
  } finally {
    await runtime.dispose()
  }
})
