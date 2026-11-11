import { useEffect, useRef, useState } from 'react'
import { Form, Input, Modal } from '@heroui/react'
import {
  IconArchiveOutlineRegular,
  IconAgentPresetOutlineRegular,
  IconSkillOutlineRegular,
  IconNewChatOutlineRegular,
  IconCloseOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconSearchOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
  IconFolderOpenOutlineRegular,
  Menu,
  Toast,
  relativeTime,
  Modal as ExistingModal,
  Button as ExistingButton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { WorkspaceArchiveError } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { useSource } from '../bindings'
import { AppClient, describe, unwrap } from '../model/client'
import { Button } from './kit'
import { FILES_PANEL } from './FileLibrary'
import { SKILLS_PANEL } from '../model/skills'
import s from '../App.module.css'
import { useProductLanguage } from '../model/product-language'
import { localizeHostError } from '../model/host-errors'
import type { ProductLanguage } from '../model/language'

const chatCopy = {
  搜索会话: {
    zh: '搜索会话',
    en: 'Search chats',
    it: 'Cerca chat',
  },
  技能: {
    zh: '技能',
    en: 'Skills',
    it: 'Competenze',
  },
  我的BOT: {
    zh: '我的BOT',
    en: 'My bots',
    it: 'I miei bot',
  },
  文件: {
    zh: '文件',
    en: 'Files',
    it: 'File',
  },
  我的聊天: {
    zh: '我的聊天',
    en: 'My chats',
    it: 'Le mie chat',
  },
  聊天记录: {
    zh: '聊天记录',
    en: 'Chat history',
    it: 'Cronologia chat',
  },
  新会话: {
    zh: '新会话',
    en: 'New chat',
    it: 'Nuova chat',
  },
  等待审批: {
    zh: '等待审批',
    en: 'Awaiting approval',
    it: 'In attesa di approvazione',
  },
  等待回答: {
    zh: '等待回答',
    en: 'Awaiting response',
    it: 'In attesa di risposta',
  },
  等待计划审核: {
    zh: '等待计划审核',
    en: 'Awaiting plan review',
    it: 'In attesa di revisione del piano',
  },
  等待浏览器操作: {
    zh: '等待浏览器操作',
    en: 'Browser needs attention',
    it: 'Il browser richiede attenzione',
  },
  运行中: {
    zh: '运行中',
    en: 'Running',
    it: 'In esecuzione',
  },
  回复已完成: {
    zh: '回复已完成',
    en: 'Response complete',
    it: 'Risposta completata',
  },
  '加载中…': {
    zh: '加载中…',
    en: 'Loading…',
    it: 'Caricamento…',
  },
  暂无聊天: {
    zh: '暂无聊天',
    en: 'No chats yet',
    it: 'Nessuna chat',
  },
  '该功能暂未开发，敬请期待': {
    zh: '该功能暂未开发，敬请期待',
    en: 'This feature is not available yet',
    it: 'Questa funzione non è ancora disponibile',
  },
  搜索聊天: {
    zh: '搜索聊天',
    en: 'Search chats',
    it: 'Cerca chat',
  },
  清空搜索: {
    zh: '清空搜索',
    en: 'Clear search',
    it: 'Cancella ricerca',
  },
  搜索结果: {
    zh: '搜索结果',
    en: 'Search results',
    it: 'Risultati di ricerca',
  },
  最近访问: {
    zh: '最近访问',
    en: 'Recent',
    it: 'Recenti',
  },
  '搜索中…': {
    zh: '搜索中…',
    en: 'Searching…',
    it: 'Ricerca…',
  },
  没有找到聊天: {
    zh: '没有找到聊天',
    en: 'No chats found',
    it: 'Nessuna chat trovata',
  },
  '结果较多，请继续输入缩小范围': {
    zh: '结果较多，请继续输入缩小范围',
    en: 'More results available; refine your search',
    it: 'Troppi risultati; precisa la ricerca',
  },
  重命名会话: {
    zh: '重命名会话',
    en: 'Rename chat',
    it: 'Rinomina chat',
  },
  会话名称: {
    zh: '会话名称',
    en: 'Chat name',
    it: 'Nome chat',
  },
  取消: {
    zh: '取消',
    en: 'Cancel',
    it: 'Annulla',
  },
  重命名: {
    zh: '重命名',
    en: 'Rename',
    it: 'Rinomina',
  },
  关闭: {
    zh: '关闭',
    en: 'Close',
    it: 'Chiudi',
  },
  删除会话: {
    zh: '删除会话',
    en: 'Delete chat',
    it: 'Elimina chat',
  },
  '停止并归档此会话？': {
    zh: '停止并归档此会话？',
    en: 'Stop and archive this chat?',
    it: 'Interrompere e archiviare questa chat?',
  },
  删除: {
    zh: '删除',
    en: 'Delete',
    it: 'Elimina',
  },
  停止并归档: {
    zh: '停止并归档',
    en: 'Stop and archive',
    it: 'Interrompi e archivia',
  },
  已置顶: {
    zh: '已置顶',
    en: 'Pinned',
    it: 'Fissata',
  },
  取消置顶: {
    zh: '取消置顶',
    en: 'Unpin',
    it: 'Rimuovi dai fissati',
  },
  置顶会话: {
    zh: '置顶会话',
    en: 'Pin chat',
    it: 'Fissa chat',
  },
  归档会话: {
    zh: '归档会话',
    en: 'Archive chat',
    it: 'Archivia chat',
  },
} as const
const chatText = (language: ProductLanguage, key: keyof typeof chatCopy) => chatCopy[key][language]

type Target = { id: SessionId; title: string }

/** Product chat navigation; Session ownership and commands stay with the existing DSH services. */
export function ChatSidebar({ client, wide }: { client: AppClient; wide: boolean }) {
  const language = useProductLanguage(client)
  const t = (key: keyof typeof chatCopy) => chatText(language, key)
  const { ctx } = client
  const sessions = useSource(ctx.sessions.list)
  const statuses = useSource(ctx.uiSession.sessionStatus)
  const workspaces = useSource(ctx.workspaces.list)
  const connection = useSource(client.connection.state)
  const panel = useSource(ctx.layout.panelInfo)
  const [rename, setRename] = useState<Target>()
  const [title, setTitle] = useState('')
  const [confirm, setConfirm] = useState<Target & { action: 'delete' | 'archive' }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notice, setNotice] = useState(0)
  const [matches, setMatches] = useState<Map<SessionId, string>>(new Map())
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchHasMore, setSearchHasMore] = useState(false)
  const saving = useRef(false)
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(
    () =>
      ctx.shortcuts.register({
        id: 'session.search' as ShortcutCommandId,
        label: () => t('搜索会话'),
        aliases: ['search sessions'],
        defaults: {
          'desktop:macos': { code: 'KeyK', modifiers: ['primary'] },
          'desktop:windows': { code: 'KeyK', modifiers: ['primary'] },
          'desktop:linux': { code: 'KeyK', modifiers: ['primary'] },
          'web:macos': { code: 'KeyK', modifiers: ['primary', 'alt'] },
          'web:windows': { code: 'KeyK', modifiers: ['primary', 'alt'] },
        },
        regions: ['page', 'editable'],
        modals: [],
        resolve: () => ({
          status: 'handled',
          run: () => setSearchOpen(true),
        }),
      }),
    [ctx, language],
  )
  useEffect(() => {
    const term = query.trim()
    setMatches(new Map())
    setSearchError('')
    setSearchHasMore(false)
    if (!term) {
      setSearching(false)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void ctx.sessions
        .search(term, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          setSearching(false)
          if (!result.ok) setSearchError(result.error.message)
          else {
            setMatches(new Map(result.value.items.map((item) => [item.sessionId, item.snippet])))
            setSearchHasMore(result.value.hasMore)
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setSearching(false)
            setSearchError(describe(reason))
          }
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [ctx.sessions, query])
  const pinned = new Set(workspaces.pinnedSessionIds)
  const archived = new Set(workspaces.archivedSessionIds)
  const current = sessions.ids.find((id) => (sessions.byId[id]?.retainedBy.mainView ?? 0) > 0)
  const ids = sessions.ids
    .filter((id) => !archived.has(id) && sessions.byId[id]?.origin !== 'subagent')
    .sort(
      (a, b) =>
        Number(pinned.has(b)) - Number(pinned.has(a)) ||
        (sessions.byId[b]?.updatedAt ?? 0) - (sessions.byId[a]?.updatedAt ?? 0),
    )
  const searchIds = ids
    .filter(
      (id) =>
        !query.trim() ||
        (sessions.byId[id]?.title ?? '').toLowerCase().includes(query.trim().toLowerCase()) ||
        matches.has(id),
    )
    .sort((a, b) => (sessions.byId[b]?.updatedAt ?? 0) - (sessions.byId[a]?.updatedAt ?? 0))
  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
  }
  const run = async (operation: () => Promise<unknown>) => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (reason) {
      setError(describe(reason))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const archive = async (target: Target) => {
    try {
      await ctx.uiWorkspace.archiveSession(target.id)
    } catch (reason) {
      if (
        reason instanceof WorkspaceArchiveError &&
        reason.rpcError.code === 'workspace/session-active'
      )
        setConfirm({ ...target, action: 'archive' })
      else throw reason
    }
  }
  return (
    <>
      {wide ? (
        <>
          <div className="tz-chat-navigation">
            <div className="tz-chat-features">
              <Button
                className="tz-chat-feature"
                aria-current={panel.activePanelId === SKILLS_PANEL ? 'page' : undefined}
                onClick={() => {
                  ctx.layout.selectPanel(SKILLS_PANEL)
                  if (window.matchMedia('(max-width: 600px)').matches) ctx.layout.toggleSidebar()
                }}
              >
                <IconSkillOutlineRegular size={18} aria-hidden="true" />
                {t('技能')}
              </Button>
              <Button className="tz-chat-feature" onClick={() => setNotice((value) => value + 1)}>
                <IconAgentPresetOutlineRegular size={18} aria-hidden="true" />
                {t('我的BOT')}
              </Button>
              <Button
                className="tz-chat-feature"
                aria-current={panel.activePanelId === FILES_PANEL ? 'page' : undefined}
                onClick={() => {
                  ctx.layout.selectPanel(FILES_PANEL)
                  if (window.matchMedia('(max-width: 600px)').matches) ctx.layout.toggleSidebar()
                }}
              >
                <IconFolderOpenOutlineRegular size={18} aria-hidden="true" />
                {t('文件')}
              </Button>
            </div>
            <div className="tz-chat-header">
              <span>{t('我的聊天')}</span>
              <Button
                className="tz-chat-search-trigger"
                aria-label={t('搜索会话')}
                onClick={() => setSearchOpen(true)}
              >
                <IconSearchOutlineRegular size={17} aria-hidden="true" />
              </Button>
            </div>
          </div>
          <nav className={`${s.history} tz-chat-history`} aria-label={t('聊天记录')}>
            {ids.map((id) => {
              const summary = sessions.byId[id]!
              const target = { id, title: summary.title?.trim() || t('新会话') }
              const status = statuses.get(id)
              const pending = status?.pendingInteraction?.kind
              const statusLabel =
                pending === 'browser'
                  ? t('等待浏览器操作')
                  : pending === 'approval'
                    ? t('等待审批')
                    : pending === 'question'
                      ? t('等待回答')
                      : pending === 'plan-review'
                        ? t('等待计划审核')
                        : (status?.running ?? summary.running)
                          ? t('运行中')
                          : status?.completionUnread
                            ? t('回复已完成')
                            : undefined
              return (
                <ChatRow
                  key={id}
                  language={language}
                  target={target}
                  updatedAt={summary.updatedAt}
                  selected={panel.activePanelId === null && id === current}
                  statusLabel={statusLabel}
                  pinned={pinned.has(id)}
                  disabled={busy || connection !== 'connected'}
                  onOpen={() => {
                    ctx.uiWorkspace.openSession(id)
                    if (window.matchMedia('(max-width: 600px)').matches) ctx.layout.toggleSidebar()
                  }}
                  onAction={(action) => {
                    if (action === 'rename') {
                      setError('')
                      setTitle(target.title)
                      setRename(target)
                    } else if (action === 'delete') {
                      setError('')
                      setConfirm({ ...target, action: 'delete' })
                    } else
                      void run(() =>
                        action === 'archive'
                          ? archive(target)
                          : pinned.has(id)
                            ? ctx.uiWorkspace.unpinSession(id)
                            : ctx.uiWorkspace.pinSession(id),
                      )
                  }}
                />
              )
            })}
            {sessions.phase !== 'ready' ? (
              <p className={s.emptyNav}>{t('加载中…')}</p>
            ) : !ids.length && !searchError ? (
              <p className={s.emptyNav}>{t('暂无聊天')}</p>
            ) : null}
          </nav>
        </>
      ) : null}
      {notice ? (
        <Toast key={notice} text={t('该功能暂未开发，敬请期待')} onDone={() => setNotice(0)} />
      ) : null}
      {searchOpen ? (
        <Modal.Backdrop
          isOpen
          isDismissable
          className="tz-settings-backdrop"
          onOpenChange={(open) => {
            if (!open) closeSearch()
          }}
        >
          <Modal.Container placement="center" className="tz-chat-search-container">
            <Modal.Dialog
              data-shortcut-modal="chat-search"
              aria-label={t('搜索聊天')}
              className="tz-chat-search-dialog"
            >
              <div className="tz-chat-search">
                <IconSearchOutlineRegular size={18} aria-hidden="true" />
                <Input
                  ref={searchInput}
                  autoFocus
                  className="tz-chat-search-input"
                  aria-label={t('搜索会话')}
                  placeholder={t('搜索聊天')}
                  value={query}
                  maxLength={500}
                  onChange={(event) => setQuery(event.target.value.replaceAll('\0', ''))}
                />
                {query ? (
                  <Button
                    className="tz-chat-search-clear"
                    aria-label={t('清空搜索')}
                    onClick={() => {
                      setQuery('')
                      searchInput.current?.focus()
                    }}
                  >
                    <IconCloseOutlineRegular size={14} />
                  </Button>
                ) : null}
              </div>
              <div className="tz-chat-search-caption">
                {query.trim() ? t('搜索结果') : t('最近访问')}
              </div>
              <div className="tz-chat-search-results">
                {searchIds.map((id) => {
                  const summary = sessions.byId[id]!
                  return (
                    <Button
                      key={id}
                      className="tz-chat-search-result"
                      disabled={busy || connection !== 'connected'}
                      onClick={() => {
                        ctx.uiWorkspace.openSession(id)
                        closeSearch()
                        if (wide && window.matchMedia('(max-width: 600px)').matches)
                          ctx.layout.toggleSidebar()
                      }}
                    >
                      <IconNewChatOutlineRegular size={18} aria-hidden="true" />
                      <span className="tz-chat-result-text">
                        <span>{summary.title?.trim() || t('新会话')}</span>
                        {matches.get(id) ? (
                          <span className="tz-chat-snippet">{matches.get(id)}</span>
                        ) : null}
                      </span>
                      <span className="tz-chat-result-time">
                        {formatTime(summary.updatedAt, language)}
                      </span>
                    </Button>
                  )
                })}
                {sessions.phase !== 'ready' ? (
                  <p className={s.emptyNav}>{t('加载中…')}</p>
                ) : !searchIds.length && !searchError ? (
                  <p className={s.emptyNav}>
                    {searching ? t('搜索中…') : query.trim() ? t('没有找到聊天') : t('暂无聊天')}
                  </p>
                ) : null}
                {searchError ? (
                  <p className="tz-chat-error" role="alert">
                    {
                      { zh: '搜索失败：', en: 'Search failed: ', it: 'Ricerca non riuscita: ' }[
                        language
                      ]
                    }
                    {localizeHostError(searchError, language)}
                  </p>
                ) : null}
                {searchHasMore ? (
                  <p className={s.emptyNav}>{t('结果较多，请继续输入缩小范围')}</p>
                ) : null}
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
      {error && !rename && !confirm ? (
        <p className="tz-chat-error" role="alert">
          {localizeHostError(error, language)}
        </p>
      ) : null}
      {rename ? (
        <Modal.Backdrop
          isOpen
          isDismissable={!busy}
          isKeyboardDismissDisabled={busy}
          onOpenChange={(open) => {
            if (!open && !busy) setRename(undefined)
          }}
        >
          <Modal.Container>
            <Modal.Dialog
              data-shortcut-modal="chat-rename"
              aria-label={t('重命名会话')}
              className="tz-confirm-dialog"
            >
              <Modal.Heading>{t('重命名会话')}</Modal.Heading>
              <Form
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(async () => {
                    await ctx.sessions.using(
                      rename.id,
                      { source: 'workspaceOperation' },
                      async (reference) => {
                        unwrap(await reference.binding.session.rename(title.trim()))
                      },
                    )
                    await ctx.sessions.refresh()
                    setRename(undefined)
                  })
                }}
              >
                <Input
                  aria-label={t('会话名称')}
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={busy}
                />
                {error ? <p role="alert">{localizeHostError(error, language)}</p> : null}
                <div className="tz-chat-dialog-actions">
                  <ExistingButton
                    variant="outline"
                    disabled={busy}
                    onClick={() => setRename(undefined)}
                  >
                    {t('取消')}
                  </ExistingButton>
                  <ExistingButton
                    variant="primary"
                    type="submit"
                    disabled={busy || !title.trim()}
                    aria-busy={busy}
                  >
                    {t('重命名')}
                  </ExistingButton>
                </div>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
      {confirm ? (
        <ExistingModal
          open
          onClose={() => {
            if (!busy) setConfirm(undefined)
          }}
          closeLabel={t('关闭')}
          shortcutModal="chat-delete"
          className="tz-chat-confirmation"
          title={confirm.action === 'delete' ? t('删除会话') : t('停止并归档此会话？')}
          footer={
            <>
              <ExistingButton
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm(undefined)}
              >
                {t('取消')}
              </ExistingButton>
              <ExistingButton
                variant="primary"
                className="tz-chat-confirm-action"
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void run(async () => {
                    if (confirm.action === 'delete') {
                      unwrap(await ctx.remote.platform.deleteConversation({ id: confirm.id }))
                      await ctx.sessions.refresh()
                    } else await ctx.uiWorkspace.archiveSession(confirm.id, { stopActivity: true })
                    setConfirm(undefined)
                  })
                }
              >
                {confirm.action === 'delete' ? t('删除') : t('停止并归档')}
              </ExistingButton>
            </>
          }
        >
          <div className="tz-chat-confirm-warning">
            <IconWarningOutlineRegular size={18} aria-hidden="true" />
            <p>
              {confirm.action === 'delete'
                ? {
                    zh: `删除“${confirm.title}”并停止相关任务，工作区文件保留。此聊天无法在界面中恢复。`,
                    en: `Delete “${confirm.title}” and stop its tasks? Workspace files are kept. This chat cannot be restored in the interface.`,
                    it: `Eliminare “${confirm.title}” e interrompere le relative attività? I file dell’area di lavoro saranno conservati. La chat non può essere ripristinata dall’interfaccia.`,
                  }[language]
                : {
                    zh: `停止“${confirm.title}”的任务并归档此聊天。`,
                    en: `Stop the tasks for “${confirm.title}” and archive this chat.`,
                    it: `Interrompi le attività di “${confirm.title}” e archivia questa chat.`,
                  }[language]}
            </p>
          </div>
          {error ? <p role="alert">{localizeHostError(error, language)}</p> : null}
        </ExistingModal>
      ) : null}
    </>
  )
}

function ChatRow({
  language,
  target,
  updatedAt,
  selected,
  statusLabel,
  pinned,
  disabled,
  onOpen,
  onAction,
}: {
  language: ProductLanguage
  target: Target
  updatedAt: number
  selected: boolean
  statusLabel?: string
  pinned: boolean
  disabled: boolean
  onOpen(): void
  onAction(action: string): void
}) {
  const [open, setOpen] = useState(false)
  const t = (key: keyof typeof chatCopy) => chatText(language, key)
  return (
    <div
      data-session-id={target.id}
      aria-current={selected ? 'page' : undefined}
      className={`${s.sessionLine} ${selected ? s.selected : ''}`}
      data-menu-open={open || undefined}
    >
      <Button className={s.historyRow} title={target.title} onClick={onOpen} disabled={disabled}>
        <span className="tz-chat-row-text">
          <span>{target.title}</span>
        </span>
        {statusLabel ? (
          <span className={s.activeDot} aria-label={statusLabel} title={statusLabel} />
        ) : pinned ? (
          <span className={s.sessionPin} aria-label={t('已置顶')}>
            <IconPinFillRegular size={14} />
          </span>
        ) : null}
        <span className="tz-chat-row-time">{formatTime(updatedAt, language)}</span>
      </Button>
      <Button
        className={`${s.sessionMenuButton} tz-chat-archive`}
        disabled={disabled}
        aria-label={
          {
            zh: `归档会话“${target.title}”`,
            en: `Archive chat ${target.title}`,
            it: `Archivia chat ${target.title}`,
          }[language]
        }
        onClick={() => onAction('archive')}
      >
        <IconArchiveOutlineRegular size={14} />
      </Button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        portal
        autoFocus
        align="end"
        items={[
          {
            id: 'pin',
            label: pinned ? t('取消置顶') : t('置顶会话'),
            icon: pinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />,
          },
          { id: 'rename', label: t('重命名'), icon: <IconEditOutlineRegular /> },
          { id: 'archive', label: t('归档会话'), icon: <IconArchiveOutlineRegular /> },
          { id: 'delete', label: t('删除会话'), danger: true, icon: <IconTrashOutlineRegular /> },
        ]}
        onSelect={(action) => {
          setOpen(false)
          onAction(action)
        }}
        anchor={
          <Button
            className={`${s.sessionMenuButton} tz-chat-menu`}
            disabled={disabled}
            aria-label={
              {
                zh: `会话“${target.title}”的操作`,
                en: `Actions for ${target.title}`,
                it: `Azioni per ${target.title}`,
              }[language]
            }
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <IconEllipsisOutlineRegular size={16} />
          </Button>
        }
      />
    </div>
  )
}

function formatTime(updatedAt: number, language: ProductLanguage): string {
  const { unit, n } = relativeTime(updatedAt, Date.now())
  if (unit === 'now') return { zh: '刚刚', en: 'Now', it: 'Ora' }[language]
  if (language === 'zh') {
    const labels = { minutes: '分钟', hours: '小时', days: '天', months: '个月', years: '年' }
    return `${n}${labels[unit]}`
  }
  const units = {
    minutes: 'minute',
    hours: 'hour',
    days: 'day',
    months: 'month',
    years: 'year',
  } as const
  return new Intl.RelativeTimeFormat(language, { numeric: 'always', style: 'short' }).format(
    -n,
    units[unit],
  )
}
