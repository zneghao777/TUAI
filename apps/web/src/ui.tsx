import {
  MarkdownDelegateProvider,
  IconSettingsOutlineRegular,
  PermissionIconReadOnlyRegular,
  PermissionIconFullAccessRegular,
  IconChevronDownOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Button as HeroButton } from '@heroui/react'
import { ChatSidebar } from './components/ChatSidebar'
import { FILES_PANEL, FileLibrary } from './components/FileLibrary'
import { SkillsPage } from './components/SkillsPage'
import { SKILLS_PANEL, mountSkillInput } from './model/skills'
import { CursorGlow } from './components/CursorGlow'
import { ModelPicker } from './components/ModelPicker'
import { Icon } from './components/kit'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { useSource } from './bindings'
import { SettingsDialog } from './components/SettingsDialog'
import { AppearanceSettings } from './components/AppearanceSettings'
import { AppearanceRuntime } from './model/appearance'
import type { AppClient } from './model/client'
import { mountArtifactPane } from './components/ArtifactPane'
import brandLogo from './assets/tianzhi-logo.png'

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

/** Product chat navigation, branding and settings share the original DSH state owners. */
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
  const semanticTokens = Object.fromEntries(
    Object.entries(colors).map(([key, [light, dark]]) => [key, { light, dark }]),
  )
  let resetTheme = ctx.theme.overrideTokens('tianzhiai', semanticTokens)
  const settingsOpen = createSnapshotStore(false)
  const appearance = new AppearanceRuntime(ctx, () => {
    resetTheme = ctx.theme.overrideTokens('tianzhiai', semanticTokens)
  })
  const disposers = [
    mountSkillInput(client),
    ctx.slots.inject('main', () =>
      ctx.slots.register({ name: 'main', key: SKILLS_PANEL }, () => <SkillsPage client={client} />),
    ),
    ctx.slots.inject('main', () =>
      ctx.slots.register({ name: 'main', key: FILES_PANEL }, () => <FileLibrary client={client} />),
    ),
    ctx.commandUi.hideMenuEntries(['goal', 'plan', 'feedback', 'export']),
    ctx.slots.inject('settings.general.item', () =>
      ctx.slots.register(
        { name: 'settings.general.item', id: 'appearance', order: 10, priority: -10 },
        () => <AppearanceSettings appearance={appearance} />,
      ),
    ),
    ctx.slots.inject('sidebar.workspaces', () =>
      ctx.slots.register({ name: 'sidebar.workspaces', priority: -10 }, ({ wide }) => (
        <ChatSidebar client={client} wide={wide} />
      )),
    ),
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register(
        { name: 'conversation.input.dock', id: 'tianzhiai-greeting', order: -100 },
        ({ session }) =>
          session.blank ? (
            <div className="tz-chat-greeting">
              <h2>今天，想一起完成什么？</h2>
            </div>
          ) : null,
      ),
    ),
    ctx.slots.inject('conversation.hero.brand.mark', () =>
      ctx.slots.register({ name: 'conversation.hero.brand.mark' }, () => (
        <div className="tz-chat-greeting">
          <h2>今天，想一起完成什么？</h2>
        </div>
      )),
    ),
    ctx.slots.inject('conversation.input.staged.permission', () =>
      ctx.slots.register(
        { name: 'conversation.input.staged.permission' },
        ({ locked, activate }) => {
          const facts = useSource(client.facts)
          const full = facts.permissions?.defaultPreset === 'full-access'
          const label = full ? '完全权限' : '仅可查看'
          return (
            <HeroButton
              variant="ghost"
              className={`tz-staged-permission${full ? ' tz-permission-full' : ''}`}
              isDisabled={locked}
              aria-label={`访问模式，当前：${label}`}
              onPress={activate}
            >
              {full ? <PermissionIconFullAccessRegular /> : <PermissionIconReadOnlyRegular />}
              <span>{label}</span>
              <IconChevronDownOutlineRegular />
            </HeroButton>
          )
        },
      ),
    ),
    ctx.slots.inject('conversation.input.staged.model', () =>
      ctx.slots.register({ name: 'conversation.input.staged.model' }, ({ locked, activate }) => {
        const facts = useSource(client.facts)
        const catalog = facts.catalog
        const selection = catalog?.default
        const model = catalog?.groups
          .find((group) => group.id === selection?.provider)
          ?.models.find((item) => item.id === selection?.model)
        const effortId = selection?.reasoningEffort ?? model?.reasoning?.defaultEffort
        const effort = model?.reasoning?.efforts.find((item) => item.id === effortId)?.name
        const label = model?.name ?? selection?.model ?? '选择模型'
        return (
          <HeroButton
            variant="ghost"
            size="sm"
            className="tz-model-trigger"
            isDisabled={locked}
            aria-label={`选择模型，当前：${label}${effort ? `，${effort}` : ''}`}
            onPress={activate}
          >
            <span>{label}</span>
            {effort ? <span className="tz-model-effort">{effort}</span> : null}
            <Icon name="chevron" />
          </HeroButton>
        )
      }),
    ),
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
        <span className="tz-brand-logo" aria-hidden>
          <img src={brandLogo} alt="" />
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
    appearance.dispose()
    resetTheme()
    for (const dispose of disposers.reverse()) dispose()
  }
}
