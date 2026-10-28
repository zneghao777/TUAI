import { MarkdownDelegateProvider } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { App, Workspace } from './App'
import type { AppClient } from './model/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'tianzhiai.workspace': {
      kind: 'single'
      scope: 'session'
      owner: { onModels(): void }
    }
  }
}

export type AppSlots = ComposedProps<
  'root',
  string,
  'tianzhiai.workspace' | 'settings.general.item' | 'shell.overlay',
  undefined,
  object
>
type WorkspaceSlots = ComposedProps<
  'tianzhiai.workspace',
  string,
  'conversation.view',
  undefined,
  object
>

/** The shell owns visual layout; DSH owns scope, hooks and teardown. */
export function mountProductUi(client: AppClient, container: HTMLElement) {
  const { ctx } = client
  const root = ctx.slots.register(
    {
      name: 'root',
      children: {
        'tianzhiai.workspace': { kind: 'single', scope: 'session' },
        'settings.general.item': { kind: 'list', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
    },
    (props: AppSlots) => (
      <MarkdownDelegateProvider allowRemoteImages={false}>
        <App client={client} {...props} />
      </MarkdownDelegateProvider>
    ),
  )
  const workspace = ctx.slots.register(
    {
      name: 'tianzhiai.workspace',
      children: { 'conversation.view': { kind: 'list', scope: 'session' } },
    },
    function SessionWorkspace({ sessionId, useSession, onModels, renderSlot }: WorkspaceSlots) {
      const state = useSession((snapshot) => snapshot)
      const binding = ctx.sessions.binding(sessionId)
      if (!binding) return null
      return (
        <Workspace client={client} binding={binding} state={state} onModels={onModels}>
          {renderSlot(
            'conversation.view',
            {
              inspectCall: undefined,
              viewRequest: null,
              openView: (view) => {
                if (view !== 'chat') throw new Error('当前仅启用对话视图')
              },
              completeViewRequest: () => {},
            },
            { only: 'chat' },
          )}
        </Workspace>
      )
    },
  )
  let unmount: (() => void) | undefined
  try {
    unmount = ctx.uiRenderer.mount(container)
  } catch (error) {
    workspace()
    root()
    throw error
  }
  return () => {
    unmount?.()
    unmount = undefined
    workspace()
    root()
  }
}
