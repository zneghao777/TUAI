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
import { localizeHostError } from './host-errors'
import { italianWorkspace } from './italian-workspace'
import {
  italianDocumentPreview,
  italianCodePreview,
  italianExcel,
  italianHtml,
  italianImage,
  italianMarkdown,
  italianOffice,
  italianPdf,
  italianQuotes,
  italianExport,
  italianLayoutShortcuts,
} from './italian-preview'
import {
  italianCommand,
  italianFileDrag,
  italianGoal,
  italianSlashMenu,
  italianFeedback,
  italianModel,
  italianReference,
  italianSidebarFiles,
} from './italian-ui-extra'
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
      scope.effect(() => locale.register('command', 'it', italianCommand))
      scope.effect(() => locale.register('fileDrag', 'it', italianFileDrag))
      scope.effect(() => locale.register('goal', 'it', italianGoal))
      scope.effect(() => locale.register('slash.menu', 'it', italianSlashMenu))
      scope.effect(() => locale.register('feedback', 'it', italianFeedback))
      scope.effect(() => locale.register('model', 'it', italianModel))
      scope.effect(() => locale.register('reference', 'it', italianReference))
      scope.effect(() => locale.register('sidebarFiles', 'it', italianSidebarFiles))
      scope.effect(() => locale.register('workspace', 'it', italianWorkspace))
      scope.effect(() => locale.register('sidebarDocumentPreview', 'it', italianDocumentPreview))
      scope.effect(() => locale.register('sidebarCodePreview', 'it', italianCodePreview))
      scope.effect(() => locale.register('sidebarExcel', 'it', italianExcel))
      scope.effect(() => locale.register('documentHtml', 'it', italianHtml))
      scope.effect(() => locale.register('sidebarImage', 'it', italianImage))
      scope.effect(() => locale.register('documentMarkdown', 'it', italianMarkdown))
      scope.effect(() => locale.register('sidebarOffice', 'it', italianOffice))
      scope.effect(() => locale.register('sidebarPdf', 'it', italianPdf))
      scope.effect(() => locale.register('messageQuotes', 'it', italianQuotes))
      scope.effect(() => locale.register('session-log-download', 'it', italianExport))
      scope.effect(() => locale.register('shortcuts.layout', 'it', italianLayoutShortcuts))
      const syncLanguage = () => {
        if (typeof document === 'undefined') return
        document.documentElement.lang =
          locale.getSnapshot().active === 'zh' ? 'zh-CN' : locale.getSnapshot().active
      }
      scope.effect(() => locale.subscribe(syncLanguage))
      syncLanguage()
      scope.effect(() =>
        locale.register(COMMON_NS, {
          zh: { ...zh, 'brand.localBuild': 'TUAI' },
          en: { ...en, 'brand.localBuild': 'TUAI' },
          it: italianCommon,
        }),
      )
      scope.provide('locale', locale)
      scope.provide('formatRemoteError', (message) => {
        const active = locale.getSnapshot().active
        return localizeHostError(message, active === 'en' || active === 'it' ? active : 'zh')
      })
      scope.slots.installLocale(locale)
    },
  })
  await ctx.plugin(Shortcuts)
}
