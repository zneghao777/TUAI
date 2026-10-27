import { createRemotePlatform, parseClientConfig, type PlatformAdapter } from '@tianzhiai/platform'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-permission-presets/remote'
import { Context } from '@deepseek-ai/cordis'
import {
  apply as connectionPlugin,
  type ConnectionHandle,
} from '@deepseek-ai/dsh-client-connection/client'
import * as Registry from '@deepseek-ai/dsh-typert-registry/client'
import * as Gateway from '@deepseek-ai/dsh-api-gateway/client'
import * as Remotes from '@deepseek-ai/dsh-api-remotes/client'
import * as Uploads from '@deepseek-ai/dsh-client-file-upload/client'
import * as Sessions from '@deepseek-ai/dsh-api-session-controller/client'
import platform from '@tianzhiai/web-host/remote'
import type { HostStatus } from '@tianzhiai/web-host/types'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PermissionCatalog } from '@deepseek-ai/dsh-permission-presets/types'
import type { TypertClientEventListener } from '@deepseek-ai/dsh-typert-protocol'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface Interaction {
  id: string
  sessionId: SessionId
  kind: 'approval' | 'question'
  title: string
  detail?: string
  questions?: AskUserQuestionItem[]
  state: 'pending' | 'submitting' | 'expired'
  answer(value: ApprovalOutcome | AskUserQuestionAnswer): void
}
export class AppClient {
  readonly ctx = new Context()
  readonly facts = createSnapshotStore<{
    host?: HostStatus
    catalog?: ModelCatalog
    permissions?: PermissionCatalog
    error?: string
  }>({})
  readonly interactions = createSnapshotStore<readonly Interaction[]>([])
  connection!: ConnectionHandle
  platform?: PlatformAdapter
  private loadVersion = 0
  async start() {
    connectionPlugin(this.ctx)
    this.connection = this.ctx.get('connection') as ConnectionHandle
    await this.ctx.plugin(Registry)
    await this.ctx.plugin(Gateway)
    await this.ctx.plugin(Remotes)
    await this.ctx.remote.$mount(platform)
    await this.ctx.plugin(Uploads)
    await this.ctx.plugin(Sessions)
    await new Promise<void>((resolve, reject) => {
      const signal = AbortSignal.timeout(20000)
      const fail = () => reject(new Error('Host 会话服务尚未就绪，请检查认证与连接'))
      signal.addEventListener('abort', fail, { once: true })
      this.ctx.inject(['sessions'], () => {
        signal.removeEventListener('abort', fail)
        resolve()
      })
    })
    const root = this
    this.ctx.remote.$on('approval/request', function (request, next) {
      const id = root.ctx.sessions.scopeOf(this)
      if (!id) return next()
      return root.wait<Awaited<ReturnType<TypertClientEventListener<'approval/request'>>>>(
        id,
        'approval',
        request.toolName,
        request.reason,
        undefined,
        request.signal,
      )
    })
    this.ctx.remote.$on('user-questions/request', function (request, next) {
      const id = root.ctx.sessions.scopeOf(this)
      if (!id) return next()
      return root.wait<AskUserQuestionAnswer>(
        id,
        'question',
        '需要你补充信息',
        undefined,
        request.questions,
        request.signal,
      )
    })
    this.ctx.effect(() =>
      this.connection.generation.subscribe(() => {
        void this.load()
      }),
    )
    await this.load()
  }
  private wait<T extends ApprovalOutcome | AskUserQuestionAnswer>(
    sessionId: SessionId,
    kind: Interaction['kind'],
    title: string,
    detail: string | undefined,
    questions: AskUserQuestionItem[] | undefined,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID()
      const remove = () =>
        this.interactions.set(this.interactions.getSnapshot().filter((i) => i.id !== id))
      const expire = () => {
        remove()
        reject(signal?.reason ?? new Error('请求已失效'))
      }
      const item: Interaction = {
        id,
        sessionId,
        kind,
        title,
        detail,
        questions,
        state: 'pending',
        answer: (value) => {
          if (
            signal?.aborted ||
            !this.interactions.getSnapshot().some((i) => i.id === id && i.state === 'pending')
          )
            return
          if (
            (kind === 'approval' && typeof value !== 'string') ||
            (kind === 'question' && typeof value === 'string')
          )
            throw new Error('回答类型不匹配')
          signal?.removeEventListener('abort', expire)
          remove()
          // The generic is selected solely by the typed Remote event listener above.
          resolve(value as T)
        },
      }
      if (signal?.aborted) {
        expire()
        return
      }
      this.interactions.set([...this.interactions.getSnapshot(), item])
      signal?.addEventListener('abort', expire, { once: true })
    })
  }
  async load() {
    if (!this.connection.generation.getSnapshot()) return
    const version = ++this.loadVersion
    try {
      const [host, catalog, permissions] = await Promise.all([
        this.ctx.remote.platform.hostStatus(),
        this.ctx.remote.session.modelCatalog(),
        this.ctx.remote.permissionPresets.catalog(),
      ])
      if (version !== this.loadVersion) return
      if (!host.ok) throw new Error(host.error.message)
      if (host.value.protocolVersion !== 1) throw new Error('Host 协议版本不兼容，请更新后重新连接')
      if (!catalog.ok) throw new Error(catalog.error.message)
      if (!permissions.ok) throw new Error(permissions.error.message)
      const identity = parseClientConfig({
        id: host.value.id,
        os: host.value.os,
        executionLocation: 'remote',
      })
      if (!identity.available) throw new Error(identity.message)
      this.platform = createRemotePlatform(identity.value)
      await this.ctx.sessions.refresh()
      if (version === this.loadVersion)
        this.facts.set({ host: host.value, catalog: catalog.value, permissions: permissions.value })
    } catch (error) {
      if (version === this.loadVersion)
        this.facts.set({ ...this.facts.getSnapshot(), error: describe(error) })
    }
  }
  async dispose() {
    this.loadVersion++
    await this.ctx.fiber.dispose()
  }
}
export function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
export function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!result.ok) throw new Error(`${result.error.code}：${result.error.message}`)
  return result.value
}
