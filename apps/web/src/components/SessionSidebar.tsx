/** Managed-workspace navigation using DSH's original Session menu and dialogs. */
import { useState, type ComponentProps } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPinFillRegular,
  Menu,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  PinSessionMenuItem,
  RenameSessionMenuItem,
  ForkSessionMenuItem,
  ArchiveSessionMenuItem,
  SessionIdMenuItem,
  SessionRenameDialog,
  SessionArchiveConfirmDialog,
  type SessionRenameTarget,
  type SessionArchiveConfirmRequest,
} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { WorkspaceArchiveError } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { AppClient, describe, unwrap } from '../model/client'
import { useSource } from '../bindings'
import { Button } from './kit'
import s from '../App.module.css'

export function SessionSidebar({
  standard,
  client,
  search,
  selected,
  onSelect,
  onArchived,
  onError,
}: {
  standard: GlobalStandardProps
  client: AppClient
  search: string
  selected?: SessionId
  onSelect(id: SessionId): Promise<void>
  onArchived(id: SessionId): Promise<void>
  onError(message: string): void
}) {
  const sessions = useSource(client.ctx.sessions.list)
  const workspaces = useSource(client.ctx.workspaces.list)
  const [showArchived, setShowArchived] = useState(false)
  const [rename, setRename] = useState<SessionRenameTarget | null>(null)
  const [archive, setArchive] = useState<SessionArchiveConfirmRequest | null>(null)
  const t = client.ctx.locale.bind('workspace')
  const run = (operation: Promise<unknown>) => {
    void operation.catch((error) => onError(describe(error)))
  }
  const archiveSession = (id: SessionId) => {
    void client.ctx.workspaces
      .archiveSession(id)
      .then(() => onArchived(id))
      .catch((error) => {
        if (
          error instanceof WorkspaceArchiveError &&
          error.rpcError.code === 'workspace/session-active'
        ) {
          setArchive({
            sessionId: id,
            displayTitle: sessions.byId[id]?.title ?? '新会话',
            activity: error.rpcError.details.activity,
          })
        } else onError(describe(error))
      })
  }
  const pinned = new Set(workspaces.pinnedSessionIds)
  const archived = new Set(workspaces.archivedSessionIds)
  const visible = sessions.ids.filter(
    (id) =>
      archived.has(id) === showArchived &&
      (!search ||
        (sessions.byId[id]?.title ?? '新会话')
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())),
  )
  const actions = {
    archiveSession,
    unarchiveSession: (id: SessionId) => run(client.ctx.workspaces.unarchiveSession(id)),
    pinSession: (id: SessionId) => run(client.ctx.workspaces.pinSession(id)),
    unpinSession: (id: SessionId) => run(client.ctx.workspaces.unpinSession(id)),
    requestSessionRename: (id: SessionId, title: string) =>
      setRename({ sessionId: id, currentTitle: title }),
    forkSession: (id: SessionId) =>
      run(client.ctx.sessions.fork({ sessionId: id, increaseTitle: true }).then(onSelect)),
    copySessionId: async (id: SessionId) => {
      if (!(await writeClipboard(id))) onError('无法复制会话 ID')
    },
  }
  const row = (id: SessionId) => (
    <SessionRow
      standard={standard}
      key={id}
      id={id}
      title={sessions.byId[id]?.title ?? '新会话'}
      client={client}
      selected={id === selected}
      running={sessions.byId[id]?.running ?? false}
      archived={archived.has(id)}
      pinned={pinned.has(id)}
      onSelect={onSelect}
      actions={actions}
    />
  )
  const accounted = new Set(workspaces.items.flatMap((workspace) => workspace.sessionIds))
  const groups = workspaces.items
    .map((workspace) => ({
      workspace,
      ids: visible.filter((id) => workspace.sessionIds.includes(id) && !pinned.has(id)),
    }))
    .filter((group) => group.ids.length)
  return (
    <>
      <div className={s.historyControls}>
        <span>{showArchived ? '已归档' : '工作区'}</span>
        <Button onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? '返回会话' : '已归档'}
        </Button>
      </div>
      <nav className={s.history} aria-label="会话历史">
        {visible.filter((id) => pinned.has(id)).map(row)}
        {groups.map(({ workspace, ids }) =>
          workspace.sessionIds.length === 1 ? (
            ids.map(row)
          ) : (
            <details open key={workspace.workspaceId} className={s.workspaceGroup}>
              <summary>
                <IconChevronDownOutlineRegular size={14} />
                <span>{sessions.byId[workspace.sessionIds[0]!]?.title ?? '新会话'}</span>
              </summary>
              {ids.map(row)}
            </details>
          ),
        )}
        {visible.filter((id) => !accounted.has(id) && !pinned.has(id)).map(row)}
        {!visible.length ? (
          <p className={s.emptyNav}>
            {search ? '没有匹配的会话' : showArchived ? '暂无归档会话' : '暂无会话'}
          </p>
        ) : null}
      </nav>
      <SessionRenameDialog
        {...standard}
        t={t}
        useRenameRequest={(selector) => selector(rename)}
        settleSessionRename={() => setRename(null)}
        renameSession={async (id, title) => {
          const reference = client.ctx.sessions.retain(id, { source: 'mainView' })
          try {
            const binding = await reference.ready
            unwrap(await binding.session.rename(title))
            await client.ctx.sessions.refresh()
          } finally {
            reference.release()
          }
        }}
      />
      <SessionArchiveConfirmDialog
        {...standard}
        t={t}
        useArchiveRequest={(selector) => selector(archive)}
        settleSessionArchive={() => setArchive(null)}
        stopAndArchiveSession={async (id) => {
          await client.ctx.workspaces.archiveSession(id, { stopActivity: true })
          await onArchived(id)
        }}
      />
    </>
  )
}

type Actions = Pick<ComponentProps<typeof PinSessionMenuItem>, 'pinSession' | 'unpinSession'> &
  Pick<ComponentProps<typeof RenameSessionMenuItem>, 'requestSessionRename'> &
  Pick<ComponentProps<typeof ForkSessionMenuItem>, 'forkSession'> &
  Pick<ComponentProps<typeof ArchiveSessionMenuItem>, 'archiveSession' | 'unarchiveSession'> &
  Pick<ComponentProps<typeof SessionIdMenuItem>, 'copySessionId'>

function SessionRow({
  standard,
  client,
  id,
  title,
  selected,
  running,
  archived,
  pinned,
  onSelect,
  actions,
}: {
  standard: GlobalStandardProps
  client: AppClient
  id: SessionId
  title: string
  selected: boolean
  running: boolean
  archived: boolean
  pinned: boolean
  onSelect(id: SessionId): Promise<void>
  actions: Actions
}) {
  const [open, setOpen] = useState(false)
  const props = {
    ...standard,
    sessionId: id,
    displayTitle: title,
    t: client.ctx.locale.bind('workspace'),
    useMenuOpenState: () => [open, setOpen] as const,
    useShortcuts: <T,>(
      selector: (rows: ReturnType<typeof client.ctx.shortcuts.catalog.getSnapshot>) => T,
    ) => selector(useSource(client.ctx.shortcuts.catalog)),
    usePinned: <T,>(selector: (ids: ReadonlySet<SessionId>) => T) =>
      selector(new Set(pinned ? [id] : [])),
    useArchived: <T,>(selector: (ids: ReadonlySet<SessionId>) => T) =>
      selector(new Set(archived ? [id] : [])),
    ...actions,
  }
  return (
    <div
      className={`${s.sessionLine} ${selected ? s.selected : ''}`}
      data-menu-open={open || undefined}
    >
      <button
        data-session-id={id}
        className={s.historyRow}
        title={title}
        aria-current={selected ? 'page' : undefined}
        onClick={() => {
          if (!archived) void onSelect(id)
        }}
        disabled={archived}
      >
        <span>{title}</span>
        {running ? (
          <span className={s.activeDot} aria-label="运行中" />
        ) : pinned ? (
          <span className={s.sessionPin} aria-label="已置顶">
            <IconPinFillRegular size={14} />
          </span>
        ) : null}
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        portal
        autoFocus
        align="end"
        anchor={
          <button
            type="button"
            className={s.sessionMenuButton}
            aria-label={`${title}的会话操作`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <IconEllipsisOutlineRegular size={16} />
          </button>
        }
      >
        <PinSessionMenuItem {...props} />
        <RenameSessionMenuItem {...props} />
        <ForkSessionMenuItem {...props} />
        <ArchiveSessionMenuItem {...props} />
        <SessionIdMenuItem {...props} />
      </Menu>
    </div>
  )
}
