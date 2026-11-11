import { SessionSidebar } from './components/SessionSidebar'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  SessionBinding,
  SessionReference,
  SessionSnapshot,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { AppSlots } from './ui'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { AppClient, describe, unwrap } from './model/client'
import { useSource, useMediaQuery } from './bindings'
import { Button, Icon, Glow, Modal } from './components/kit'
import { SettingsDialog } from './components/SettingsDialog'
import { Composer } from './components/Composer'
import { Queue, Waiting } from './components/Interactions'
import s from './App.module.css'

export function App({
  client,
  SessionProvider,
  renderSlot,
  ...standard
}: { client: AppClient } & AppSlots) {
  const facts = useSource(client.facts),
    list = useSource(client.ctx.sessions.list),
    connection = useSource(client.connection.state)
  const [binding, setBinding] = useState<SessionBinding>(),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const shortcuts = useSource(client.ctx.shortcuts.catalog)
  const newSessionShortcut = shortcuts.find((entry) => entry.id === 'session.new')
  const [sidebar, setSidebar] = useState(false),
    [panel, setPanel] = useState<'artifacts' | 'settings'>()
  const narrow = useMediaQuery('(max-width:760px)'),
    navigation = useRef<HTMLElement>(null)
  const owned = useRef<SessionReference | undefined>(undefined),
    version = useRef(0),
    initialized = useRef('')
  useEffect(() => {
    if (!narrow || !sidebar) return
    const previous = document.activeElement,
      nav = navigation.current
    const focusable = () =>
      Array.from(
        nav?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') ??
          [],
      ).filter((el) => el.getClientRects().length > 0)
    focusable()[0]?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const all = focusable()
      const first = all[0],
        last = all.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    nav?.addEventListener('keydown', trap)
    return () => {
      nav?.removeEventListener('keydown', trap)
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !document.querySelector('[aria-modal="true"]')
      )
        previous.focus()
    }
  }, [narrow, sidebar])
  useEffect(() => {
    if (panel) setSidebar(false)
  }, [panel])
  const openSettings = () => {
    // A closing drawer must not become the modal's return-focus target.
    if (narrow && sidebar && document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    setSidebar(false)
    setPanel('settings')
  }
  const select = async (id: SessionId) => {
    const run = ++version.current
    setBusy(true)
    setError('')
    let next: SessionReference | undefined
    try {
      next = client.ctx.sessions.retain(id, { source: 'mainView' })
      const value = await next.ready
      if (run !== version.current) {
        next.release()
        return
      }
      owned.current?.release()
      owned.current = next
      setBinding(value)
      setSidebar(false)
      if (facts.host) localStorage.setItem(`tianzhiai:selected:${facts.host.id}`, id)
    } catch (e) {
      next?.release()
      if (run === version.current) setError(describe(e))
    } finally {
      if (run === version.current) setBusy(false)
    }
  }
  useEffect(() => {
    client.openSession = select
    return () => {
      client.openSession = undefined
    }
  }, [client, facts.host])
  const create = async () => {
    setBusy(true)
    try {
      const id = await client.ctx.sessions.create({})
      await select(id)
    } catch (e) {
      setError(describe(e))
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!facts.host || initialized.current === facts.host.id) return
    initialized.current = facts.host.id
    const saved = localStorage.getItem(`tianzhiai:selected:${facts.host.id}`)
    if (saved) void select(SessionId(saved))
    else void create()
  }, [facts.host?.id])
  useEffect(
    () => () => {
      version.current++
      owned.current?.release()
    },
    [],
  )
  useEffect(() => {
    const unregister = client.ctx.shortcuts.register({
      id: 'session.new' as ShortcutCommandId,
      label: () => '新会话',
      aliases: ['new session', 'new chat'],
      defaults: {
        'web:macos': { code: 'KeyN', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'KeyN', modifiers: ['primary', 'alt'] },
        'desktop:macos': { code: 'KeyN', modifiers: ['primary'] },
        'desktop:windows': { code: 'KeyN', modifiers: ['primary'] },
        'desktop:linux': { code: 'KeyN', modifiers: ['primary'] },
      },
      regions: ['page', 'editable'],
      modals: [],
      resolve: () =>
        facts.host && !busy && connection === 'connected'
          ? {
              status: 'handled',
              run: () => {
                void create()
              },
            }
          : { status: 'blocked', reason: '会话尚未就绪' },
    })
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setSidebar(false)
    }
    window.addEventListener('keydown', handler)
    return () => {
      unregister()
      window.removeEventListener('keydown', handler)
    }
  }, [client, facts.host, busy, connection])
  const title = binding ? (list.byId[binding.sessionId]?.title ?? '新会话') : '新会话'
  return (
    <div className={s.app}>
      <Glow />
      {sidebar ? (
        <button className={s.backdrop} aria-label="收起导航" onClick={() => setSidebar(false)} />
      ) : null}
      <aside
        ref={navigation}
        {...(narrow && !sidebar ? { inert: true } : {})}
        className={`${s.sidebar} ${sidebar ? s.sidebarOpen : ''}`}
      >
        <div className={s.brand}>
          <div className={s.mark}>
            <Icon name="star" />
          </div>
          <strong>TUAI</strong>
          <Button className={s.mobileClose} aria-label="收起导航" onClick={() => setSidebar(false)}>
            <Icon name="menu" />
          </Button>
        </div>
        <Button
          className={s.newSession}
          aria-label="新会话"
          onClick={() => void create()}
          disabled={busy || connection !== 'connected' || !facts.host}
          aria-keyshortcuts={newSessionShortcut?.aria}
        >
          <Icon name="plus" />
          新会话
          {newSessionShortcut?.keys.length ? <kbd>{newSessionShortcut.keys.join('')}</kbd> : null}
        </Button>
        <label className={s.search}>
          <Icon name="search" />
          <input
            aria-label="搜索会话"
            placeholder="搜索会话"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <SessionSidebar
          standard={standard}
          client={client}
          search={search}
          selected={binding?.sessionId}
          onSelect={select}
          onError={setError}
          onArchived={async (id) => {
            if (id !== binding?.sessionId) return
            const archived = new Set(client.ctx.workspaces.list.getSnapshot().archivedSessionIds)
            const next = list.ids.find((candidate) => candidate !== id && !archived.has(candidate))
            if (next) await select(next)
            else await create()
          }}
        />
        <div className={s.sidebarFoot}>
          <Button onClick={openSettings} aria-label="设置">
            <Icon name="settings" />
            设置
          </Button>
        </div>
      </aside>
      <main {...(narrow && sidebar ? { inert: true } : {})} className={s.main}>
        <header className={s.header}>
          <Button className={s.mobileMenu} aria-label="打开导航" onClick={() => setSidebar(true)}>
            <Icon name="menu" />
          </Button>
          <div>
            <h1>{title}</h1>
          </div>
          <div className={s.headerActions}>
            <Button disabled={!binding} onClick={() => setPanel('artifacts')}>
              <Icon name="paperclip" />
              文件与产物
            </Button>
          </div>
        </header>
        {connection !== 'connected' || facts.error || error ? (
          <div className={s.connectionAlert} role="alert">
            <span>
              {error ||
                facts.error ||
                '连接中断，执行状态待同步。草稿保留，已接受的输入不会自动重发。'}
            </span>
            <Button
              onClick={() => {
                setError('')
                client.connection.reconnect()
              }}
            >
              重新连接
            </Button>
          </div>
        ) : null}
        {binding ? (
          <SessionProvider session={owned.current}>
            {renderSlot('tianzhiai.workspace', { onModels: openSettings })}
          </SessionProvider>
        ) : (
          <div className={s.loading}>
            {busy ? '正在打开会话…' : '正在连接 Host…'}
            {error ? <Button onClick={() => void create()}>新建会话</Button> : null}
          </div>
        )}
      </main>
      {renderSlot('shell.overlay', {})}
      {panel === 'settings' ? (
        <SettingsDialog
          client={client}
          onClose={() => {
            setPanel(undefined)
            if (narrow)
              requestAnimationFrame(() =>
                document.querySelector<HTMLButtonElement>('[aria-label="打开导航"]')?.focus(),
              )
          }}
        >
          {renderSlot('settings.general.item', {})}
        </SettingsDialog>
      ) : null}
      {panel === 'artifacts' && binding ? (
        <Modal title="文件与产物" onClose={() => setPanel(undefined)}>
          <Artifacts client={client} binding={binding} />
        </Modal>
      ) : null}
    </div>
  )
}
export function Workspace({
  children,
  client,
  binding,
  state,
  onModels,
}: {
  children: ReactNode
  client: AppClient
  binding: SessionBinding
  state: SessionSnapshot
  onModels(): void
}) {
  return (
    <>
      {state.blank ? (
        <div className={s.hero}>
          <div className={s.heroMark}>
            <Icon name="star" />
          </div>
          <h2>今天，想一起完成什么？</h2>
        </div>
      ) : (
        children
      )}
      <div className={`${s.dock} ${state.blank ? s.homeDock : ''}`} data-composer-dock>
        {!state.blank && <div className={s.dockFade} aria-hidden="true" data-composer-fade />}
        <div className={s.dockContents}>
          <Waiting client={client} binding={binding} />
          <Queue binding={binding} />
          <Composer client={client} binding={binding} onModels={onModels} />
        </div>
      </div>
    </>
  )
}
function Artifacts({ client, binding }: { client: AppClient; binding: SessionBinding }) {
  const [items, setItems] = useState<{ id: string; name: string; bytes: number }[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    void client.ctx.remote.platform
      .artifacts(binding.sessionId)
      .then(unwrap)
      .then((value) => {
        if (alive) setItems(value)
      })
      .catch((e) => {
        if (alive) setError(describe(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [client, binding])
  return (
    <div>
      {loading ? (
        <p>正在核对会话文件…</p>
      ) : !items.length ? (
        <p>{error ? '文件清单读取未完成。' : '当前会话尚无文件或产物。'}</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className={s.artifactRow}>
            <span>
              {item.name}
              <small>{item.bytes.toLocaleString()} B · 当前会话</small>
            </span>
            <Button
              onClick={() => {
                void fetch(
                  `api/artifact?${new URLSearchParams({ sessionId: binding.sessionId, artifactId: item.id })}`,
                  { credentials: 'same-origin' },
                )
                  .then(async (r) => {
                    if (!r.ok)
                      throw new Error(
                        r.status === 404 ? '文件已清理或不存在' : `无法下载（${r.status}）`,
                      )
                    const url = URL.createObjectURL(await r.blob())
                    const a = document.createElement('a')
                    a.href = url
                    a.download = item.name
                    a.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                  })
                  .catch((e) => setError(describe(e)))
              }}
            >
              <Icon name="download" />
              下载
            </Button>
          </div>
        ))
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  )
}
