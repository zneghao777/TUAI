import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemePreference } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ProductAppearanceSettings, ThemePalette } from '@tuai/web-host/types'

interface AppearanceState {
  palette: ThemePalette
  preference: ThemePreference
  ready: boolean
  saving: boolean
  error: string | undefined
}

/** Product presentation over the same Host document used by ThemeRuntime, with no second preference cache. */
export class AppearanceRuntime {
  readonly state = createSnapshotStore<AppearanceState>({
    palette: 'white',
    preference: 'light',
    ready: false,
    saving: false,
    error: undefined,
  })
  private readonly form: ConfigForm<ProductAppearanceSettings>
  private readonly unsubscribe: () => void
  private disposed = false

  constructor(
    ctx: Context,
    private readonly presentPalette: () => void,
  ) {
    this.form = ctx.configForms.get<ProductAppearanceSettings>('ui-theme')
    this.unsubscribe = this.form.subscribe(() => this.sync())
    this.sync()
  }

  /** Light-only palettes save their supported scheme in the same fenced Host mutation. */
  setPalette(palette: ThemePalette): Promise<void> {
    if (this.state.getSnapshot().palette === palette) {
      this.state.update((draft) => {
        draft.error = undefined
      })
      return Promise.resolve()
    }
    return this.write(() =>
      this.form.mutate([
        { op: 'set', path: ['palette'], value: palette },
        ...(palette !== 'forest'
          ? [{ op: 'set' as const, path: ['preference'], value: 'light' }]
          : []),
      ]),
    )
  }

  /** The original theme service adopts this accepted document and publishes the resolved scheme. */
  setPreference(preference: ThemePreference): Promise<void> {
    if (this.state.getSnapshot().preference === preference) {
      this.state.update((draft) => {
        draft.error = undefined
      })
      return Promise.resolve()
    }
    return this.write(() => this.form.set('preference', preference))
  }

  private async write(operation: () => Promise<boolean>): Promise<void> {
    const current = this.state.getSnapshot()
    if (this.disposed || current.saving || !current.ready) return
    this.state.update((draft) => {
      draft.saving = true
      draft.error = undefined
    })
    try {
      if (!(await operation())) throw new Error('设置未保存，请重试')
    } catch {
      if (!this.disposed)
        this.state.update((draft) => {
          draft.error = '未确认保存，请重试'
        })
    } finally {
      if (!this.disposed) {
        this.sync()
        this.state.update((draft) => {
          draft.saving = false
        })
      }
    }
  }

  private sync(): void {
    const snapshot = this.form.getSnapshot()
    const settings = snapshot.value
    this.state.update((draft) => {
      draft.ready = snapshot.status === 'ready' && snapshot.writable
      if (settings) {
        draft.palette = settings.palette
        draft.preference = settings.preference
      }
    })
    if (settings) {
      const changed = document.body.dataset.tzPalette !== settings.palette
      document.body.dataset.tzPalette = settings.palette
      document.body.setAttribute('data-tz-appearance-ready', '')
      // A palette-only change also refreshes the original presenter and browser chrome.
      if (changed) this.presentPalette()
    }
  }

  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    document.body.removeAttribute('data-tz-palette')
    document.body.removeAttribute('data-tz-appearance-ready')
  }
}
