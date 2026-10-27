import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as DeepSeek from '@deepseek-ai/dsh-llm-deepseek-api-key'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { HostCredentials } from '@tianzhiai/agent-runtime'
import { EnvironmentCredentials, resolveHostPaths } from '@tianzhiai/host-config'
import {
  mockServer,
  closeMockServers,
  textEvents,
} from '../../packages/llm/llm-deepseek/tests/mock-server.ts'

afterEach(closeMockServers)

it('TZ-008 Host 引用控制模型凭据，受控 HTTP 请求不携带上游匿名身份', async () => {
  const server = await mockServer([{ kind: 'sse', events: textEvents }])
  const ctx = new Context()
  const home = await mkdtemp(join(tmpdir(), 'tianzhiai-provider-'))
  ctx.provide('tianzhiaiHost', {
    paths: resolveHostPaths({ env: { TIANZHIAI_HOME: home } }),
    settings: {
      version: 1,
      hostId: 'fixture-host',
      profile: 'production',
      credentialReferences: {
        deepseek: { source: 'environment', name: 'TIANZHIAI_SECRET_DEEPSEEK' },
      },
    },
    credentials: new EnvironmentCredentials({
      TIANZHIAI_SECRET_DEEPSEEK: 'ephemeral-fixture-value',
      DEEPSEEK_API_KEY: 'must-not-be-read',
    }),
  })
  try {
    await ctx.plugin(HostCredentials)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(DeepSeek, {
      apiKeyEnv: 'deepseek',
      baseURL: server.url,
      models: [{ id: 'fixture-model' }],
    })
    expect(await ctx.credentials.resolve(credentialRef('DEEPSEEK_API_KEY'))).toBeUndefined()
    const request = {
      provider: 'deepseek-official',
      model: 'fixture-model',
      messages: [
        createUserMessage({ content: [{ type: 'text', text: '测试' }], source: { kind: 'user' } }),
      ],
    }
    const chunks = await Array.fromAsync(ctx.llm.stream(request))
    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true)
    expect(server.headers[0]?.['x-api-key']).toBe('ephemeral-fixture-value')
    expect(server.headers[0]?.['x-deepseek-harness-user-id']).toBeUndefined()
    delete ctx.tianzhiaiHost.settings.credentialReferences.deepseek
    expect(await Array.fromAsync(ctx.llm.stream(request))).toContainEqual({
      type: 'finish',
      reason: {
        kind: 'error',
        failure: expect.objectContaining({ code: 'MISSING_CREDENTIAL' }),
      },
    })
    expect(server.requests).toHaveLength(1)
    expect(JSON.stringify(await ctx.credentials.describe(credentialRef('deepseek')))).not.toContain(
      'ephemeral-fixture-value',
    )
  } finally {
    await ctx.fiber.dispose()
    await rm(home, { recursive: true, force: true })
  }
})
