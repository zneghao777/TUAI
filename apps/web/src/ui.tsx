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
import { I18nProvider } from 'react-aria-components'
import type { ReactNode } from 'react'
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
import { LanguageRuntime } from './model/language'
import { LanguageSettings } from './components/LanguageSettings'
import { useProductLanguage } from './model/product-language'
import { localizeHostError } from './model/host-errors'
import type { AppClient } from './model/client'
import { mountArtifactPane } from './components/ArtifactPane'
import brandLogo from './assets/tianzhi-logo.png'

function ProductProviders({ client, children }: { client: AppClient; children: ReactNode }) {
  const language = useProductLanguage(client)
  return (
    <I18nProvider locale={language === 'zh' ? 'zh-CN' : language}>
      <MarkdownDelegateProvider allowRemoteImages={false}>
        {children}
        <CursorGlow />
      </MarkdownDelegateProvider>
    </I18nProvider>
  )
}

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

const shellCopy = {
  zh: {
    greeting: '今天，想一起完成什么？',
    full: '完全权限',
    read: '仅可查看',
    access: '访问模式，当前：',
    model: '选择模型',
    current: '选择模型，当前：',
    connection: '连接中断，正在恢复…',
    reconnect: '重新连接',
    settings: '设置',
  },
  en: {
    greeting: 'What would you like to work on today?',
    full: 'Full access',
    read: 'Read only',
    access: 'Access mode, current: ',
    model: 'Select model',
    current: 'Select model, current: ',
    connection: 'Connection interrupted. Reconnecting…',
    reconnect: 'Reconnect',
    settings: 'Settings',
  },
  it: {
    greeting: 'A cosa vuoi lavorare oggi?',
    full: 'Accesso completo',
    read: 'Sola lettura',
    access: 'Modalità di accesso, attuale: ',
    model: 'Seleziona modello',
    current: 'Seleziona modello, attuale: ',
    connection: 'Connessione interrotta. Riconnessione…',
    reconnect: 'Riconnetti',
    settings: 'Impostazioni',
  },
}

/** Product chat navigation, branding and settings share the original DSH state owners. */
export function mountProductUi(client: AppClient, container: HTMLElement) {
  const { ctx } = client
  function Greeting() {
    return (
      <div className="tz-chat-greeting">
        <h2>{shellCopy[useProductLanguage(client)].greeting}</h2>
      </div>
    )
  }
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
  const language = new LanguageRuntime(ctx)
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
        { name: 'settings.general.item', id: 'language', order: 0, priority: -10 },
        () => <LanguageSettings client={client} language={language} />,
      ),
    ),
    ctx.slots.inject('settings.general.item', () =>
      ctx.slots.register(
        { name: 'settings.general.item', id: 'appearance', order: 10, priority: -10 },
        () => <AppearanceSettings client={client} appearance={appearance} />,
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
        ({ session }) => (session.blank ? <Greeting /> : null),
      ),
    ),
    ctx.slots.inject('conversation.hero.brand.mark', () =>
      ctx.slots.register({ name: 'conversation.hero.brand.mark' }, () => <Greeting />),
    ),
    ctx.slots.inject('conversation.input.staged.permission', () =>
      ctx.slots.register(
        { name: 'conversation.input.staged.permission' },
        ({ locked, activate }) => {
          const facts = useSource(client.facts)
          const copy = shellCopy[useProductLanguage(client)]
          const full = facts.permissions?.defaultPreset === 'full-access'
          const label = full ? copy.full : copy.read
          return (
            <HeroButton
              variant="ghost"
              className={`tz-staged-permission${full ? ' tz-permission-full' : ''}`}
              isDisabled={locked}
              aria-label={`${copy.access}${label}`}
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
        const copy = shellCopy[useProductLanguage(client)]
        const catalog = facts.catalog
        const selection = catalog?.default
        const model = catalog?.groups
          .find((group) => group.id === selection?.provider)
          ?.models.find((item) => item.id === selection?.model)
        const effortId = selection?.reasoningEffort ?? model?.reasoning?.defaultEffort
        const effort = model?.reasoning?.efforts.find((item) => item.id === effortId)?.name
        const label = model?.name ?? selection?.model ?? copy.model
        return (
          <HeroButton
            variant="ghost"
            size="sm"
            className="tz-model-trigger"
            isDisabled={locked}
            aria-label={`${copy.current}${label}${effort ? `, ${effort}` : ''}`}
            onPress={activate}
          >
            <span className="tz-model-icon" aria-hidden="true">
              <Icon name="model" />
            </span>
            <span className="tz-model-name">{label}</span>
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
        (props) => <ModelPicker {...props} client={client} />,
      ),
    ),
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register(
        { name: 'shell.overlay', id: 'tianzhiai-connection' },
        function ConnectionNotice() {
          const state = useSource(client.connection.state)
          const facts = useSource(client.facts)
          const language = useProductLanguage(client)
          const copy = shellCopy[language]
          return state !== 'connected' || facts.error ? (
            <div className="tz-connection" role="alert">
              <span>
                {facts.error ? localizeHostError(facts.error, language) : copy.connection}
              </span>
              <HeroButton
                variant="ghost"
                className="tz-pane-action"
                onClick={() => client.connection.reconnect()}
              >
                {copy.reconnect}
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
      ctx.slots.register({ name: 'sidebar.settings' }, ({ wide }) => {
        const copy = shellCopy[useProductLanguage(client)]
        return (
          <HeroButton
            variant="ghost"
            className="tz-settings-trigger"
            aria-label={copy.settings}
            onClick={() => settingsOpen.set(true)}
          >
            <IconSettingsOutlineRegular size={18} />
            {wide ? <span>{copy.settings}</span> : null}
          </HeroButton>
        )
      }),
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
    <ProductProviders client={client}>{app}</ProductProviders>
  ))
  return () => {
    unmount()
    appearance.dispose()
    language.dispose()
    resetTheme()
    for (const dispose of disposers.reverse()) dispose()
  }
}
