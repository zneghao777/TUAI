import * as Compact from '@deepseek-ai/dsh-command-compact'
import * as GoalCommand from '@deepseek-ai/dsh-command-goal'
import * as Export from '@deepseek-ai/dsh-session-log-export'
import * as Feedback from '@deepseek-ai/dsh-command-feedback'
import MessageFeedback from '@deepseek-ai/dsh-message-feedback'
import { TYPERT as contribution15 } from '@deepseek-ai/dsh-goal/typert'
import { TYPERT as contribution16 } from '@deepseek-ai/dsh-command-feedback/typert'
import { TYPERT as contribution17 } from '@deepseek-ai/dsh-message-feedback/typert'
import WorkspaceFiles from '@deepseek-ai/dsh-api-workspace-files'
import SessionReferences from '@deepseek-ai/dsh-session-reference'
import { TYPERT as contribution12 } from '@deepseek-ai/dsh-api-workspace-files/typert'
import { TYPERT as contribution14 } from '@deepseek-ai/dsh-session-reference/typert'
import { ManagedSessionController, ManagedWorkspaceController } from './managed-workspaces.ts'
import { ConversationTrash } from './conversation-trash.ts'
import { FileLibraryDeletions } from './file-library-deletions.ts'
import { TYPERT as contribution11 } from '@deepseek-ai/dsh-api-workspace-controller/typert'
import { mountChatSettings } from './chat-settings.ts'
import { TYPERT as contribution10 } from '@deepseek-ai/dsh-api-settings-controller/typert'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { TYPERT as contribution0 } from '@deepseek-ai/dsh-api-session-controller/typert'
import { TYPERT as contribution1 } from '@deepseek-ai/dsh-api-remote-access/typert'
import { TYPERT as contribution2 } from '@deepseek-ai/dsh-commands/typert'
import { TYPERT as contribution3 } from '@deepseek-ai/dsh-client-file-upload/typert'
import { TYPERT as contribution4 } from '@deepseek-ai/dsh-permission-presets/typert'
import { TYPERT as contribution5 } from '@deepseek-ai/dsh-user-questions/typert'
import { TYPERT as contribution6 } from '@deepseek-ai/dsh-llm/typert'
import { TYPERT as contribution7 } from '@deepseek-ai/dsh-agent-preset-registry/typert'
import { TYPERT as contribution8 } from '@deepseek-ai/dsh-subagent/typert'
import { TYPERT as contribution9 } from '@tianzhiai/web-host/typert'
import { Context } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import Registry from '@deepseek-ai/dsh-typert-registry'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Access from '@deepseek-ai/dsh-api-remote-access'
import * as Remotes from '@deepseek-ai/dsh-api-remotes'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as Static from '@deepseek-ai/dsh-host-frontend-static'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import Workspace from '@deepseek-ai/dsh-workspace'
import Query from '@deepseek-ai/dsh-session-query-sqlite'
import Titles from '@deepseek-ai/dsh-session-title'
import ProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import Commands from '@deepseek-ai/dsh-commands'
import Uploads from '@deepseek-ai/dsh-client-file-upload'
import type {} from '@tianzhiai/agent-runtime'

import { entries, download } from './artifacts.ts'
import { deleteVerifiedFile, verifiedFileCandidates } from './file-candidates.ts'
import { userImageAttachments } from './user-image-attachments.ts'
import { basename, relative } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  ArtifactInfo,
  LibraryFile,
  HostStatus,
  ModelProvidersState,
  SaveModelProvider,
  RemoveModelProvider,
  ModelConnectionTest,
  ModelConnectionResult,
} from './types.ts'
declare module '@deepseek-ai/cordis' {
  interface Context {
    tianzhiaiPlatform: PlatformService
  }
}

/** Product public status; every call passes the same Gateway admission. */
export class PlatformService extends TypertRemoteService {
  static inject = [
    'tianzhiaiHost',
    'credentials',
    'sessionQuery',
    'attachments',
    'modelManager',
    'conversationTrash',
    'fileLibraryDeletions',
  ]
  constructor(ctx: Context) {
    super(ctx, 'tianzhiaiPlatform', { namespace: 'platform' })
  }
  @Remote
  modelProviders(): Promise<ModelProvidersState> {
    return this.ctx.modelManager.snapshot()
  }
  @Remote
  saveModelProvider(request: SaveModelProvider): Promise<ModelProvidersState> {
    return this.ctx.modelManager.save(request)
  }
  @Remote
  removeModelProvider(request: RemoveModelProvider): Promise<ModelProvidersState> {
    return this.ctx.modelManager.remove(request)
  }
  @Remote
  testModelProvider(request: ModelConnectionTest): Promise<ModelConnectionResult> {
    return this.ctx.modelManager.test(request)
  }
  /** List durable references and session-scoped tool output files. */
  @Remote
  async artifacts(sessionId: SessionId): Promise<ArtifactInfo[]> {
    return (await entries(this.ctx, sessionId)).map((entry) => entry.info)
  }
  /** List traceable workspace outputs and images sent in user messages. */
  @Remote
  async libraryFiles(signal: AbortSignal): Promise<LibraryFile[]> {
    const sessions = await this.ctx.sessionQuery.listSessions(signal)
    const items: LibraryFile[] = []
    const seen = new Set<string>()
    for (const { header } of sessions) {
      signal.throwIfAborted()
      if (this.ctx.conversationTrash.has(header.id)) continue
      using observation = await this.ctx.sessionQuery.observeSession(header.id, {
        projectionMode: 'none',
        signal,
      })
      for (const image of userImageAttachments(observation.events)) {
        const path = `attachment:${image.id}`
        const deletionKey = JSON.stringify(['attachment', header.id, image.id])
        if (this.ctx.fileLibraryDeletions.has(deletionKey, image.id)) continue
        items.push({
          sessionId: header.id,
          source: 'attachment',
          path,
          artifactId: image.id,
          name: image.name,
          kind: 'image',
          bytes: image.bytes,
          createdAt: image.createdAt,
          version: image.id,
        })
      }
      if (!header.cwd) continue
      const files = await verifiedFileCandidates(observation.events, header.cwd)
      for (const file of files) {
        if (this.ctx.fileLibraryDeletions.has(file.path, file.sourceId)) continue
        if (seen.has(file.path)) continue
        seen.add(file.path)
        items.push({
          sessionId: header.id,
          source: 'workspace',
          path: relative(header.cwd, file.path),
          name: basename(file.path),
          kind: file.kind,
          bytes: file.bytes,
          createdAt: file.createdAt,
          version: file.version,
        })
      }
    }
    return items
  }
  /** Remove an attachment from the library or delete a verified workspace output. */
  @Remote
  async deleteLibraryFile(request: {
    sessionId: SessionId
    source: 'workspace' | 'attachment'
    path: string
    version: string
  }): Promise<void> {
    if (this.ctx.conversationTrash.has(request.sessionId)) throw new Error('会话已删除')
    const sessions = await this.ctx.sessionQuery.listSessions()
    const header = sessions.find((entry) => entry.header.id === request.sessionId)?.header
    if (!header) throw new Error('会话不可用')
    using observation = await this.ctx.sessionQuery.observeSession(header.id, {
      projectionMode: 'none',
    })
    if (request.source === 'attachment') {
      const image = userImageAttachments(observation.events).find(
        (item) => `attachment:${item.id}` === request.path && item.id === request.version,
      )
      if (!image) throw new Error('图片不存在或不属于此会话')
      const deletionKey = JSON.stringify(['attachment', header.id, image.id])
      if (this.ctx.fileLibraryDeletions.has(deletionKey, image.id)) throw new Error('图片已移除')
      await this.ctx.fileLibraryDeletions.add(deletionKey, image.id)
      return
    }
    if (request.source !== 'workspace' || !header.cwd) throw new Error('会话工作区不可用')
    const files = await verifiedFileCandidates(observation.events, header.cwd)
    const candidate = files.find((file) => relative(header.cwd!, file.path) === request.path)
    if (!candidate) throw new Error('文件不存在或没有可验证的会话来源')
    if (this.ctx.fileLibraryDeletions.has(candidate.path, candidate.sourceId))
      throw new Error('文件已删除')
    await deleteVerifiedFile(candidate, header.cwd, request.version)
    try {
      await this.ctx.fileLibraryDeletions.add(candidate.path, candidate.sourceId)
    } catch (error) {
      throw new Error('原文件已删除，但删除记录保存失败；请刷新核对，不要重复删除', {
        cause: error,
      })
    }
  }
  /** Return public Host facts, never model credentials. */
  @Remote
  async hostStatus(): Promise<HostStatus> {
    return {
      id: this.ctx.tianzhiaiHost.settings.hostId,
      protocolVersion: 1,
      os: process.platform,
      workspace: process.cwd(),
      modelConfigured: (await this.ctx.modelManager.snapshot()).providers.some((p) => p.configured),
    }
  }

  /** Remove a conversation from product access while retaining its workspace files. */
  @Remote
  async deleteConversation(request: { id: SessionId }): Promise<void> {
    await this.ctx.conversationTrash.delete(request.id)
  }
}

/** Explicit startup inputs; fixture models are registered by test launchers only. */
export interface WebHostOptions {
  port: number
  host?: string
  trustedHosts?: string[]
  distIndex: string
  provider?: string
  model?: string
}

export const REMOTE_PACKAGES = [
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-remote-access',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-client-file-upload',
  '@deepseek-ai/dsh-permission-presets',
  '@deepseek-ai/dsh-user-questions',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-agent-preset-registry',
  '@deepseek-ai/dsh-subagent',
  '@tianzhiai/web-host',
  '@deepseek-ai/dsh-api-settings-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-api-workspace-files',
  '@deepseek-ai/dsh-session-reference',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-command-feedback',
  '@deepseek-ai/dsh-message-feedback',
]

/** Mount the real transport and Session owners over the existing P1 runtime. */
export async function mountWebHost(ctx: Context, options: WebHostOptions) {
  await ctx.plugin(Registry)
  await ctx.plugin(Connection, { trustedHosts: options.trustedHosts ?? [] })
  await ctx.plugin(Access)
  await ctx.plugin(Gateway)
  await ctx.plugin(Commands)
  await ctx.plugin(Compact)
  await ctx.plugin(GoalCommand)
  await ctx.plugin(Export)
  await ctx.plugin(Feedback)
  await ctx.plugin(MessageFeedback, { maxNoteBytes: 16384 })
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: join(ctx.tianzhiaiHost.paths.data, 'workspace-index') })
  await ctx.plugin(Domain, { backend: 'json' })
  await ctx.plugin(Workspace)
  await ctx.plugin(Query, { path: join(ctx.tianzhiaiHost.paths.cache, 'session-search.sqlite3') })
  await ctx.plugin(Titles, { fallbackMaxWords: 10, fallbackMaxBytes: 80, maxTitleBytes: 256 })
  await ctx.plugin(ProjectionCache, { writeEveryEvents: 128, writeIntervalMs: 1000 })
  await ctx.plugin(DefaultModel, {
    provider: options.provider ?? 'deepseek-official',
    model: options.model ?? 'deepseek-flash',
  })
  await ctx.plugin(WorkspaceFiles)
  await ctx.plugin(SessionReferences)
  await ctx.plugin(Uploads)
  await ctx.plugin(ConversationTrash)
  await ctx.plugin(FileLibraryDeletions)
  ctx.inject(['typertGateway', 'conversationTrash'], (scope) => {
    scope.effect(() =>
      scope.typertGateway.guard(({ args }) => {
        const inspect = (value: unknown): void => {
          if (typeof value !== 'object' || value === null) return
          const record = value as Record<string, unknown>
          for (const key of ['sessionId', 'childSessionId', 'parentSessionId']) {
            const id = record[key]
            if (typeof id === 'string' && scope.conversationTrash.has(id as SessionId))
              throw new RemoteError('session/not-found', '该会话已删除', {
                sessionId: id as SessionId,
              })
          }
          if (record.address !== undefined) inspect(record.address)
        }
        inspect(args)
        for (const value of Object.values(args)) inspect(value)
      }),
    )
  })
  await ctx.plugin(ManagedWorkspaceController)
  await ctx.plugin(ManagedSessionController)
  await ctx.plugin(PlatformService)
  await mountChatSettings(ctx)
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: '/api/artifact',
      methods: ['GET', 'HEAD'],
      requestBody: 'buffered',
      fetch: (request) => download(ctx, request),
    }),
  )
  for (const [index, contribution] of [
    contribution0,
    contribution1,
    contribution2,
    contribution3,
    contribution4,
    contribution5,
    contribution6,
    contribution7,
    contribution8,
    contribution9,
    contribution10,
    contribution11,
    contribution12,
    contribution14,
    contribution15,
    contribution16,
    contribution17,
  ].entries())
    ctx.effect(() =>
      ctx.typert.register(validateTypertManifest(REMOTE_PACKAGES[index]!, contribution)),
    )
  await ctx.plugin(Remotes)
  await ctx.plugin(WebServer, { host: options.host ?? '127.0.0.1', port: options.port })
  await ctx.plugin(Static, { distIndex: options.distIndex })
  return ctx.webServer
}
