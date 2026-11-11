import { brandString } from '@deepseek-ai/dsh-brand'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { rankByName } from '@deepseek-ai/dsh-client-ui-primitives'
import { unwrap, type AppClient } from './client'

export const SKILLS_PANEL = brandString<MainPanelId>('tianzhiai-skills')

/** Candidate requests are cancellable and always reflect the current Host catalog. */
export function mountSkillInput(client: AppClient): () => void {
  const { ctx } = client
  return ctx.inputTriggers.registerSource({
    name: 'skill',
    trigger: '/',
    order: 2,
    async candidates(session, { query, signal }) {
      const result = unwrap(await ctx.remote.skills.list({ sessionId: session.sessionId }, signal))
      return rankByName(result.skills, query).map((skill) => ({
        name: skill.name,
        description: skill.description,
      }))
    },
    onPick({ candidate }) {
      return { text: `/${candidate.name} ` }
    },
  } satisfies InputTriggerSource)
}

/** Start a fresh draft, preserving every existing conversation's draft and attachments. */
export async function useSkill(client: AppClient, name: string): Promise<void> {
  await client.ctx.uiWorkspace.startManagedSession((id) => {
    const binding = client.ctx.sessions.binding(id)
    if (!binding) throw new Error('会话尚未就绪，请重试')
    client.ctx.conversation.input.for(binding.ctx).setDraft(`/${name} `)
  })
}
