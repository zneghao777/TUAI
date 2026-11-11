import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { LocaleSettings } from '@deepseek-ai/dsh-client-locale/client'

export type ProductLanguage = 'zh' | 'en' | 'it'
export const isLanguage = (value: unknown): value is ProductLanguage =>
  value === 'zh' || value === 'en' || value === 'it'

// A last-known display language is used only before the Host is reachable.
// The Host form remains authoritative as soon as it becomes available.
const bootLanguageKey = 'tianzhiai:boot-language'
export function readBootLanguage(): ProductLanguage {
  try {
    const stored = localStorage.getItem(bootLanguageKey)
    return isLanguage(stored) ? stored : 'zh'
  } catch {
    return 'zh'
  }
}

function rememberBootLanguage(language: ProductLanguage) {
  try {
    localStorage.setItem(bootLanguageKey, language)
  } catch {
    // A blocked or unavailable browser store must not affect Host settings.
  }
}

/** The Host form is the sole authority; publish only accepted preferences. */
export class LanguageRuntime {
  readonly state = createSnapshotStore({
    ready: false,
    unavailable: false,
    readOnly: false,
    saving: false,
    error: false,
  })
  private readonly form: ConfigForm<LocaleSettings>
  private readonly unsubscribe: () => void
  private disposed = false

  constructor(private readonly ctx: Context) {
    this.form = ctx.configForms.get<LocaleSettings>('locale')
    this.unsubscribe = this.form.subscribe(() => this.sync())
    this.sync()
  }

  private sync() {
    const snapshot = this.form.getSnapshot()
    this.state.update((state) => {
      state.ready = snapshot.status === 'ready' && snapshot.writable
      state.unavailable = snapshot.status === 'unavailable'
      state.readOnly = snapshot.status === 'ready' && !snapshot.writable
    })
    if (snapshot.status !== 'ready') return
    const preference = snapshot.value?.preference
    const language = isLanguage(preference) ? preference : 'zh'
    if (this.ctx.locale.getSnapshot().active !== language) this.ctx.locale.setLocale(language)
    rememberBootLanguage(language)
  }

  async setLanguage(language: ProductLanguage) {
    if (this.disposed || !this.state.getSnapshot().ready || this.state.getSnapshot().saving) return
    this.state.update((state) => {
      state.saving = true
      state.error = false
    })
    try {
      if (!(await this.form.set('preference', language)))
        throw new Error('Language preference was not saved')
      if (!this.disposed) this.sync()
    } catch {
      if (!this.disposed)
        this.state.update((state) => {
          state.error = true
        })
    } finally {
      if (!this.disposed)
        this.state.update((state) => {
          state.saving = false
        })
    }
  }

  dispose() {
    this.disposed = true
    this.unsubscribe()
  }
}
