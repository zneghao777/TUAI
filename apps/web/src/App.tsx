import { Modal as DshModal } from '@deepseek-ai/dsh-client-ui-primitives'
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
import { ModelSettings } from './components/ModelSettings'
import { Composer } from './components/Composer'
import { Queue, Waiting } from './components/Interactions'
import s from './App.module.css'

export function App({ client, SessionProvider, renderSlot }: { client: AppClient } & AppSlots) {
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
    [panel, setPanel] = useState<
      'host' | 'rename' | 'artifacts' | 'actions' | 'models' | 'display'
    >(),
    [rename, setRename] = useState(''),
    [hostUrl, setHostUrl] = useState(''),
    [platformMessage, setPlatformMessage] = useState('')
  const narrow = useMediaQuery('(max-width:760px)'),
    navigation = useRef<HTMLElement>(null)
  const owned = useRef<SessionReference>(),
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
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [narrow, sidebar])
  useEffect(() => {
    if (panel) setSidebar(false)
  }, [panel])
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
      const id = await client.ctx.sessions.create({ cwd: facts.host?.workspace })
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
      if (e.key === 'Escape') setSidebar(false)
    }
    window.addEventListener('keydown', handler)
    return () => {
      unregister()
      window.removeEventListener('keydown', handler)
    }
  }, [client, facts.host, busy, connection])
  const title = binding ? (list.byId[binding.sessionId]?.displayTitle ?? '新会话') : '新会话'
  const state = binding?.session.getSnapshot()
  const rows = list.ids
    .map((id) => list.byId[id])
    .filter(Boolean)
    .filter(
      (row) => !search || row.displayTitle.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
  return (
    <div className={s.app}>
      <Glow />
      {sidebar ? (
        <button className={s.backdrop} aria-label="收起导航" onClick={() => setSidebar(false)} />
      ) : null}
      <aside
        ref={navigation}
        {...(narrow && !sidebar ? { inert: '' } : {})}
        aria-hidden={narrow && !sidebar ? true : undefined}
        className={`${s.sidebar} ${sidebar ? s.sidebarOpen : ''}`}
      >
        <div className={s.brand}>
          <div className={s.mark}>
            <Icon name="star" />
          </div>
          <strong>天质 AI</strong>
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
        <Button className={s.hostButton} onClick={() => setPanel('host')}>
          <span className={connection === 'connected' ? s.doneDot : s.failedDot} />
          <span>
            {facts.host ? shortPath(facts.host.workspace) : '连接 Host'} ·{' '}
            {connection === 'connected'
              ? '已连接'
              : connection === 'connecting'
                ? '重连中'
                : '未连接'}
          </span>
          <Icon name="chevron" />
        </Button>
        <div className={s.navLabel}>会话记录</div>
        <nav className={s.history} aria-label="会话历史">
          {rows.map((row) => (
            <button
              key={row.id}
              data-session-id={row.id}
              className={`${s.historyRow} ${row.id === binding?.sessionId ? s.selected : ''}`}
              aria-current={row.id === binding?.sessionId ? 'page' : undefined}
              onClick={() => void select(row.id)}
            >
              <span>{row.blank ? '新会话' : row.displayTitle}</span>
              {row.running ? <span className={s.activeDot} aria-label="运行中" /> : null}
            </button>
          ))}
          {!rows.length ? (
            <p className={s.emptyNav}>
              {search ? '没有匹配的会话' : list.phase === 'ready' ? '还没有会话' : '正在读取历史…'}
            </p>
          ) : null}
        </nav>
        <div className={s.sidebarFoot}>
          <Button onClick={() => setPanel('models')} aria-label="模型管理">
            <Icon name="model" />
            模型
          </Button>
          <button onClick={() => setPanel('host')}>连接与工作区</button>
        </div>
      </aside>
      <main
        {...(narrow && sidebar ? { inert: '' } : {})}
        aria-hidden={narrow && sidebar ? true : undefined}
        className={s.main}
      >
        <header className={s.header}>
          <Button className={s.mobileMenu} aria-label="打开导航" onClick={() => setSidebar(true)}>
            <Icon name="menu" />
          </Button>
          <div>
            <h1>{state?.blank ? '新会话' : title}</h1>
            <span>{facts.host ? shortPath(facts.host.workspace) : '正在连接工作区'}</span>
          </div>
          <div className={s.headerActions}>
            <Button onClick={() => setPanel('display')} aria-label="对话显示设置">
              显示设置
            </Button>
            <Button disabled={!binding} onClick={() => setPanel('artifacts')}>
              <Icon name="paperclip" />
              文件与产物
            </Button>
            <Button
              disabled={!binding}
              onClick={() => {
                setRename(title)
                setPanel('rename')
              }}
            >
              重命名
            </Button>
            <Button
              disabled={!binding || busy}
              onClick={() => {
                if (binding)
                  void client.ctx.sessions
                    .fork({ sessionId: binding.sessionId })
                    .then(select)
                    .catch((e) => setError(describe(e)))
              }}
            >
              派生会话
            </Button>
            <Button
              className={s.mobileMenu}
              aria-label="更多会话操作"
              disabled={!binding}
              onClick={() => setPanel('actions')}
            >
              ···
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
            {renderSlot('tianzhiai.workspace', { onModels: () => setPanel('models') })}
          </SessionProvider>
        ) : (
          <div className={s.loading}>
            {busy ? '正在打开会话…' : '正在连接 Host…'}
            {error ? <Button onClick={() => void create()}>新建会话</Button> : null}
          </div>
        )}
      </main>
      {renderSlot('shell.overlay', {})}
      {panel === 'display' ? (
        <DshModal open title="对话显示" closeLabel="关闭" onClose={() => setPanel(undefined)}>
          {renderSlot('settings.general.item', {})}
        </DshModal>
      ) : null}
      {panel === 'models' ? (
        <ModelSettings
          client={client}
          onClose={() => setPanel(undefined)}
          onHost={() => setPanel('host')}
        />
      ) : null}
      {panel === 'actions' && binding ? (
        <Modal title="会话操作" onClose={() => setPanel(undefined)}>
          <Button
            onClick={() => {
              setRename(title)
              setPanel('rename')
            }}
          >
            重命名
          </Button>
          <Button
            onClick={() => {
              setPanel(undefined)
              void client.ctx.sessions
                .fork({ sessionId: binding.sessionId })
                .then(select)
                .catch((e) => setError(describe(e)))
            }}
          >
            派生会话
          </Button>
        </Modal>
      ) : null}
      {panel === 'rename' && binding ? (
        <Modal title="重命名会话" onClose={() => setPanel(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void binding.session
                .rename(rename)
                .then(unwrap)
                .then(() => {
                  setPanel(undefined)
                  return client.ctx.sessions.refresh()
                })
                .catch((e) => setError(describe(e)))
            }}
          >
            <input
              aria-label="会话名称"
              autoFocus
              value={rename}
              onChange={(e) => setRename(e.target.value)}
            />
            <Button className={s.primary} type="submit" disabled={!rename.trim()}>
              保存名称
            </Button>
          </form>
        </Modal>
      ) : null}
      {panel === 'host' ? (
        <Modal title="连接与工作区" onClose={() => setPanel(undefined)}>
          <dl>
            <dt>当前 Host</dt>
            <dd>{location.origin}</dd>
            <dt>执行工作区（Host 目录）</dt>
            <dd>{facts.host?.workspace ?? '尚未连接'}</dd>
            <dt>模型凭据</dt>
            <dd>
              {facts.host?.modelConfigured ? '已配置' : '未配置'}
              <Button onClick={() => setPanel('models')}>管理模型</Button>
            </dd>
            <dt>当前平台</dt>
            <dd>Web · 文件选择来自当前设备；上传后由 Host 接收。</dd>
          </dl>
          <p>系统目录选择、原生文件打开与系统通知在 Web 中不可用。</p>
          <Button
            disabled={!client.platform}
            onClick={() => {
              void client.platform
                ?.chooseDirectory()
                .then((result) =>
                  setPlatformMessage(result.available ? result.value.path : result.message),
                )
            }}
          >
            选择 Host 目录
          </Button>
          {platformMessage ? <p role="status">{platformMessage}</p> : null}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              try {
                const target = new URL(hostUrl)
                if (!['http:', 'https:'].includes(target.protocol))
                  throw new Error('仅支持 HTTP/HTTPS Host 地址')
                void client.dispose().then(() => location.assign(target.href))
              } catch (e) {
                setError(describe(e))
              }
            }}
          >
            <label>
              切换 Host（粘贴目标 Host 的登录入口）
              <input
                aria-label="目标 Host 地址"
                type="url"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                placeholder="https://host.example/app/"
                required
              />
            </label>
            <Button type="submit">切换并重新认证</Button>
          </form>
        </Modal>
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
      <div className={`${s.dock} ${state.blank ? s.homeDock : ''}`}>
        <Waiting client={client} binding={binding} />
        <Queue binding={binding} />
        <Composer client={client} binding={binding} onModels={onModels} />
      </div>
    </>
  )
}
function shortPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? '工作区'
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
