import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { MockAdapter, textResponse } from '../fixtures/scripted-model.ts'

describe('TZ-007 产品核心组合', () => {
  it('注册真实服务并从可回放模型读取流，随后释放注册', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjection)
      await ctx.plugin(SystemPrompt, {
        personaPrefix: '你是TUAI 个人助理。',
        includeHarnessIdentity: false,
        includeRuntimeContext: false,
      })
      await ctx.plugin(Tools)
      await ctx.plugin(AgentRegistry)
      const adapter = new MockAdapter([textResponse('核心已就绪')])
      ctx.llm.registerAdapter(['fixture'], adapter)
      const chunks = await Array.fromAsync(
        ctx.llm.stream({ provider: 'fixture', model: 'fixture', messages: [] }),
      )
      expect(
        chunks
          .filter((chunk) => chunk.type === 'text-delta')
          .map((chunk) => chunk.text)
          .join(''),
      ).toBe('核心已就绪')
      expect(ctx.sessions).toBeDefined()
      expect(ctx.agents).toBeDefined()
      expect(ctx.tools).toBeDefined()
      expect(ctx.sessionProjections).toBeDefined()
      expect(adapter.requests).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
