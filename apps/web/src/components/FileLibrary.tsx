import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertDialog, Button, Modal, Spinner } from '@heroui/react'
import {
  FileTypeIcon,
  IconTrashOutlineRegular,
  IconCloseOutlineRegular,
  IconCheckOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LibraryFile } from '@tianzhiai/web-host/types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSource } from '../bindings'
import { describe, unwrap, type AppClient } from '../model/client'
import './FileLibrary.css'

export const FILES_PANEL = brandString<MainPanelId>('tianzhiai-files')
type Sort = 'created' | 'name' | 'opened'
type Preview =
  | { kind: 'text'; value: string; eof: boolean }
  | { kind: 'url'; value: string }
  | { kind: 'unsupported' }
const itemKey = (file: LibraryFile) => JSON.stringify([file.sessionId, file.path])
const suffix = (name: string) => name.split('.').at(-1)?.toLowerCase() ?? ''
const isText = (name: string) => ['md', 'txt', 'csv'].includes(suffix(name))
const imageType = (name: string) =>
  ({
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  })[suffix(name)] ?? 'application/octet-stream'

function readOpened(storageKey: string): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)),
        )
      : {}
  } catch {
    return {}
  }
}

function SortIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h11M4 18h6" />
    </svg>
  )
}

function Thumb({ client, file }: { client: AppClient; file: LibraryFile }) {
  const element = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState<Preview>()
  useEffect(() => {
    const node = element.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true)
      },
      { rootMargin: '150px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let url: string | undefined
    setValue(undefined)
    if (file.kind === 'image' && file.bytes <= 8 * 1024 * 1024) {
      void client.ctx.remote.workspaceFiles
        .readBytes(file.sessionId, file.path, {}, controller.signal)
        .then(unwrap)
        .then((result) => {
          if (controller.signal.aborted || !result.eof) return
          url = URL.createObjectURL(
            new Blob([Uint8Array.from(result.data).buffer], { type: imageType(file.name) }),
          )
          setValue({ kind: 'url', value: url })
        })
        .catch(() => {})
    } else if (file.kind === 'document' && isText(file.name)) {
      void client.ctx.remote.workspaceFiles
        .read(file.sessionId, file.path, { limit: 30 }, controller.signal)
        .then(unwrap)
        .then((result) => {
          if (!controller.signal.aborted)
            setValue({ kind: 'text', value: result.text, eof: result.eof })
        })
        .catch(() => {})
    }
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [client, file.sessionId, file.path, file.name, file.kind, file.bytes, file.version, visible])
  return (
    <div className="tz-library-thumb" ref={element} aria-hidden="true">
      {value?.kind === 'url' ? (
        <img src={value.value} alt="" />
      ) : value?.kind === 'text' ? (
        <div className="tz-library-paper">{value.value}</div>
      ) : (
        <FileTypeIcon path={file.name} size={44} />
      )}
    </div>
  )
}

function PreviewDialog({
  client,
  file,
  onClose,
}: {
  client: AppClient
  file: LibraryFile
  onClose(): void
}) {
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [lifetime] = useState(() => new AbortController())
  useEffect(() => () => lifetime.abort(), [lifetime])
  useEffect(() => {
    const controller = new AbortController()
    let url: string | undefined
    if (isText(file.name)) {
      void client.ctx.remote.workspaceFiles
        .read(file.sessionId, file.path, {}, controller.signal)
        .then(unwrap)
        .then((result) => {
          if (!controller.signal.aborted)
            setPreview({ kind: 'text', value: result.text, eof: result.eof })
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(describe(e))
        })
    } else if (file.kind === 'image' || suffix(file.name) === 'pdf') {
      void client.ctx.remote.workspaceFiles
        .readBytes(file.sessionId, file.path, {}, controller.signal)
        .then(unwrap)
        .then((result) => {
          if (controller.signal.aborted) return
          if (!result.eof) throw new Error('未取得完整文件')
          url = URL.createObjectURL(
            new Blob([Uint8Array.from(result.data).buffer], {
              type: file.kind === 'image' ? imageType(file.name) : 'application/pdf',
            }),
          )
          setPreview({ kind: 'url', value: url })
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(describe(e))
        })
    } else setPreview({ kind: 'unsupported' })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [client, file])
  const openInConversation = async () => {
    const { fileAddressFor } = await import('@deepseek-ai/dsh-util-workspace-path')
    const cwd = client.ctx.sessions.list.getSnapshot().byId[file.sessionId]?.cwd
    client.ctx.uiWorkspace.openSession(file.sessionId)
    client.ctx.sidebarRight.openResource(fileAddressFor(file.sessionId, cwd, file.path))
    onClose()
  }
  const download = async () => {
    setDownloading(true)
    setError('')
    try {
      const result = unwrap(
        await client.ctx.remote.workspaceFiles.readBytes(
          file.sessionId,
          file.path,
          {},
          lifetime.signal,
        ),
      )
      if (!result.eof || result.offset !== 0) throw new Error('未取得完整文件')
      const url = URL.createObjectURL(new Blob([Uint8Array.from(result.data).buffer]))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      if (!lifetime.signal.aborted) setError(describe(e))
    } finally {
      if (!lifetime.signal.aborted) setDownloading(false)
    }
  }
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className="tz-library-backdrop"
    >
      <Modal.Container size="lg" placement="center" className="tz-library-preview-container">
        <Modal.Dialog aria-label={`预览 ${file.name}`} className="tz-library-preview">
          <header>
            <Modal.Heading>{file.name}</Modal.Heading>
            <Button
              variant="ghost"
              size="sm"
              isDisabled={downloading}
              onPress={() => void download()}
            >
              下载
            </Button>
            <Button variant="ghost" size="sm" onPress={() => void openInConversation()}>
              打开来源会话
            </Button>
            <Button variant="ghost" isIconOnly aria-label="关闭预览" onPress={onClose}>
              <IconCloseOutlineRegular size={18} />
            </Button>
          </header>
          <div className="tz-library-preview-body">
            {error ? (
              <p role="alert">{error}</p>
            ) : !preview ? (
              <Spinner aria-label="正在加载预览" />
            ) : preview.kind === 'url' ? (
              file.kind === 'image' ? (
                <img src={preview.value} alt={file.name} />
              ) : (
                <iframe src={preview.value} title={file.name} sandbox="" />
              )
            ) : preview.kind === 'text' ? (
              <article>
                {suffix(file.name) === 'md' ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>
                    {preview.value}
                  </Markdown>
                ) : (
                  <pre className="tz-library-text">{preview.value}</pre>
                )}
                {!preview.eof && <p>仅显示文件的前一部分，可在来源会话中继续查看。</p>}
              </article>
            ) : (
              <div>
                <p>此格式请在来源会话中预览。</p>
                <Button onPress={() => void openInConversation()}>打开预览</Button>
              </div>
            )}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

export function FileLibrary({ client }: { client: AppClient }) {
  const sessions = useSource(client.ctx.sessions.list)
  const host = useSource(client.facts).host
  const storageKey = `tianzhiai:file-opened:${host?.id ?? 'local'}`
  const [opened, setOpened] = useState<Record<string, number>>(() => readOpened(storageKey))
  const [files, setFiles] = useState<LibraryFile[]>([])
  const [kind, setKind] = useState<'document' | 'image'>('document')
  const [sort, setSort] = useState<Sort>('created')
  const [sortOpen, setSortOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<LibraryFile>()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadFailed(false)
    setError('')
    void client.ctx.remote.platform
      .libraryFiles(controller.signal)
      .then(unwrap)
      .then((next) => {
        if (!controller.signal.aborted) setFiles(next)
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setLoadFailed(true)
          setError(describe(e))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [client, revision])
  const visible = useMemo(
    () =>
      files
        .filter((f) => f.kind === kind)
        .sort((a, b) =>
          sort === 'name'
            ? a.name.localeCompare(b.name, 'zh-CN')
            : sort === 'opened'
              ? (opened[itemKey(b)] ?? 0) - (opened[itemKey(a)] ?? 0) ||
                (b.createdAt ?? 0) - (a.createdAt ?? 0)
              : (b.createdAt ?? 0) - (a.createdAt ?? 0),
        ),
    [files, kind, sort, opened],
  )
  const allSelected = visible.length > 0 && visible.every((file) => selected.has(itemKey(file)))
  const open = (file: LibraryFile) => {
    const next = { ...opened, [itemKey(file)]: Date.now() }
    setOpened(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* storage is optional */
    }
    setPreview(file)
  }
  const resetSelection = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const remove = async () => {
    setBusy(true)
    setError('')
    const targets = files.filter((f) => selected.has(itemKey(f)))
    const results = await Promise.allSettled(
      targets.map(async (f) =>
        unwrap(
          await client.ctx.remote.platform.deleteLibraryFile({
            sessionId: f.sessionId,
            path: f.path,
            version: f.version,
          }),
        ),
      ),
    )
    const failures = results.flatMap((result, i) =>
      result.status === 'rejected' ? [`${targets[i]!.name}：${describe(result.reason)}`] : [],
    )
    const failed = new Set(
      results.flatMap((result, i) => (result.status === 'rejected' ? [itemKey(targets[i]!)] : [])),
    )
    setFiles((current) =>
      current.filter((f) => !selected.has(itemKey(f)) || failed.has(itemKey(f))),
    )
    setSelected(failed)
    setConfirm(false)
    setBusy(false)
    if (failures.length) setError(`部分文件未删除：${failures.join('；')}`)
    else resetSelection()
  }
  return (
    <section className="tz-library" aria-label="文件">
      <header className="tz-library-header">
        <h1>{selecting ? `已选 ${selected.size} 项` : '文件'}</h1>
        <div className="tz-library-actions">
          {!selecting ? (
            <>
              <Menu
                open={sortOpen}
                selectedId={sort}
                items={[
                  { id: 'created', label: '创建时间' },
                  { id: 'name', label: '标题' },
                  { id: 'opened', label: '最近打开' },
                ]}
                onSelect={(id) => {
                  if (id === 'created' || id === 'name' || id === 'opened') setSort(id)
                  setSortOpen(false)
                }}
                onClose={() => setSortOpen(false)}
                align="end"
                side="bottom"
                portal
                anchor={
                  <Button
                    variant="ghost"
                    isIconOnly
                    aria-label="排序"
                    aria-expanded={sortOpen}
                    className="tz-library-icon"
                    onPress={() => setSortOpen((open) => !open)}
                  >
                    <SortIcon />
                  </Button>
                }
              />
              <Button
                variant="ghost"
                className="tz-library-glass"
                onPress={() => setSelecting(true)}
              >
                选择
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="danger"
                isDisabled={!selected.size || busy}
                onPress={() => setConfirm(true)}
              >
                <IconTrashOutlineRegular size={16} />
                删除
              </Button>
              <Button
                variant="ghost"
                className="tz-library-glass"
                onPress={() => setSelected(allSelected ? new Set() : new Set(visible.map(itemKey)))}
              >
                {allSelected ? '取消全选' : '全选'}
              </Button>
              <Button variant="ghost" isIconOnly aria-label="退出选择" onPress={resetSelection}>
                <IconCloseOutlineRegular size={18} />
              </Button>
            </>
          )}
        </div>
      </header>
      <div role="tablist" aria-label="文件分类" className="tz-library-tabs">
        {(['document', 'image'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={kind === value}
            tabIndex={kind === value ? 0 : -1}
            type="button"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const next = value === 'document' ? 'image' : 'document'
              setKind(next)
              resetSelection()
              const tabs =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                )
              tabs?.[next === 'document' ? 0 : 1]?.focus()
            }}
            onClick={() => {
              setKind(value)
              resetSelection()
            }}
          >
            {value === 'document' ? '文档' : '图片'}
          </button>
        ))}
      </div>
      {error && (
        <div className="tz-library-error" role="alert">
          {error}
          <Button variant="ghost" size="sm" onPress={() => setRevision((v) => v + 1)}>
            重试
          </Button>
        </div>
      )}
      {loading ? (
        <div className="tz-library-empty">
          <Spinner aria-label="正在加载文件" />
        </div>
      ) : loadFailed ? null : !visible.length ? (
        <div className="tz-library-empty">
          {kind === 'document' ? '暂无已登记文档' : '暂无已登记图片'}
        </div>
      ) : (
        <div className="tz-library-grid">
          {visible.map((file) => {
            const key = itemKey(file),
              chosen = selected.has(key)
            return (
              <button
                type="button"
                className="tz-library-card"
                data-selected={chosen || undefined}
                key={key}
                aria-pressed={selecting ? chosen : undefined}
                onClick={() => {
                  if (!selecting) return open(file)
                  setSelected((current) => {
                    const next = new Set(current)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }}
              >
                <Thumb client={client} file={file} />
                {selecting && (
                  <span className="tz-library-check" aria-hidden="true">
                    {chosen ? <IconCheckOutlineRegular size={15} /> : null}
                  </span>
                )}
                <span className="tz-library-card-info">
                  <FileTypeIcon path={file.name} size={23} />
                  <span>
                    <strong title={file.name}>{file.name}</strong>
                    <small>{sessions.byId[file.sessionId]?.title || '会话'}</small>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {preview && (
        <PreviewDialog client={client} file={preview} onClose={() => setPreview(undefined)} />
      )}
      {confirm && (
        <AlertDialog.Backdrop
          isOpen
          isDismissable={!busy}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirm(false)
          }}
        >
          <AlertDialog.Container>
            <AlertDialog.Dialog aria-label="删除文件" className="tz-confirm-dialog">
              <AlertDialog.Heading>删除 {selected.size} 个文件？</AlertDialog.Heading>
              <p>将永久删除工作区中的原文件，此操作无法恢复。会话消息中的附件不会删除。</p>
              <Button variant="ghost" isDisabled={busy} onPress={() => setConfirm(false)}>
                取消
              </Button>
              <Button variant="danger" isDisabled={busy} onPress={() => void remove()}>
                {busy ? '正在删除…' : '永久删除'}
              </Button>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      )}
    </section>
  )
}
