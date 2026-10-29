import {
  MarkdownDelegateProvider,
  IconSettingsOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Button as HeroButton } from '@heroui/react'
import { CursorGlow } from './components/CursorGlow'
import { ModelPicker } from './components/ModelPicker'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
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
  const colors: Record<string, [string, string]> = Object.fromEntries(
    Object.entries({
      '--dsw-alias-bg-base': 'var(--canvas)',
      '--dsw-specific-sidebar-fill': 'var(--sidebar)',
      '--dsw-alias-bg-layer-1': 'var(--glass)',
      '--dsw-alias-bg-layer-2': 'var(--panel)',
      '--dsw-alias-bg-overlay': 'var(--panel)',
      '--dsw-alias-label-primary': 'var(--ink)',
      '--dsw-alias-label-secondary': 'var(--muted)',
      '--dsw-alias-label-primary-foreground': 'var(--accent-foreground)',
      '--dsw-alias-brand-primary': 'var(--accent)',
      '--dsw-alias-state-business-primary': 'var(--accent)',
      '--dsw-alias-button-primary-fill': 'var(--accent)',
      '--dsw-alias-button-primary-hover': 'var(--accent-pressed)',
      '--dsw-alias-button-info-fill': 'var(--accent)',
      '--dsw-alias-button-info-hover': 'var(--accent-pressed)',
      '--dsw-specific-input-major': 'var(--glass)',
      '--dsw-specific-selector': 'var(--mist)',
      '--dsw-specific-bubble': 'var(--mist)',
      '--dsw-alias-border-l3': 'var(--line)',
    }).map(([key, value]) => [key, [value, value]]),
  )
  const resetTheme = ctx.theme.overrideTokens(
    'tianzhiai',
    Object.fromEntries(
      Object.entries(colors).map(([key, [light, dark]]) => [key, { light, dark }]),
    ),
  )
  const settingsOpen = createSnapshotStore(false)
  const disposers = [
    ctx.slots.inject('conversation.input.model', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.model',
          priority: -10,
          inject: (sessionId): ModelSelectInjected => {
            const directory = ctx.modelDirectories.directoryFor(sessionId)
            const available = ctx.sessions.subagentAddress(sessionId) === undefined
            return {
              available,
              directory: directory.store,
              load: () => {
                if (available) void directory.load().catch(() => {})
              },
              select: (selection) =>
                available ? directory.select(selection) : Promise.resolve(undefined),
            }
          },
        },
        (props) => <ModelPicker {...props} />,
      ),
    ),
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register(
        { name: 'shell.overlay', id: 'tianzhiai-connection' },
        function ConnectionNotice() {
          const state = useSource(client.connection.state)
          const facts = useSource(client.facts)
          return state !== 'connected' || facts.error ? (
            <div className="tz-connection" role="alert">
              <span>{facts.error ?? '连接中断，正在恢复…'}</span>
              <HeroButton
                variant="ghost"
                className="tz-pane-action"
                onClick={() => client.connection.reconnect()}
              >
                重新连接
              </HeroButton>
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
        <HeroButton
          variant="ghost"
          className="tz-settings-trigger"
          aria-label="设置"
          onClick={() => settingsOpen.set(true)}
        >
          <IconSettingsOutlineRegular size={18} />
          {wide ? <span>设置</span> : null}
        </HeroButton>
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
    <MarkdownDelegateProvider allowRemoteImages={false}>
      {app}
      <CursorGlow />
    </MarkdownDelegateProvider>
  ))
  return () => {
    unmount()
    resetTheme()
    for (const dispose of disposers.reverse()) dispose()
  }
}
