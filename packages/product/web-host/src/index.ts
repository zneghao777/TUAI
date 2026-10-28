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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
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
import SessionController from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@tianzhiai/agent-runtime'

import { entries, download } from './artifacts.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  ArtifactInfo,
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
  static inject = ['tianzhiaiHost', 'credentials', 'sessionQuery', 'attachments', 'modelManager']
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
]

/** Mount the real transport and Session owners over the existing P1 runtime. */
export async function mountWebHost(ctx: Context, options: WebHostOptions) {
  await ctx.plugin(Registry)
  await ctx.plugin(Connection, { trustedHosts: options.trustedHosts ?? [] })
  await ctx.plugin(Access)
  await ctx.plugin(Gateway)
  await ctx.plugin(Commands)
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
  await ctx.plugin(Uploads)
  await ctx.plugin(SessionController, { nativeOpen: false })
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
  ].entries())
    ctx.effect(() =>
      ctx.typert.register(validateTypertManifest(REMOTE_PACKAGES[index]!, contribution)),
    )
  await ctx.plugin(Remotes)
  await ctx.plugin(WebServer, { host: options.host ?? '127.0.0.1', port: options.port })
  await ctx.plugin(Static, { distIndex: options.distIndex })
  return ctx.webServer
}
