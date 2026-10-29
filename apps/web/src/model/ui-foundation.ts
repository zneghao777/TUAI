import type { Context } from '@deepseek-ai/cordis'
import * as Renderer from '@deepseek-ai/dsh-client-ui-renderer/client'
import * as UiSession from '@deepseek-ai/dsh-client-ui-session/client'
import * as Access from '@deepseek-ai/dsh-api-remote-access/client'
import { LocaleRuntime, COMMON_NS, zh, en } from '@deepseek-ai/dsh-client-locale/client'
import Shortcuts from '@deepseek-ai/dsh-client-shortcuts/client'

/** Product composition over the original DSH services; no second Session owner. */
export async function mountUiFoundation(ctx: Context) {
  await ctx.plugin(Renderer)
  await ctx.plugin(Access)
  await ctx.plugin(UiSession)
  await ctx.plugin({
    inject: ['slots'],
    apply(scope: Context) {
      // Locale remains Chinese; Host-backed chat preferences are mounted by chat-runtime.
      const locale = new LocaleRuntime(scope, undefined, { languages: ['zh'], preference: 'zh' })
      scope.effect(() =>
        locale.register(COMMON_NS, {
          zh: { ...zh, 'brand.localBuild': '天质 AI' },
          en: { ...en, 'brand.localBuild': '天质 AI' },
        }),
      )
      scope.provide('locale', locale)
      scope.slots.installLocale(locale)
    },
  })
  await ctx.plugin(Shortcuts)
}
