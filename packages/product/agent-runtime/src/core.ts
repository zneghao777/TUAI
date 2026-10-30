import Goal from '@deepseek-ai/dsh-goal'
import * as GoalDriver from '@deepseek-ai/dsh-goal-round-driver'
import * as GoalTools from '@deepseek-ai/dsh-tool-goal'
import Plan from '@deepseek-ai/dsh-plan-mode'
import { mountWebTools } from './web-tools.ts'
import type { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import * as DeepSeek from '@deepseek-ai/dsh-llm-deepseek-api-key'
import * as Retry from '@deepseek-ai/dsh-llm-retry'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { HostCredentials } from './credentials.ts'
import { ModelManager } from './models.ts'
import { MockAdapter, textResponse, toolCallResponse } from './fixture-model.ts'
import { mountHostTools } from './host-tools.ts'
import { mountContext } from './context.ts'
import { mountPermissions } from './permissions.ts'
import { mountSkills } from './skills.ts'

export const name = 'tianzhiai-agent-runtime'
export const inject = ['tianzhiaiHost']

/** Compose the migrated kernel; model/tool/session behavior stays in DSH. */
export async function apply(ctx: Context) {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjection)
  await ctx.plugin(SystemPrompt, {
    personaPrefix: '你是天质个人助理。',
    includeHarnessIdentity: false,
    includeRuntimeContext: false,
  })
  await ctx.plugin(Tools)
  await ctx.plugin(NativeExecutor)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(HostCredentials)
  await ctx.plugin(DeepSeek, {
    apiKeyEnv: 'deepseek',
    baseURL: 'https://api.deepseek.com/anthropic',
    streamIdleTimeoutMs: 60000,
  })
  await ctx.plugin(ModelManager)
  await ctx.plugin(Retry)
  await ctx.plugin(TokenMeter)
  await mountHostTools(ctx)
  await mountSkills(ctx)
  // Mount persistence before the loop, so live writers drain before storage closes.
  await ctx.plugin(Jsonl, { root: ctx.tianzhiaiHost.paths.sessions, compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await mountContext(ctx)
  await mountPermissions(ctx)
  await mountWebTools(ctx)
  await ctx.plugin(Goal, { defaultMaxGoalRounds: 32 })
  await ctx.plugin(GoalDriver)
  await ctx.plugin(GoalTools)
  await ctx.plugin(Plan, {
    section:
      '你处于计划模式。先分析需求和读取必要信息，提出可执行计划。在实施前调用 exit_plan_mode 向用户提交计划，批准后再实施。计划模式不扩大工具权限，仍遵守当前沙箱与审批策略。',
  })
  await ctx.plugin({
    name: 'tianzhiai-basic-tools',
    inject: ['tools', 'tianzhiaiHost'],
    apply(ctx: Context) {
      ctx.tools.register(
        defineTool({
          name: 'sum_numbers',
          description: '计算两个有限数值的和。',
          parameters: {
            a: { type: 'number', required: true },
            b: { type: 'number', required: true },
          },
          output: {
            schema: { type: 'number' },
            render: (_args, value) => [{ type: 'text', text: String(value) }],
          },
          async execute({ a, b }, exec) {
            exec.signal.throwIfAborted()
            return a + b
          },
        }),
      )
      ctx.tools.register(
        defineTool({
          name: 'host_identity',
          description: '读取当前 Host 的公开标识，不包含路径和凭据。',
          parameters: {},
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          async execute(_args, exec) {
            exec.signal.throwIfAborted()
            return ctx.tianzhiaiHost.settings.hostId
          },
        }),
      )
    },
  })
}

/** Explicit, offline demonstration route. Never substituted for a real-model request. */
export function registerDemo(ctx: Context) {
  const adapter = new MockAdapter([
    toolCallResponse('demo-sum', 'sum_numbers', { a: 2, b: 3 }),
    toolCallResponse('demo-host', 'host_identity', {}),
    textResponse('离线演示已完成：两种受控工具已执行并进入会话日志。'),
  ])
  ctx.llm.registerAdapter(['fixture'], adapter)
  return adapter
}

export async function runPrompt(
  ctx: Context,
  options: {
    sessionId: string
    text: string
    resume?: boolean
    provider?: string
    model?: string
    signal?: AbortSignal
  },
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.sessionId))
    throw new Error('会话标识不合法')
  if (!options.text.trim()) throw new Error('输入不能为空')
  options.signal?.throwIfAborted()
  const id = SessionId(options.sessionId)
  const agentOptions = {
    provider: options.provider ?? 'deepseek-official',
    model: options.model ?? 'deepseek-flash',
  }
  const handle = options.resume
    ? await ctx.agents.resume({
        resumeSessionId: id,
        agentOptions,
        ...(options.signal ? { signal: options.signal } : {}),
      })
    : await ctx.agents.create({
        sessionId: id,
        agentOptions,
        meta: { cwd: process.cwd() },
        ...(options.signal ? { signal: options.signal } : {}),
      })
  const { agent } = handle
  if (options.resume && (options.provider !== undefined || options.model !== undefined))
    agent.model.select(agentOptions)
  const cancel = () => agent.cancel({ kind: 'user' })
  options.signal?.addEventListener('abort', cancel, { once: true })
  try {
    options.signal?.throwIfAborted()
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: options.text }],
        source: { kind: 'user' },
      }),
    )
    await agent.whenIdle()
    const events = agent.session.snapshotEvents()
    const end = events.findLast((event) => event.type === 'turn/end')
    const last = agent.session.deriveMessages().findLast((message) => message.role === 'assistant')
    return {
      sessionId: options.sessionId,
      turnEndReason: end?.type === 'turn/end' ? end.data.reason : undefined,
      text:
        last?.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('') ??
        '',
      events,
    }
  } finally {
    options.signal?.removeEventListener('abort', cancel)
    await handle.dispose()
  }
}
