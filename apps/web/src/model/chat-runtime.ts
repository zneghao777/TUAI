import type { Context } from '@deepseek-ai/cordis'
import { mountConversationCore } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { mountChat, type ChatHostActions } from '@deepseek-ai/dsh-client-ui-chat/client'
import * as Tool from '@deepseek-ai/dsh-client-ui-tool/client'
import * as FileDrag from '@deepseek-ai/dsh-client-ui-file-drag/client'
import * as Attachments from '@deepseek-ai/dsh-client-ui-attachment/client'
import * as Settings from '@deepseek-ai/dsh-client-ui-settings/client'
import settingsRemote from '@deepseek-ai/dsh-api-settings-controller/remote'
import { installIconSprite } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Original DSH presentation, bound to the existing product Session owner. */
export async function mountChatRuntime(ctx: Context, actions: ChatHostActions) {
  await ctx.remote.$mount(settingsRemote)
  await ctx.plugin(Settings)
  await ctx.plugin(FileDrag)
  await ctx.plugin({
    name: 'tianzhiai-conversation',
    inject: ['sessions', 'uiSession', 'slots', 'locale', 'configForms', 'fileDrag'],
    apply(scope: Context) {
      installIconSprite(scope, undefined)
      mountConversationCore(scope)
      mountChat(scope, actions)
    },
  })
  await ctx.plugin(Tool)
  await ctx.plugin(Attachments)
}
