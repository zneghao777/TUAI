import { Context, Service } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  assertUsableApiKey,
  LlmError,
  resolveImageAttachmentAccess,
  type AdapterRegistrationHandle,
} from '@deepseek-ai/dsh-llm'
import {
  DeepSeekAdapter,
  resolveAdapterOptions,
  catalogModelInfo,
  PUBLIC_BASE_URL,
} from '@deepseek-ai/dsh-llm-deepseek'
import type {
  ModelConnectionResult,
  ModelConnectionTest,
  ModelProviderDraft,
  ModelProvidersState,
  RemoveModelProvider,
  SaveModelProvider,
} from './model-types.ts'

const modelSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(200).regex(/^\S+$/),
    name: z.string().trim().min(1).max(100),
    contextWindow: z.number().int().positive().max(10_000_000).optional(),
    maxTokens: z.number().int().positive().max(1_000_000).optional(),
  })
  .transform((model) => ({
    id: model.id,
    name: model.name,
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
  }))
const providerSchema = z
  .strictObject({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
      .max(64),
    name: z.string().trim().min(1).max(100),
    baseURL: z.string().max(2048),
    models: z.array(modelSchema).min(1).max(100),
  })
  .refine((p) => new Set(p.models.map((m) => m.id)).size === p.models.length, '模型 ID 不能重复')
const documentSchema = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  providers: z.array(providerSchema).max(32),
})
const revisionSchema = z.number().int().nonnegative()
const official: ModelProviderDraft = {
  id: 'deepseek-official',
  name: 'DeepSeek',
  baseURL: PUBLIC_BASE_URL,
  models: resolveAdapterOptions({ baseURL: PUBLIC_BASE_URL }).models.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
  })),
}
function validated<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error('模型配置不合法，请检查名称、地址和模型列表')
  return result.data
}
function providerOf(value: unknown): ModelProviderDraft {
  const provider = validated(providerSchema, value)
  let url: URL
  try {
    url = new URL(provider.baseURL)
  } catch {
    throw new Error('请填写有效的 API 地址')
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new Error('API 地址须使用 HTTPS；本机服务可使用 HTTP，地址不能包含凭据或查询参数')
  provider.baseURL = url.href.replace(/\/+$/, '')
  if (provider.id === official.id) {
    if (provider.baseURL !== PUBLIC_BASE_URL)
      throw new Error('DeepSeek 官方地址不能修改，请添加独立提供商')
    return structuredClone(official)
  }
  return provider
}
function keyRef(provider: ModelProviderDraft) {
  return credentialRef(
    provider.id === official.id
      ? 'deepseek'
      : `model_${createHash('sha256').update(`${provider.id}\0${provider.baseURL}`).digest('hex').slice(0, 32)}`,
  )
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelManager: ModelManager
  }
}

/** Product configuration ownership; all inference still uses the migrated DSH adapter. */
export class ModelManager extends Service {
  static inject = ['tianzhiaiHost', 'credentials', 'llm']
  private registrations = new Map<string, AdapterRegistrationHandle>()
  private readonly path: string
  constructor(ctx: Context) {
    super(ctx, 'modelManager')
    this.path = join(ctx.tianzhiaiHost.paths.config, 'model-providers.json')
  }
  private async read() {
    try {
      return validated(documentSchema, JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return { version: 1 as const, revision: 0, providers: [] as ModelProviderDraft[] }
      throw new Error('模型配置文件无法读取，请恢复有效配置')
    }
  }
  async [Service.init](): Promise<void> {
    const doc = await this.read()
    const ids = new Set<string>()
    for (const value of doc.providers) {
      const provider = providerOf(value)
      if (provider.id === official.id || ids.has(provider.id)) throw new Error('模型提供商标识冲突')
      ids.add(provider.id)
      this.register(provider)
    }
  }
  private register(provider: ModelProviderDraft) {
    const connection = resolveAdapterOptions({
      baseURL: provider.baseURL,
      models: provider.models,
      streamIdleTimeoutMs: 60000,
    })
    const ref = keyRef(provider)
    const adapter = new DeepSeekAdapter({
      providerName: provider.name,
      options: () => connection,
      prepareExtensions: (request) =>
        this.ctx.get('deepseekLlmApiExtensions')?.prepare(request) ??
        Promise.resolve({ fields: {}, accept: () => Promise.resolve() }),
      resolveAttachments: () => this.ctx.get('attachments'),
      resolveImageAccess: (attachments, image) =>
        resolveImageAttachmentAccess(
          attachments,
          (path) => this.ctx.get('fs')?.processPathFromHostPath(path),
          image,
        ),
      resolveAuth: async () => {
        const value = await this.ctx.credentials.resolve(ref)
        if (!value) throw new LlmError('请在模型管理中配置 API Key', 'MISSING_CREDENTIAL')
        return { headers: { 'x-api-key': assertUsableApiKey(value.value, 'model-manager', ref) } }
      },
      discoverModels: async (id) =>
        (await this.ctx.credentials.describe(ref)).configured
          ? connection.models.map((model) => catalogModelInfo(id, model))
          : [],
    })
    this.registrations.get(provider.id)?.()
    this.registrations.set(provider.id, this.ctx.llm.registerAdapter([provider.id], adapter))
  }
  async snapshot(): Promise<ModelProvidersState> {
    const doc = await this.read()
    return {
      revision: doc.revision,
      providers: await Promise.all(
        [official, ...doc.providers].map(async (p) => {
          const info = await this.ctx.credentials.describe(keyRef(p))
          return {
            ...p,
            builtin: p.id === official.id,
            configured: info.configured,
            ...(info.source ? { credentialSource: info.source } : {}),
          }
        }),
      ),
    }
  }
  async save(request: SaveModelProvider): Promise<ModelProvidersState> {
    const revision = validated(revisionSchema, request.revision)
    const provider = providerOf(request.provider)
    const key =
      request.apiKey === undefined
        ? undefined
        : assertUsableApiKey(request.apiKey, 'model-manager', 'API_KEY')
    await withFileLock(this.path, async () => {
      const doc = await this.read()
      if (doc.revision !== revision)
        throw new Error('配置已被其他窗口修改，请重新打开模型管理后再保存')
      const previous = doc.providers.find((p) => p.id === provider.id)
      if (
        !previous &&
        provider.id !== official.id &&
        this.ctx.llm.listProviders().some((p) => p.id === provider.id)
      )
        throw new Error('提供商标识已被占用')
      if (previous && previous.baseURL !== provider.baseURL && !key)
        throw new Error('修改 API 地址时请重新填写密钥')
      if (!key && !(await this.ctx.credentials.describe(keyRef(provider))).configured)
        throw new Error('请填写 API Key')
      if (!previous && provider.id !== official.id && doc.providers.length >= 32)
        throw new Error('最多添加 32 个模型提供商')
      // Credential first: a failed profile write may leave an unused encrypted key, never an advertised unusable route.
      if (key) await this.ctx.credentials.set(keyRef(provider), key)
      const providers =
        provider.id === official.id
          ? doc.providers
          : [...doc.providers.filter((p) => p.id !== provider.id), provider]
      await writeFileAtomic(
        this.path,
        JSON.stringify({ ...doc, revision: doc.revision + 1, providers }, null, 2),
        { mode: 0o600 },
      )
      if (provider.id !== official.id) this.register(provider)
      if (previous && previous.baseURL !== provider.baseURL)
        await this.ctx.credentials.unset(keyRef(previous))
    })
    return this.snapshot()
  }
  async remove(request: RemoveModelProvider): Promise<ModelProvidersState> {
    const revision = validated(revisionSchema, request.revision)
    await withFileLock(this.path, async () => {
      const doc = await this.read()
      if (doc.revision !== revision)
        throw new Error('配置已被其他窗口修改，请重新打开模型管理后再保存')
      const provider =
        request.id === official.id ? official : doc.providers.find((p) => p.id === request.id)
      if (!provider) throw new Error('提供商不存在')
      if (
        provider.id === official.id &&
        this.ctx.tianzhiaiHost.settings.credentialReferences.deepseek
      )
        throw new Error('此提供商仍有 Host 环境引用，请先在 Host 配置中移除引用')
      await this.ctx.credentials.unset(keyRef(provider))
      await writeFileAtomic(
        this.path,
        JSON.stringify(
          {
            ...doc,
            revision: doc.revision + 1,
            providers: doc.providers.filter((p) => p.id !== provider.id),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      )
      this.registrations.get(provider.id)?.()
      this.registrations.delete(provider.id)
    })
    return this.snapshot()
  }
  async test(request: ModelConnectionTest): Promise<ModelConnectionResult> {
    const start = performance.now()
    const provider = providerOf(request.provider)
    const key = request.apiKey
      ? assertUsableApiKey(request.apiKey, 'model-manager', 'API_KEY')
      : (await this.ctx.credentials.resolve(keyRef(provider)))?.value
    if (!key) throw new Error('请填写 API Key')
    try {
      // A bounded, non-streaming request verifies both the chosen model and actual inference access.
      const base = provider.baseURL.replace(/\/v1$/, '')
      const response = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.models[0]!.id,
          max_tokens: 32,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: 'Reply OK.' }],
        }),
      })
      const latencyMs = Math.round(performance.now() - start)
      if (!response.ok) {
        await response.body?.cancel()
        return {
          ok: false,
          latencyMs,
          message:
            response.status === 401
              ? '认证失败，请检查 API Key'
              : response.status === 402
                ? '账户余额不足'
                : `模型请求失败（HTTP ${response.status}）`,
        }
      }
      const raw: unknown = await response.json()
      const valid =
        typeof raw === 'object' &&
        raw !== null &&
        'content' in raw &&
        Array.isArray(raw.content) &&
        raw.content.some(
          (b) =>
            b &&
            typeof b === 'object' &&
            b.type === 'text' &&
            typeof b.text === 'string' &&
            b.text.length > 0,
        )
      return {
        ok: valid,
        latencyMs,
        message: valid
          ? '连接成功，模型已回复'
          : '接口响应不是有效的 Messages 回复，请检查协议和地址',
      }
    } catch {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - start),
        message: '连接失败或超时，请检查 API 地址与网络',
      }
    }
  }
}
