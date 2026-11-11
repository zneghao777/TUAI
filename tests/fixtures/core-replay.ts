import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import * as Native from '@deepseek-ai/dsh-tool-executor-native'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { MockAdapter, textResponse, toolCallResponse } from './scripted-model.ts'

// Both independent processes observe exactly the same deterministic clock.
let clock = 1700000000000
Date.now = () => clock++
const ctx = new Context()
try {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Projection)
  await ctx.plugin(SystemPrompt, {
    personaPrefix: '同一回放提示词',
    includeHarnessIdentity: false,
    includeRuntimeContext: false,
  })
  await ctx.plugin(Tools)
  await ctx.plugin(Native)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  for (const name of ['first', 'second'])
    ctx.tools.register(
      defineTool({
        name,
        description: name,
        parameters: { value: { type: 'string', required: true } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute({ value }) {
          return `${name}:${value}`
        },
      }),
    )
  const model = new MockAdapter([
    textResponse('文本完成'),
    toolCallResponse('first-call', 'first', { value: '输入' }),
    toolCallResponse('second-call', 'second', { value: '结果' }),
    textResponse('工具完成'),
    toolCallResponse('invalid-call', 'first', { value: 123 }),
    textResponse('错误已记录'),
  ])
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = await ctx.agentLoop.create(SessionId('replay'), {
    provider: 'fixture',
    model: 'fixture',
  })
  for (const text of ['文本', '两种工具', '非法参数']) {
    agent.followup(
      createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
    )
    await agent.whenIdle()
  }
  const hanging = new MockAdapter(['hang'])
  ctx.llm.registerAdapter(['cancel'], hanging)
  const cancelled = await ctx.agentLoop.create(SessionId('cancel'), {
    provider: 'cancel',
    model: 'fixture',
  })
  const started = Promise.withResolvers<void>()
  const off = ctx.on('agent/assistant-stream', ({ agent: subject, frame }) => {
    if (subject === cancelled && frame.type === 'chunk') started.resolve()
  })
  cancelled.followup(
    createUserMessage({ content: [{ type: 'text', text: '取消' }], source: { kind: 'user' } }),
  )
  await started.promise
  cancelled.cancel({ kind: 'user' })
  await cancelled.whenIdle()
  off()
  console.log(
    JSON.stringify({
      requests: model.requests.map(({ signal: _signal, ...request }) => request),
      events: agent.session.snapshotEvents(),
      cancelled: cancelled.session.snapshotEvents(),
    }),
  )
} finally {
  await ctx.fiber.dispose()
}
