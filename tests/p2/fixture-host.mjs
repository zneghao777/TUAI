// Explicit test launcher. This module is never imported by the product boot path.
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebHost } from '../../apps/cli/lib/web.js'
import {
  MockAdapter,
  textResponse,
  toolCallResponse,
} from '../../packages/product/agent-runtime/lib/fixture-model.js'
import PtcRuntime from '../../packages/ptc-runtime/ptc-runtime/lib/index.js'
import * as NativeExecutor from '../../packages/core/tool-executor-native/lib/index.js'
import * as PtcExecutor from '../../packages/core/tool-executor-ptc/lib/index.js'
import { defineTool } from '../../packages/core/tools/lib/index.js'
import { setTimeout as delay } from 'node:timers/promises'

// Controlled program provider calls actual guarded tools; never evaluates arbitrary source.
// This fixture tests Host nested dispatch transport, not delivery of a production PTC backend.
class ControlledProgram extends PtcRuntime {
  language = 'typescript'
  isolation = 'test-controlled-binding'
  resolve(request) {
    return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: 5000 }
  }
  async run(request) {
    request.signal?.throwIfAborted()
    if (request.program !== 'return await tools.sum_numbers({a:19,b:23})')
      throw new Error('Unknown fixture program')
    const value = await request.bindings[0].functions.sum_numbers({ a: 19, b: 23 })
    return { logs: [], value }
  }
}
class ScenarioModel extends MockAdapter {
  constructor() {
    super([])
    this.calls = []
    this.continuations = new Set()
    this.reasoningResumed = false
  }
  continueRuns() {
    this.reasoningResumed = true
    for (const resume of this.continuations) resume()
    this.continuations.clear()
  }
  async listModels() {
    return [{ provider: 'p2-controlled', id: 'controlled', name: 'P2 受控验收模型' }]
  }
  async *stream(options) {
    this.calls.push(options)
    const messages = options.messages,
      last = messages
        .filter((m) => (m.role === 'user' && m.source?.kind === 'user') || m.role === 'tool')
        .at(-1)
    const text =
      last?.content
        ?.filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n') ?? ''
    const request = messages.filter((m) => m.role === 'user' && m.source?.kind === 'user').at(-1)
    const requestText =
      request?.content
        ?.filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('') ?? ''
    if (requestText.includes('TZ064')) {
      const step = messages
        .slice(messages.lastIndexOf(request))
        .filter((message) => message.role === 'tool').length
      const operations = [
        ['write', { file_path: 'tool-result.txt', content: 'initial value' }],
        ['edit', { file_path: 'tool-result.txt', old_string: 'initial', new_string: 'updated' }],
        ['read', { file_path: 'tool-result.txt' }],
        ['grep', { pattern: 'updated', path: '.' }],
        ['todo_write', { todos: [{ content: '验证工具展示', status: 'completed' }] }],
        ['bash', { description: '验证真实沙箱输出', command: 'printf TZ064-shell-output' }],
        ['web_fetch', { url: 'http://127.0.0.1:1/private' }],
      ]
      if (step >= operations.length) yield* textResponse('TZ064 工具执行验收完成。')
      else yield* toolCallResponse(crypto.randomUUID(), ...operations[step])
      return
    }
    if (requestText.includes('TZ063')) {
      const results = messages
        .slice(messages.lastIndexOf(request))
        .filter((m) => m.role === 'tool').length
      const reasoning =
        results === 0
          ? '先检查工作区资料。\n\n核对文件读取与错误处理。'
          : '已收到工具返回，继续核验执行结果。'
      yield { type: 'block-start', index: 0, blockType: 'reasoning' }
      for (const part of [reasoning.slice(0, 10), reasoning.slice(10)]) {
        yield { type: 'reasoning-delta', index: 0, text: part }
        await delay(750, undefined, { signal: options.signal })
      }
      if (results === 0 && requestText.includes('可控思考') && !this.reasoningResumed) {
        await new Promise((resolve, reject) => {
          this.continuations.add(resolve)
          options.signal.addEventListener(
            'abort',
            () => {
              this.continuations.delete(resolve)
              reject(options.signal.reason)
            },
            { once: true },
          )
        })
      }
      if (requestText.includes('持续思考')) {
        await delay(10000, undefined, { signal: options.signal })
      }
      yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning } }
      if (requestText.includes('纯思考')) {
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const response =
        results >= (requestText.includes('长过程') ? 12 : 2)
          ? textResponse('TZ063 验收回答：资料已读取，失败已记录，结果完整。')
          : toolCallResponse(crypto.randomUUID(), 'read', {
              file_path: results === 0 ? 'package.json' : 'tz063-missing-file.txt',
            })
      for (const chunk of response)
        yield 'index' in chunk ? { ...chunk, index: chunk.index + 1 } : chunk
      return
    }
    if (last?.role === 'tool') {
      yield* textResponse('工具回执已收到。')
      return
    }
    if (text.includes('嵌套')) {
      yield* toolCallResponse(crypto.randomUUID(), 'run_code', {
        description: '真实子工具调用',
        code: 'return await tools.sum_numbers({a:19,b:23})',
      })
      return
    }
    if (text.includes('大输出')) {
      yield* toolCallResponse(crypto.randomUUID(), 'large_fixture', {})
      return
    }
    if (text.includes('审批')) {
      yield* toolCallResponse(crypto.randomUUID(), 'bash', {
        description: '输出 P2 验收标识',
        command: 'printf "P2_REAL_SHELL_OK\\n"',
      })
      return
    }
    if (text.includes('问题')) {
      yield* toolCallResponse(crypto.randomUUID(), 'ask_user_question', {
        questions: [
          {
            id: 'format',
            question: '希望采用哪种格式？',
            options: [
              { label: '简洁', description: '保留结论' },
              { label: '详细', description: '说明依据' },
            ],
          },
          { id: 'extra', question: '补充要求' },
        ],
      })
      return
    }
    if (text.includes('工具失败')) {
      yield* toolCallResponse(crypto.randomUUID(), 'read', {
        file_path: 'p2-does-not-exist.txt',
      })
      return
    }
    if (text.includes('读取工具')) {
      yield* toolCallResponse(crypto.randomUUID(), 'read', {
        file_path: 'package.json',
      })
      return
    }
    if (text.includes('持续运行')) {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '执行仍在进行，等待下一步输入。' }
      await new Promise((resolve, reject) => {
        this.continuations.add(resolve)
        if (options.signal.aborted) reject(options.signal.reason)
        else
          options.signal.addEventListener(
            'abort',
            () => {
              this.continuations.delete(resolve)
              reject(options.signal.reason)
            },
            { once: true },
          )
      })
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '当前受控步骤已完成。' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const result = text.includes('恶意内容')
      ? '安全渲染：<script>window.p2Injected=true</script> [危险链接](javascript:alert(1)) ![远程追踪](https://invalid.example/track.png)\n\n**可读内容**'
      : `已通过真实 Host 接收：${text || '附件'}。`
    for (const chunk of textResponse(result)) {
      options.signal.throwIfAborted()
      if (chunk.type === 'text-delta')
        await delay(text.includes('流式恢复') ? 35 : 2, undefined, { signal: options.signal })
      yield chunk
    }
  }
}
export async function fixtureHost(options = {}) {
  const home = await mkdtemp(join(tmpdir(), 'tianzhiai-p2-ui-'))
  const previous = process.env.TIANZHIAI_HOME
  process.env.TIANZHIAI_HOME = home
  const model = new ScenarioModel()
  try {
    const runtime = await startWebHost(
      { port: 0, provider: 'p2-controlled', model: 'controlled', ...options },
      async (ctx) => {
        ctx.llm.registerAdapter(['p2-controlled'], model)
        const sample = await readFile('package.json', 'utf8')
        ctx.on('agent/created', async ({ agent }) => {
          const cwd = agent.session.header.cwd
          if (cwd?.includes('/data/workspaces/'))
            await writeFile(join(cwd, 'package.json'), sample, { flag: 'wx' }).catch((error) => {
              if (error.code !== 'EEXIST') throw error
            })
        })
        if (options.nested) {
          for (const fiber of [...(ctx.registry.get(NativeExecutor)?.fibers ?? [])])
            await fiber.dispose()
          await ctx.plugin(ControlledProgram)
          await ctx.plugin(PtcExecutor, { maxParallelSubCalls: 1 })
        }
        ctx.tools.register(
          defineTool({
            name: 'large_fixture',
            description: '测试用长输出工具，走实际执行与 Spill 管道',
            parameters: {},
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            async execute() {
              return '<img src=x onerror=alert(1)>\n' + '完整结果'.repeat(40000) + '最终证据'
            },
          }),
        )
      },
    )
    const base = `http://127.0.0.1:${runtime.ctx.webServer.port}/`
    return {
      runtime,
      model,
      home,
      base,
      login: runtime.ctx.connection.authenticatedUrl(base),
      async dispose() {
        await runtime.dispose()
        await rm(home, { recursive: true, force: true })
        if (previous === undefined) delete process.env.TIANZHIAI_HOME
        else process.env.TIANZHIAI_HOME = previous
      },
    }
  } catch (error) {
    await rm(home, { recursive: true, force: true })
    throw error
  }
}
