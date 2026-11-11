import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertDialog, Button, Modal, Spinner } from '@heroui/react'
import {
  FileTypeIcon,
  IconTrashOutlineRegular,
  IconCloseOutlineRegular,
  IconCheckOutlineRegular,
  IconDownloadOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LibraryFile } from '@tuai/web-host/types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSource } from '../bindings'
import { describe, unwrap, type AppClient } from '../model/client'
import './FileLibrary.css'
import { useProductLanguage } from '../model/product-language'
import { localizeHostError } from '../model/host-errors'

const libraryCopy: Record<string, readonly [string, string]> = {
  图片附件不可用: ['Image attachment unavailable', 'Allegato immagine non disponibile'],
  图片附件不存在或无法读取: [
    'Image attachment does not exist or cannot be read',
    'L’allegato immagine non esiste o non può essere letto',
  ],
  关闭预览: ['Close preview', 'Chiudi anteprima'],
  删除图片: ['Delete image', 'Elimina immagine'],
  下载图片: ['Download image', 'Scarica immagine'],
  上一张图片: ['Previous image', 'Immagine precedente'],
  下一张图片: ['Next image', 'Immagine successiva'],
  正在加载预览: ['Loading preview', 'Caricamento anteprima'],
  图片无法预览: ['Cannot preview image', 'Impossibile visualizzare l’immagine'],
  下载: ['Download', 'Scarica'],
  打开来源会话: ['Open source chat', 'Apri chat di origine'],
  '仅显示文件的前一部分，可在来源会话中继续查看。': [
    'Only the beginning of the file is shown. Open the source chat to see more.',
    'È mostrata solo la prima parte del file. Apri la chat di origine per vedere il resto.',
  ],
  '此格式请在来源会话中预览。': [
    'Preview this format in the source chat.',
    'Visualizza questo formato nella chat di origine.',
  ],
  打开预览: ['Open preview', 'Apri anteprima'],
  文件: ['Files', 'File'],
  创建时间: ['Created', 'Data di creazione'],
  标题: ['Name', 'Nome'],
  最近打开: ['Recently opened', 'Aperti di recente'],
  排序: ['Sort', 'Ordina'],
  选择: ['Select', 'Seleziona'],
  删除: ['Delete', 'Elimina'],
  取消全选: ['Deselect all', 'Deseleziona tutto'],
  全选: ['Select all', 'Seleziona tutto'],
  退出选择: ['Exit selection', 'Esci dalla selezione'],
  文件分类: ['File categories', 'Categorie di file'],
  文档: ['Documents', 'Documenti'],
  图片: ['Images', 'Immagini'],
  重试: ['Retry', 'Riprova'],
  正在加载文件: ['Loading files', 'Caricamento file'],
  暂无已登记文档: ['No registered documents', 'Nessun documento registrato'],
  暂无已登记图片: ['No registered images', 'Nessuna immagine registrata'],
  会话: ['Chat', 'Chat'],
  删除文件: ['Delete files', 'Elimina file'],
  '将永久删除工作区中的原文件，此操作无法恢复。': [
    'The original files in the workspace will be permanently deleted. This cannot be undone.',
    'I file originali nell’area di lavoro saranno eliminati definitivamente. L’operazione non può essere annullata.',
  ],
  '将从文件页移除所选图片。': [
    'The selected images will be removed from Files.',
    'Le immagini selezionate saranno rimosse dai File.',
  ],
  '会话消息中的附件会保留。': [
    'Attachments in chat messages will remain.',
    'Gli allegati nei messaggi della chat saranno conservati.',
  ],
  取消: ['Cancel', 'Annulla'],
  '正在删除…': ['Deleting…', 'Eliminazione…'],
  永久删除: ['Delete permanently', 'Elimina definitivamente'],
  移除: ['Remove', 'Rimuovi'],
  未取得完整文件: ['Could not retrieve the complete file', 'Impossibile ottenere il file completo'],
}

export const FILES_PANEL = brandString<MainPanelId>('tianzhiai-files')
type Sort = 'created' | 'name' | 'opened'
type Preview =
  | { kind: 'text'; value: string; eof: boolean }
  | { kind: 'url'; value: string }
  | { kind: 'unsupported' }
const itemKey = (file: LibraryFile) => JSON.stringify([file.sessionId, file.source, file.path])
const artifactUrl = (file: LibraryFile) =>
  `api/artifact?${new URLSearchParams({ sessionId: file.sessionId, artifactId: file.artifactId ?? '' })}`
async function readAttachment(file: LibraryFile, signal: AbortSignal): Promise<Blob> {
  if (!file.artifactId) throw new Error('图片附件不可用')
  const response = await fetch(artifactUrl(file), { signal })
  if (!response.ok) throw new Error('图片附件不存在或无法读取')
  return response.blob()
}
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
    if (file.source === 'attachment' && file.bytes <= 8 * 1024 * 1024) {
      void readAttachment(file, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted) return
          url = URL.createObjectURL(blob)
          setValue({ kind: 'url', value: url })
        })
        .catch(() => {})
    } else if (file.kind === 'image' && file.bytes <= 8 * 1024 * 1024) {
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
  }, [client, file, visible])
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
  onPrevious,
  onNext,
  onRemove,
}: {
  client: AppClient
  file: LibraryFile
  onClose(): void
  onPrevious?: () => void
  onNext?: () => void
  onRemove(): void
}) {
  const language = useProductLanguage(client)
  const tr = (text: string) =>
    language === 'zh' ? text : (libraryCopy[text]?.[language === 'en' ? 0 : 1] ?? text)
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [lifetime] = useState(() => new AbortController())
  useEffect(() => () => lifetime.abort(), [lifetime])
  useEffect(() => {
    if (file.kind !== 'image') return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault()
        onPrevious()
      }
      if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [file.kind, onClose, onPrevious, onNext])
  useEffect(() => {
    const controller = new AbortController()
    let url: string | undefined
    setPreview(undefined)
    setError('')
    if (file.source === 'attachment') {
      void readAttachment(file, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted) return
          url = URL.createObjectURL(blob)
          setPreview({ kind: 'url', value: url })
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(tr(describe(e)))
        })
    } else if (isText(file.name)) {
      void client.ctx.remote.workspaceFiles
        .read(file.sessionId, file.path, {}, controller.signal)
        .then(unwrap)
        .then((result) => {
          if (!controller.signal.aborted)
            setPreview({ kind: 'text', value: result.text, eof: result.eof })
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(tr(describe(e)))
        })
    } else if (file.kind === 'image' || suffix(file.name) === 'pdf') {
      void client.ctx.remote.workspaceFiles
        .readBytes(file.sessionId, file.path, {}, controller.signal)
        .then(unwrap)
        .then((result) => {
          if (controller.signal.aborted) return
          if (!result.eof) throw new Error(tr('未取得完整文件'))
          url = URL.createObjectURL(
            new Blob([Uint8Array.from(result.data).buffer], {
              type: file.kind === 'image' ? imageType(file.name) : 'application/pdf',
            }),
          )
          setPreview({ kind: 'url', value: url })
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(tr(describe(e)))
        })
    } else setPreview({ kind: 'unsupported' })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [client, file])
  const openInConversation = async () => {
    if (file.source === 'attachment') {
      client.ctx.uiWorkspace.openSession(file.sessionId)
      onClose()
      return
    }
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
      let blob: Blob
      if (file.source === 'attachment') blob = await readAttachment(file, lifetime.signal)
      else {
        const result = unwrap(
          await client.ctx.remote.workspaceFiles.readBytes(
            file.sessionId,
            file.path,
            {},
            lifetime.signal,
          ),
        )
        if (!result.eof || result.offset !== 0) throw new Error(tr('未取得完整文件'))
        blob = new Blob([Uint8Array.from(result.data).buffer])
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      if (!lifetime.signal.aborted) setError(tr(describe(e)))
    } finally {
      if (!lifetime.signal.aborted) setDownloading(false)
    }
  }
  if (file.kind === 'image') {
    return (
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        className="tz-library-image-backdrop"
      >
        <Modal.Container className="tz-library-image-container">
          <Modal.Dialog
            aria-label={`${{ zh: '预览', en: 'Preview', it: 'Anteprima' }[language]} ${file.name}`}
            className="tz-library-image-viewer"
          >
            <Button
              variant="ghost"
              isIconOnly
              aria-label={tr('关闭预览')}
              className="tz-image-action tz-image-close"
              onPress={onClose}
            >
              <IconCloseOutlineRegular size={18} />
            </Button>
            <div className="tz-image-tools">
              <Button
                variant="ghost"
                isIconOnly
                aria-label={tr('删除图片')}
                className="tz-image-action"
                onPress={onRemove}
              >
                <IconTrashOutlineRegular size={18} />
              </Button>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={tr('下载图片')}
                className="tz-image-action"
                isDisabled={downloading}
                onPress={() => void download()}
              >
                <IconDownloadOutlineRegular size={18} />
              </Button>
            </div>
            {onPrevious && (
              <Button
                variant="ghost"
                isIconOnly
                aria-label={tr('上一张图片')}
                className="tz-image-action tz-image-previous"
                onPress={onPrevious}
              >
                <IconChevronLeftOutlineRegular size={20} />
              </Button>
            )}
            {onNext && (
              <Button
                variant="ghost"
                isIconOnly
                aria-label={tr('下一张图片')}
                className="tz-image-action tz-image-next"
                onPress={onNext}
              >
                <IconChevronRightOutlineRegular size={20} />
              </Button>
            )}
            <div className="tz-image-stage">
              {error ? (
                <p role="alert">{localizeHostError(error, language)}</p>
              ) : !preview ? (
                <Spinner aria-label={tr('正在加载预览')} />
              ) : preview.kind === 'url' ? (
                <img
                  src={preview.value}
                  alt={file.name}
                  onError={() => setError(tr('图片无法预览'))}
                />
              ) : (
                <p role="alert">{tr('图片无法预览')}</p>
              )}
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    )
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
        <Modal.Dialog
          aria-label={`${{ zh: '预览', en: 'Preview', it: 'Anteprima' }[language]} ${file.name}`}
          className="tz-library-preview"
        >
          <header>
            <Modal.Heading>{file.name}</Modal.Heading>
            <Button
              variant="ghost"
              size="sm"
              isDisabled={downloading}
              onPress={() => void download()}
            >
              {tr('下载')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => void openInConversation()}>
              {tr('打开来源会话')}
            </Button>
            <Button variant="ghost" isIconOnly aria-label={tr('关闭预览')} onPress={onClose}>
              <IconCloseOutlineRegular size={18} />
            </Button>
          </header>
          <div className="tz-library-preview-body">
            {error ? (
              <p role="alert">{localizeHostError(error, language)}</p>
            ) : !preview ? (
              <Spinner aria-label={tr('正在加载预览')} />
            ) : preview.kind === 'url' ? (
              <iframe src={preview.value} title={file.name} sandbox="" />
            ) : preview.kind === 'text' ? (
              <article>
                {suffix(file.name) === 'md' ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>
                    {preview.value}
                  </Markdown>
                ) : (
                  <pre className="tz-library-text">{preview.value}</pre>
                )}
                {!preview.eof && <p>{tr('仅显示文件的前一部分，可在来源会话中继续查看。')}</p>}
              </article>
            ) : (
              <div>
                <p>{tr('此格式请在来源会话中预览。')}</p>
                <Button onPress={() => void openInConversation()}>{tr('打开预览')}</Button>
              </div>
            )}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

export function FileLibrary({ client }: { client: AppClient }) {
  const language = useProductLanguage(client)
  const tr = (text: string) =>
    language === 'zh' ? text : (libraryCopy[text]?.[language === 'en' ? 0 : 1] ?? text)
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
          setError(tr(describe(e)))
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
            ? a.name.localeCompare(b.name, language === 'zh' ? 'zh-CN' : language)
            : sort === 'opened'
              ? (opened[itemKey(b)] ?? 0) - (opened[itemKey(a)] ?? 0) ||
                (b.createdAt ?? 0) - (a.createdAt ?? 0)
              : (b.createdAt ?? 0) - (a.createdAt ?? 0),
        ),
    [files, kind, sort, opened, language],
  )
  const allSelected = visible.length > 0 && visible.every((file) => selected.has(itemKey(file)))
  const previewIndex = preview
    ? visible.findIndex((file) => itemKey(file) === itemKey(preview))
    : -1
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
            source: f.source,
            path: f.path,
            version: f.version,
          }),
        ),
      ),
    )
    const failures = results.flatMap((result, i) =>
      result.status === 'rejected'
        ? [`${targets[i]!.name}：${localizeHostError(describe(result.reason), language)}`]
        : [],
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
    if (failures.length)
      setError(
        `${{ zh: '部分文件未删除：', en: 'Some files were not deleted: ', it: 'Alcuni file non sono stati eliminati: ' }[language]}${failures.join('; ')}`,
      )
    else resetSelection()
  }
  return (
    <section className="tz-library" aria-label={tr('文件')}>
      <header className="tz-library-header">
        <h1>
          {selecting
            ? {
                zh: `已选 ${selected.size} 项`,
                en: `${selected.size} selected`,
                it: `${selected.size} selezionati`,
              }[language]
            : tr('文件')}
        </h1>
        <div className="tz-library-actions">
          {!selecting ? (
            <>
              <Menu
                open={sortOpen}
                selectedId={sort}
                items={[
                  { id: 'created', label: tr('创建时间') },
                  { id: 'name', label: tr('标题') },
                  { id: 'opened', label: tr('最近打开') },
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
                    aria-label={tr('排序')}
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
                {tr('选择')}
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
                {tr('删除')}
              </Button>
              <Button
                variant="ghost"
                className="tz-library-glass"
                onPress={() => setSelected(allSelected ? new Set() : new Set(visible.map(itemKey)))}
              >
                {allSelected ? tr('取消全选') : tr('全选')}
              </Button>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={tr('退出选择')}
                onPress={resetSelection}
              >
                <IconCloseOutlineRegular size={18} />
              </Button>
            </>
          )}
        </div>
      </header>
      <div role="tablist" aria-label={tr('文件分类')} className="tz-library-tabs">
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
            {value === 'document' ? tr('文档') : tr('图片')}
          </button>
        ))}
      </div>
      {error && (
        <div className="tz-library-error" role="alert">
          {localizeHostError(error, language)}
          <Button variant="ghost" size="sm" onPress={() => setRevision((v) => v + 1)}>
            {tr('重试')}
          </Button>
        </div>
      )}
      {loading ? (
        <div className="tz-library-empty">
          <Spinner aria-label={tr('正在加载文件')} />
        </div>
      ) : loadFailed ? null : !visible.length ? (
        <div className="tz-library-empty">
          {kind === 'document' ? tr('暂无已登记文档') : tr('暂无已登记图片')}
        </div>
      ) : (
        <div className="tz-library-grid">
          {visible.map((file) => {
            const key = itemKey(file),
              chosen = selected.has(key)
            return (
              <button
                type="button"
                className={`tz-library-card${file.kind === 'image' ? ' tz-library-image-card' : ''}`}
                data-selected={chosen || undefined}
                key={key}
                aria-label={
                  file.kind === 'image'
                    ? `${file.name}，${sessions.byId[file.sessionId]?.title || tr('会话')}`
                    : undefined
                }
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
                {file.kind === 'document' && (
                  <span className="tz-library-card-info">
                    <FileTypeIcon path={file.name} size={23} />
                    <span>
                      <strong title={file.name}>{file.name}</strong>
                      <small>{sessions.byId[file.sessionId]?.title || tr('会话')}</small>
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {preview && (
        <PreviewDialog
          client={client}
          file={preview}
          onClose={() => setPreview(undefined)}
          onPrevious={
            preview.kind === 'image' && previewIndex > 0
              ? () => open(visible[previewIndex - 1]!)
              : undefined
          }
          onNext={
            preview.kind === 'image' && previewIndex >= 0 && previewIndex < visible.length - 1
              ? () => open(visible[previewIndex + 1]!)
              : undefined
          }
          onRemove={() => {
            setSelected(new Set([itemKey(preview)]))
            setPreview(undefined)
            setConfirm(true)
          }}
        />
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
            <AlertDialog.Dialog aria-label={tr('删除文件')} className="tz-confirm-dialog">
              <AlertDialog.Heading>
                {
                  {
                    zh: `删除 ${selected.size} 个文件？`,
                    en: `Delete ${selected.size} files?`,
                    it: `Eliminare ${selected.size} file?`,
                  }[language]
                }
              </AlertDialog.Heading>
              <p>
                {files.some((file) => selected.has(itemKey(file)) && file.source === 'workspace')
                  ? tr('将永久删除工作区中的原文件，此操作无法恢复。')
                  : tr('将从文件页移除所选图片。')}
                {language === 'zh' ? '' : ' '}
                {tr('会话消息中的附件会保留。')}
              </p>
              <Button variant="ghost" isDisabled={busy} onPress={() => setConfirm(false)}>
                {tr('取消')}
              </Button>
              <Button variant="danger" isDisabled={busy} onPress={() => void remove()}>
                {busy
                  ? tr('正在删除…')
                  : files.some((file) => selected.has(itemKey(file)) && file.source === 'workspace')
                    ? tr('永久删除')
                    : tr('移除')}
              </Button>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      )}
    </section>
  )
}
