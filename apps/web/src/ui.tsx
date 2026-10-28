import {
  MarkdownDelegateProvider,
  IconSettingsOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { useSource } from './bindings'
import { SettingsDialog } from './components/SettingsDialog'
import type { AppClient } from './model/client'
import s from './App.module.css'
import { mountArtifactPane } from './components/ArtifactPane'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'tianzhiai.workspace': { kind: 'single'; scope: 'session'; owner: { onModels(): void } }
  }
}
// Compatibility type for the retired product shell; it no longer enters the bundle.
export type AppSlots = ComposedProps<
  'root',
  string,
  'tianzhiai.workspace' | 'settings.general.item' | 'shell.overlay',
  undefined,
  object
>
type SettingsProps = ComposedProps<
  'shell.overlay',
  string,
  'settings.general.item',
  undefined,
  object
>

/** Product branding and settings surround original DSH Layout/Conversation/Workspace owners. */
export function mountProductUi(client: AppClient, container: HTMLElement) {
  const { ctx } = client
  mountArtifactPane(client)
  const colors: Record<string, [string, string]> = {
    '--dsw-alias-bg-base': ['#f5f6f8', '#191d24'],
    '--dsw-specific-sidebar-fill': ['#f9fafb', '#20252e'],
    '--dsw-alias-bg-layer-1': ['#ffffff', '#262d38'],
    '--dsw-alias-bg-layer-2': ['#ffffff', '#303946'],
    '--dsw-alias-bg-overlay': ['#ffffff', '#262d38'],
    '--dsw-alias-label-primary': ['#282d35', '#edf0f4'],
    '--dsw-alias-label-secondary': ['#666e7b', '#b8c2d0'],
    '--dsw-alias-brand-primary': ['#536985', '#a6bedc'],
    '--dsw-specific-bubble': ['#e9eff6', '#303c4d'],
    '--dsw-alias-border-l3': ['#e2e6ec', '#3c4552'],
  }
  const resetTheme = ctx.theme.overrideTokens(
    'tianzhiai',
    Object.fromEntries(
      Object.entries(colors).map(([key, [light, dark]]) => [key, { light, dark }]),
    ),
  )
  const settingsOpen = createSnapshotStore(false)
  const disposers = [
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register(
        { name: 'shell.overlay', id: 'tianzhiai-connection' },
        function ConnectionNotice() {
          const state = useSource(client.connection.state)
          const facts = useSource(client.facts)
          return state !== 'connected' || facts.error ? (
            <div className="tz-connection" role="alert">
              <span>{facts.error ?? '连接中断，正在恢复…'}</span>
              <button className="tz-pane-action" onClick={() => client.connection.reconnect()}>
                重新连接
              </button>
            </div>
          ) : null
        },
      ),
    ),
    ctx.slots.inject('sidebar.brand.mark', () =>
      ctx.slots.register({ name: 'sidebar.brand.mark' }, () => (
        <span className={s.brandIcon} aria-hidden>
          ✧
        </span>
      )),
    ),
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.register({ name: 'sidebar.brand.name' }, () => <strong>天质 AI</strong>),
    ),
    ctx.slots.inject('sidebar.settings', () =>
      ctx.slots.register({ name: 'sidebar.settings' }, ({ wide }) => (
        <button
          className="tz-settings-trigger"
          aria-label="设置"
          onClick={() => settingsOpen.set(true)}
        >
          <IconSettingsOutlineRegular size={18} />
          {wide ? <span>设置</span> : null}
        </button>
      )),
    ),
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register(
        {
          name: 'shell.overlay',
          id: 'tianzhiai-settings',
          children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
        },
        function ProductSettings({ renderSlot }: SettingsProps) {
          const open = useSource(settingsOpen)
          return open ? (
            <SettingsDialog client={client} onClose={() => settingsOpen.set(false)}>
              {renderSlot('settings.general.item', {})}
            </SettingsDialog>
          ) : null
        },
      ),
    ),
  ]
  const unmount = ctx.uiRenderer.mount(container, (app) => (
    <MarkdownDelegateProvider allowRemoteImages={false}>{app}</MarkdownDelegateProvider>
  ))
  return () => {
    unmount()
    resetTheme()
    for (const dispose of disposers.reverse()) dispose()
  }
}
