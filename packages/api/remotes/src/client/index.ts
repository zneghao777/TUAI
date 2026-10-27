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
