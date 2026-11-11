/** P2 assembly adapted from the locked DSH baseline; no account, telemetry or P3+ capabilities. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
export type { ApiRemoteForwardedEvent } from '../types.ts'
import commands from '@deepseek-ai/dsh-commands/remote'
import questions from '@deepseek-ai/dsh-user-questions/remote'
import permissions from '@deepseek-ai/dsh-permission-presets/remote'
import uploads from '@deepseek-ai/dsh-client-file-upload/remote'
import session from '@deepseek-ai/dsh-api-session-controller/remote'
import subagents from '@deepseek-ai/dsh-subagent/remote'
import llm from '@deepseek-ai/dsh-llm/remote'
import presets from '@deepseek-ai/dsh-agent-preset-registry/remote'
export const inject = ['remote']
export async function apply(ctx: Context) {
 const disposers: Array<() => Promise<void>> = []
 try {
  for (const contribution of [commands, questions, permissions, uploads, session, subagents, llm, presets]) disposers.push(await ctx.remote.$mount(contribution))
 } catch (error) {
  for (const dispose of disposers.reverse()) await dispose()
  throw error
 }
 return async () => { for (const dispose of disposers.reverse()) await dispose() }
}

// Generated type faces are public even when their optional runtime is not mounted.
export type {} from '@deepseek-ai/dsh-commands/remote'
export type {} from '@deepseek-ai/dsh-user-questions/remote'
export type {} from '@deepseek-ai/dsh-permission-presets/remote'
export type {} from '@deepseek-ai/dsh-client-file-upload/remote'
export type {} from '@deepseek-ai/dsh-api-session-controller/remote'
export type {} from '@deepseek-ai/dsh-subagent/remote'
export type {} from '@deepseek-ai/dsh-llm/remote'
export type {} from '@deepseek-ai/dsh-agent-preset-registry/remote'
export type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
export type {} from '@deepseek-ai/dsh-api-workspace-controller/remote'
export type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
export type {} from '@deepseek-ai/dsh-office-to-pdf/remote'
export type {} from '@deepseek-ai/dsh-user-approval/types'
export type { ClientRemote, RemoteHostFacts } from '@deepseek-ai/dsh-api-gateway/client'
export type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
export type * from '@deepseek-ai/dsh-api-workspace-controller/types'

export type { SessionId, MessageId, ContentBlock } from '@deepseek-ai/dsh-client-connection/client'
export type * from '@deepseek-ai/dsh-api-session-controller/types'
export type { SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-settings/types'
export type {} from '@deepseek-ai/dsh-session-reference/remote'
export type {} from '@deepseek-ai/dsh-goal/remote'
export type {} from '@deepseek-ai/dsh-message-feedback/remote'
export type {} from '@deepseek-ai/dsh-command-feedback/remote'
