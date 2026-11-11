import { RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPendingInteractionBase } from '@deepseek-ai/dsh-client-ui-session/client'
import type { BrowserFollowFrame, BrowserSnapshot } from '@tuai/browser-service/types'
import type { AppClient } from './client'
interface PendingBrowser extends SessionPendingInteractionBase {
  kind: 'browser'
  browserId: string
}
declare module '@deepseek-ai/dsh-client-ui-session/client' {
  interface SessionPendingInteractionMap {
    browser: PendingBrowser
  }
}

/** Domain events place the pane; pixels never place it or change control authority. */
export function mountBrowserFollow(client: AppClient) {
  const { ctx } = client,
    noticed = new Map<string, number>(),
    pending = new Map<string, { key: string; remove(): void }>()
  const scope = `tianzhiai-browser-notices:${client.facts.getSnapshot().host?.id}`
  const publish = ctx.uiSession.registerPendingInteraction<PendingBrowser>(() => 0)
  try {
    for (const [id, event] of Object.entries(JSON.parse(localStorage.getItem(scope) ?? '{}')))
      if (typeof event === 'number') noticed.set(id, event)
  } catch {}
  const present = (browsers: readonly BrowserSnapshot[]) => {
    const current = ctx.sidebarRight.mounted.getSnapshot()
    for (const browser of browsers) {
      const waiting =
        browser.lifecycle === 'error' ||
        ['waiting_user', 'waiting_approval'].includes(browser.taskStatus)
      const key = `${browser.id}:${browser.controlEpoch}:${browser.waitEventId}:${browser.taskStatus}:${browser.lifecycle}`
      const prior = pending.get(browser.id)
      if (prior && (!waiting || prior.key !== key)) {
        prior.remove()
        pending.delete(browser.id)
      }
      if (waiting && !pending.has(browser.id))
        pending.set(browser.id, {
          key,
          remove: publish(
            {
              key,
              kind: 'browser',
              sessionId: browser.sessionId as SessionId,
              browserId: browser.id,
            },
            async () => {},
          ),
        })
      if (browser.sessionId !== current || browser.lifecycle === 'closed') continue
      const old = noticed.get(browser.id)
      if ((old === undefined && browser.lifecycle === 'open') || browser.waitEventId > (old ?? 0)) {
        noticed.set(browser.id, browser.waitEventId)
        try {
          localStorage.setItem(scope, JSON.stringify(Object.fromEntries(noticed)))
        } catch {}
        ctx.sidebarRight.openResource(`dsh-resource://ego-browser/${browser.id}`)
      }
    }
    for (const [id, item] of pending)
      if (!browsers.some((b) => b.id === id)) {
        item.remove()
        pending.delete(id)
      }
  }
  ctx.effect(() => {
    let stopped = false
    const off = ctx.sidebarRight.mounted.subscribe(() => present(client.browserState.getSnapshot()))
    const stream = ctx.remote.$stream<BrowserFollowFrame>({
      name: 'Ego browser resources',
      open: (signal) => ctx.remote.browsers.overview(signal),
      ended: () => new RemoteStreamCarrierError('Browser resource stream disconnected'),
    })
    void (async () => {
      for await (const item of stream) {
        if (stopped) return
        item.accept()
        client.browserConnectionError.set(false)
        client.browserState.set(item.value.browsers)
        present(item.value.browsers)
      }
    })().catch(() => {
      if (!stopped) client.browserConnectionError.set(true)
    })
    return () => {
      stopped = true
      off()
      void stream.dispose()
      for (const item of pending.values()) item.remove()
      pending.clear()
    }
  })
}
