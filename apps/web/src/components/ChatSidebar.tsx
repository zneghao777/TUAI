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
import s from '../App.module.css'

type Target = { id: SessionId; title: string }

/** Product chat navigation; Session ownership and commands stay with the existing DSH services. */
export function ChatSidebar({ client, wide }: { client: AppClient; wide: boolean }) {
  const { ctx } = client
  const sessions = useSource(ctx.sessions.list)
  const statuses = useSource(ctx.uiSession.sessionStatus)
  const workspaces = useSource(ctx.workspaces.list)
  const connection = useSource(client.connection.state)
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
        label: () => '搜索会话',
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
    [ctx],
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
              <Button className="tz-chat-feature" onClick={() => setNotice((value) => value + 1)}>
                <IconSkillOutlineRegular size={18} aria-hidden="true" />
                技能
              </Button>
              <Button className="tz-chat-feature" onClick={() => setNotice((value) => value + 1)}>
                <IconAgentPresetOutlineRegular size={18} aria-hidden="true" />
                我的BOT
              </Button>
            </div>
            <div className="tz-chat-header">
              <span>我的聊天</span>
              <Button
                className="tz-chat-search-trigger"
                aria-label="搜索会话"
                onClick={() => setSearchOpen(true)}
              >
                <IconSearchOutlineRegular size={17} aria-hidden="true" />
              </Button>
            </div>
          </div>
          <nav className={`${s.history} tz-chat-history`} aria-label="聊天记录">
            {ids.map((id) => {
              const summary = sessions.byId[id]!
              const target = { id, title: summary.title?.trim() || '新会话' }
              const status = statuses.get(id)
              const pending = status?.pendingInteraction?.kind
              const statusLabel =
                pending === 'approval'
                  ? '等待审批'
                  : pending === 'question'
                    ? '等待回答'
                    : pending === 'plan-review'
                      ? '等待计划审核'
                      : (status?.running ?? summary.running)
                        ? '运行中'
                        : status?.completionUnread
                          ? '回复已完成'
                          : undefined
              return (
                <ChatRow
                  key={id}
                  target={target}
                  updatedAt={summary.updatedAt}
                  selected={id === current}
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
              <p className={s.emptyNav}>加载中…</p>
            ) : !ids.length && !searchError ? (
              <p className={s.emptyNav}>暂无聊天</p>
            ) : null}
          </nav>
        </>
      ) : null}
      {notice ? (
        <Toast key={notice} text="该功能暂未开发，敬请期待" onDone={() => setNotice(0)} />
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
              aria-label="搜索聊天"
              className="tz-chat-search-dialog"
            >
              <div className="tz-chat-search">
                <IconSearchOutlineRegular size={18} aria-hidden="true" />
                <Input
                  ref={searchInput}
                  autoFocus
                  className="tz-chat-search-input"
                  aria-label="搜索会话"
                  placeholder="搜索聊天"
                  value={query}
                  maxLength={500}
                  onChange={(event) => setQuery(event.target.value.replaceAll('\0', ''))}
                />
                {query ? (
                  <Button
                    className="tz-chat-search-clear"
                    aria-label="清空搜索"
                    onClick={() => {
                      setQuery('')
                      searchInput.current?.focus()
                    }}
                  >
                    <IconCloseOutlineRegular size={14} />
                  </Button>
                ) : null}
              </div>
              <div className="tz-chat-search-caption">{query.trim() ? '搜索结果' : '最近访问'}</div>
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
                        <span>{summary.title?.trim() || '新会话'}</span>
                        {matches.get(id) ? (
                          <span className="tz-chat-snippet">{matches.get(id)}</span>
                        ) : null}
                      </span>
                      <span className="tz-chat-result-time">{formatTime(summary.updatedAt)}</span>
                    </Button>
                  )
                })}
                {sessions.phase !== 'ready' ? (
                  <p className={s.emptyNav}>加载中…</p>
                ) : !searchIds.length && !searchError ? (
                  <p className={s.emptyNav}>
                    {searching ? '搜索中…' : query.trim() ? '没有找到聊天' : '暂无聊天'}
                  </p>
                ) : null}
                {searchError ? (
                  <p className="tz-chat-error" role="alert">
                    搜索失败：{searchError}
                  </p>
                ) : null}
                {searchHasMore ? <p className={s.emptyNav}>结果较多，请继续输入缩小范围</p> : null}
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
      {error && !rename && !confirm ? (
        <p className="tz-chat-error" role="alert">
          {error}
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
              aria-label="重命名会话"
              className="tz-confirm-dialog"
            >
              <Modal.Heading>重命名会话</Modal.Heading>
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
                  aria-label="会话名称"
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={busy}
                />
                {error ? <p role="alert">{error}</p> : null}
                <div className="tz-chat-dialog-actions">
                  <ExistingButton
                    variant="outline"
                    disabled={busy}
                    onClick={() => setRename(undefined)}
                  >
                    取消
                  </ExistingButton>
                  <ExistingButton
                    variant="primary"
                    type="submit"
                    disabled={busy || !title.trim()}
                    aria-busy={busy}
                  >
                    重命名
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
          closeLabel="关闭"
          shortcutModal="chat-delete"
          className="tz-chat-confirmation"
          title={confirm.action === 'delete' ? '删除会话' : '停止并归档此会话？'}
          footer={
            <>
              <ExistingButton
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm(undefined)}
              >
                取消
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
                {confirm.action === 'delete' ? '删除' : '停止并归档'}
              </ExistingButton>
            </>
          }
        >
          <div className="tz-chat-confirm-warning">
            <IconWarningOutlineRegular size={18} aria-hidden="true" />
            <p>
              {confirm.action === 'delete'
                ? `删除“${confirm.title}”并停止相关任务，工作区文件保留。此聊天无法在界面中恢复。`
                : `停止“${confirm.title}”的任务并归档此聊天。`}
            </p>
          </div>
          {error ? <p role="alert">{error}</p> : null}
        </ExistingModal>
      ) : null}
    </>
  )
}

function ChatRow({
  target,
  updatedAt,
  selected,
  statusLabel,
  pinned,
  disabled,
  onOpen,
  onAction,
}: {
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
          <span className={s.sessionPin} aria-label="已置顶">
            <IconPinFillRegular size={14} />
          </span>
        ) : null}
        <span className="tz-chat-row-time">{formatTime(updatedAt)}</span>
      </Button>
      <Button
        className={`${s.sessionMenuButton} tz-chat-archive`}
        disabled={disabled}
        aria-label={`归档会话“${target.title}”`}
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
            label: pinned ? '取消置顶' : '置顶会话',
            icon: pinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />,
          },
          { id: 'rename', label: '重命名', icon: <IconEditOutlineRegular /> },
          { id: 'archive', label: '归档会话', icon: <IconArchiveOutlineRegular /> },
          { id: 'delete', label: '删除会话', danger: true, icon: <IconTrashOutlineRegular /> },
        ]}
        onSelect={(action) => {
          setOpen(false)
          onAction(action)
        }}
        anchor={
          <Button
            className={`${s.sessionMenuButton} tz-chat-menu`}
            disabled={disabled}
            aria-label={`会话“${target.title}”的操作`}
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

function formatTime(updatedAt: number): string {
  const { unit, n } = relativeTime(updatedAt, Date.now())
  const labels = { minutes: '分钟', hours: '小时', days: '天', months: '个月', years: '年' }
  return unit === 'now' ? '刚刚' : `${n}${labels[unit]}`
}
