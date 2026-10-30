import type { Context } from '@deepseek-ai/cordis'
import * as Renderer from '@deepseek-ai/dsh-client-ui-renderer/client'
import * as UiSession from '@deepseek-ai/dsh-client-ui-session/client'
import * as Access from '@deepseek-ai/dsh-api-remote-access/client'
import { LocaleRuntime, COMMON_NS, zh, en } from '@deepseek-ai/dsh-client-locale/client'
import Shortcuts from '@deepseek-ai/dsh-client-shortcuts/client'
import { permissionAccessIt, permissionSettingsIt } from './italian-permissions'
import { italianCommon } from './italian-common'
import { italianConversation } from './italian-conversation'
import { italianChatSettings, italianTheme } from './italian-settings'
import { italianChat } from './italian-chat'
import {
  italianApproval,
  italianQuestion,
  italianSidebar,
  italianSidebarRight,
} from './italian-shell'

/** Product composition over the original DSH services; no second Session owner. */
export async function mountUiFoundation(ctx: Context) {
  await ctx.plugin(Renderer)
  await ctx.plugin(Access)
  await ctx.plugin(UiSession)
  await ctx.plugin({
    inject: ['slots'],
    apply(scope: Context) {
      // Start in Chinese until the Host preference is accepted by the product runtime.
      const locale = new LocaleRuntime(scope, undefined, { languages: ['zh'], preference: 'zh' })
      scope.effect(() => locale.addLanguage({ id: 'it', label: 'Italiano', fallback: 'en' }))
      scope.effect(() => locale.register('settings.permission', 'it', permissionSettingsIt))
      scope.effect(() => locale.register('permission.access', 'it', permissionAccessIt))
      scope.effect(() => locale.register('conversation', 'it', italianConversation))
      scope.effect(() => locale.register('chat', 'it', { ...italianChat, ...italianChatSettings }))
      scope.effect(() => locale.register('settings.theme', 'it', italianTheme))
      scope.effect(() => locale.register('approval', 'it', italianApproval))
      scope.effect(() => locale.register('question', 'it', italianQuestion))
      scope.effect(() => locale.register('sidebar', 'it', italianSidebar))
      scope.effect(() => locale.register('sidebarRight', 'it', italianSidebarRight))
      const syncLanguage = () => {
        if (typeof document === 'undefined') return
        document.documentElement.lang =
          locale.getSnapshot().active === 'zh' ? 'zh-CN' : locale.getSnapshot().active
      }
      scope.effect(() => locale.subscribe(syncLanguage))
      syncLanguage()
      scope.effect(() =>
        locale.register(COMMON_NS, {
          zh: { ...zh, 'brand.localBuild': '天质 AI' },
          en: { ...en, 'brand.localBuild': '天质 AI' },
          it: italianCommon,
        }),
      )
      scope.provide('locale', locale)
      scope.slots.installLocale(locale)
    },
  })
  await ctx.plugin(Shortcuts)
}
