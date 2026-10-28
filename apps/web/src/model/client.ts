import { migrateUiState } from './migrate-ui-state'
import * as Workspaces from '@deepseek-ai/dsh-api-workspace-controller/client'
import workspaceRemote from '@deepseek-ai/dsh-api-workspace-controller/remote'
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
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types'
import { createSnapshotStore, setPersistenceScope } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { mountUiFoundation } from './ui-foundation'
import { mountChatRuntime } from './chat-runtime'

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
  openSession: ((id: SessionId) => Promise<void>) | undefined
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
    await this.ctx.remote.$mount(workspaceRemote)
    await this.ctx.plugin(Workspaces)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Host 连接超时'))
      }, 20000)
      const ready = () => {
        if (this.connection.generation.getSnapshot()) {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const stop = this.connection.generation.subscribe(ready)
      ready()
    })
    await this.load()
    const host = this.facts.getSnapshot().host
    if (!host) throw new Error(this.facts.getSnapshot().error ?? 'Host 身份尚未就绪')
    setPersistenceScope(`tianzhiai:${host.id}`)
    migrateUiState(host.id, this.ctx.sessions.list.getSnapshot().ids)
    await mountUiFoundation(this.ctx)
    await mountChatRuntime(this.ctx, {
      showUsage: false,
      openSession: (id) => this.ctx.uiWorkspace.openSession(id),
      openFile: async (id, path) => {
        const cwd = this.ctx.sessions.list.getSnapshot().byId[id]?.cwd
        const { fileAddressFor } = await import('@deepseek-ai/dsh-util-workspace-path')
        this.ctx.sidebarRight.openResource(fileAddressFor(id, cwd, path))
      },
    })
    this.ctx.effect(() =>
      this.connection.generation.subscribe(() => {
        void this.load()
      }),
    )
    this.ctx.effect(() => {
      const refresh = () => {
        void this.load()
      }
      window.addEventListener('focus', refresh)
      return () => window.removeEventListener('focus', refresh)
    })
    await this.load()
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
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message
  return typeof error === 'string' ? error : '操作未完成，请重试'
}
export function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!result.ok) throw new Error(`${result.error.code}：${result.error.message}`)
  return result.value
}
