/** TZ-063: original assembly and user-text registrations without the Composer/workspace shell. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { UiConversation } from './conversation/assembly.ts'
import { UserText, PlainUserText, SessionReference } from './user-text/UserText.tsx'
import { sessionReferenceRule } from './user-text/session-reference-rule.ts'
import { collapseWhitespaceRule, trimWhitespaceRule } from './user-text/whitespace-rules.ts'
import type { UserTextInjected } from './contract/slots.ts'
import { en, ja, es, fr, de, ru, pt, NS, zh } from './locales.ts'

/** The assembly owns all projection state; the product only selects a rendering surface. */
export function mountConversationCore(ctx: Context): void {
  const assembly = new UiConversation(ctx, ctx.sessions)
  assembly.userText.register(sessionReferenceRule)
  assembly.userText.register(collapseWhitespaceRule)
  assembly.userText.register(trimWhitespaceRule)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }))
  ctx.slots.registerFactory({
    name: 'conversation.user.text', scope: 'session',
    children: { 'conversation.user.text.node': { kind: 'keyed', scope: 'session', inline: true } },
    inject: (): UserTextInjected => ({
      hooks: { userTextRevision: {
        getSnapshot: () => assembly.userText.getSnapshot(),
        subscribe: listener => assembly.userText.subscribe(listener),
      } },
      createUserTextEvaluator: () => assembly.userText.createEvaluator(),
      reportTransformFailure: error => console.error('[ui-conversation] user-text transformation failed:', error),
    }),
  }, UserText)
  ctx.slots.inject('conversation.user.text.node', function* () {
    yield ctx.slots.register({ name: 'conversation.user.text.node', key: 'text', priority: 100 }, PlainUserText)
    yield ctx.slots.register({ name: 'conversation.user.text.node', key: 'session', priority: 100 }, SessionReference)
  })
  ctx.uiSession.provide({
    hooks: ['conversation'],
    resolve(binding) {
      const conversation = assembly.binding(binding)
      conversation.activate('chat')
      return { hooks: { conversation: conversation.snapshot } }
    },
  })
}
