import { useEffect, useState } from 'react'
import { ActionButton } from '@deepseek-ai/dsh-client-ui-primitives'
import { Spinner } from '@heroui/react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  FileTypeIcon,
  IconRefreshOutlineRegular,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ArtifactInfo } from '@tianzhiai/web-host/types'
import type { AppClient } from '../model/client'
import { describe, unwrap } from '../model/client'

const textExtensions = new Set([
  'txt',
  'md',
  'csv',
  'tsv',
  'json',
  'log',
  'xml',
  'yaml',
  'yml',
  'py',
  'sh',
])
const previewKind = (item: ArtifactInfo): 'image' | 'text' | undefined => {
  if (item.mediaType.startsWith('image/') && item.bytes <= 8 * 1024 * 1024) return 'image'
  if (
    (item.id.startsWith('spill:') ||
      textExtensions.has(item.name.split('.').pop()?.toLowerCase() ?? '')) &&
    item.bytes <= 2 * 1024 * 1024
  )
    return 'text'
  return undefined
}
const artifactUrl = (sessionId: string, item: ArtifactInfo) =>
  `api/artifact?${new URLSearchParams({ sessionId, artifactId: item.id })}`

function ArtifactPreview({
  sessionId,
  item,
  onClose,
}: {
  sessionId: string
  item: ArtifactInfo
  onClose(): void
}) {
  const [content, setContent] = useState<{ kind: 'image' | 'text'; value: string }>()
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | undefined
    const kind = previewKind(item)
    if (!kind) return () => controller.abort()
    void (async () => {
      try {
        const response = await fetch(artifactUrl(sessionId, item), {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        if (!response.ok || !response.body) throw new Error('文件不存在或无法读取')
        const limit = kind === 'image' ? 8 * 1024 * 1024 : 2 * 1024 * 1024
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let total = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > limit) throw new Error('文件超过预览大小限制，请下载查看')
            chunks.push(value)
          }
        } finally {
          await reader.cancel().catch(() => {})
        }
        if (controller.signal.aborted) return
        const blob = new Blob(
          chunks.map((chunk) => Uint8Array.from(chunk).buffer),
          { type: kind === 'image' ? item.mediaType : 'text/plain' },
        )
        if (kind === 'image') {
          objectUrl = URL.createObjectURL(blob)
          setContent({ kind, value: objectUrl })
        } else {
          const value = await blob.text()
          if (!controller.signal.aborted) setContent({ kind, value })
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(describe(reason))
      }
    })()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [sessionId, item])
  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      closeLabel="关闭预览"
      className="tz-artifact-preview"
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : !content ? (
        <p role="status">正在加载…</p>
      ) : content.kind === 'image' ? (
        <img
          src={content.value}
          alt={item.name}
          onError={() => setError('图片无法预览，请下载查看')}
        />
      ) : (
        <pre>{content.value}</pre>
      )}
    </Modal>
  )
}

/** Keep product-owned attachment/spill downloads inside DSH's pane lifecycle. */
export function mountArtifactPane(client: AppClient) {
  const { ctx } = client
  const key = 'tianzhiai-artifacts'
  ctx.effect(() =>
    ctx.slots.inject('sidebar.right.tab.document.actions', () =>
      ctx.slots.register(
        { name: 'sidebar.right.tab.document.actions', id: `${key}-download` },
        function FileDownload({ sessionId, absolutePath }) {
          const [busy, setBusy] = useState(false)
          const [error, setError] = useState('')
          const [lifetime] = useState(() => new AbortController())
          useEffect(() => () => lifetime.abort(), [lifetime])
          async function download() {
            setBusy(true)
            setError('')
            try {
              const file = unwrap(
                await ctx.remote.workspaceFiles.readBytes(
                  sessionId,
                  absolutePath,
                  {},
                  lifetime.signal,
                ),
              )
              if (!file.eof || file.offset !== 0) throw new Error('未取得完整文件，下载已取消')
              const url = URL.createObjectURL(new Blob([Uint8Array.from(file.data).buffer]))
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = absolutePath.split(/[\\/]/).at(-1) ?? 'download'
              anchor.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            } catch (reason) {
              if (!lifetime.signal.aborted) setError(describe(reason))
            } finally {
              if (!lifetime.signal.aborted) setBusy(false)
            }
          }
          return (
            <>
              <ActionButton
                className="tz-pane-action"
                disabled={busy}
                onClick={() => void download()}
              >
                下载文件
              </ActionButton>
              {error && <span role="alert">{error}</span>}
            </>
          )
        },
      ),
    ),
  )
  ctx.effect(() =>
    ctx.sidebarRightTabs.register({
      id: key,
      kind: 'artifacts',
      title: () => '会话产物',
      guide: [
        {
          id: key,
          order: 11,
          title: () => '会话产物',
          description: () => '附件与完整工具输出',
          icon: () => <FileTypeIcon kind="other" size={24} />,
        },
      ],
    }),
  )
  ctx.effect(() =>
    ctx.slots.inject('sidebar.right.pane.tab', () =>
      ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key },
        function Artifacts({ sessionId, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
          const { tab } = useTabInfo()
          const [items, setItems] = useState<ArtifactInfo[]>([])
          const [error, setError] = useState('')
          const [downloadError, setDownloadError] = useState('')
          const [preview, setPreview] = useState<ArtifactInfo>()
          const [loading, setLoading] = useState(true)
          const [revision, setRevision] = useState(0)
          useEffect(() => {
            if (!tab.visible) return
            let active = true
            setLoading(true)
            setError('')
            setDownloadError('')
            setPreview(undefined)
            setItems([])
            void ctx.remote.platform
              .artifacts(sessionId)
              .then(unwrap)
              .then((value) => {
                if (active) setItems(value)
              })
              .catch((reason) => {
                if (active) setError(describe(reason))
              })
              .finally(() => {
                if (active) setLoading(false)
              })
            return () => {
              active = false
            }
          }, [sessionId, tab.visible, revision])
          async function download(item: ArtifactInfo) {
            setDownloadError('')
            try {
              const response = await fetch(artifactUrl(sessionId, item), {
                credentials: 'same-origin',
                signal: tab.signal,
              })
              if (!response.ok)
                throw new Error(
                  response.status === 404
                    ? '文件已清理或不属于当前会话'
                    : `无法下载（${response.status}）`,
                )
              const url = URL.createObjectURL(await response.blob())
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = item.name
              anchor.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            } catch (reason) {
              if (!tab.signal.aborted) setDownloadError(describe(reason))
            }
          }
          return (
            <section className="tz-artifacts" aria-label="会话产物">
              <div className="tz-artifacts-header">
                <span>附件与工具输出</span>
                <ActionButton
                  className="tz-artifacts-refresh"
                  aria-label="刷新会话产物"
                  title="刷新会话产物"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  <IconRefreshOutlineRegular />
                </ActionButton>
              </div>
              {downloadError && (
                <p className="tz-artifacts-error" role="alert">
                  {downloadError}
                </p>
              )}
              {loading ? (
                <p className="tz-artifacts-state" role="status">
                  <Spinner size="sm" />
                  正在加载…
                </p>
              ) : error ? (
                <div className="tz-artifacts-state" role="alert">
                  <span>读取失败：{error}</span>
                  <ActionButton
                    className="tz-pane-action"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    重试
                  </ActionButton>
                </div>
              ) : items.length === 0 ? (
                <p className="tz-artifacts-state">暂无附件或工具输出</p>
              ) : (
                <div className="tz-artifacts-list">
                  {(['会话附件', '工具输出'] as const).map((group) => {
                    const entries = items.filter(
                      (item) => item.id.startsWith('spill:') === (group === '工具输出'),
                    )
                    if (!entries.length) return null
                    return (
                      <section className="tz-artifact-group" key={group} aria-label={group}>
                        <h3>{group}</h3>
                        {entries.map((item) => (
                          <div className="tz-artifact" key={item.id}>
                            <FileTypeIcon path={item.name} size={20} aria-hidden="true" />
                            <span className="tz-artifact-info">
                              <span title={item.name}>{item.name}</span>
                              <small>{item.bytes.toLocaleString()} B</small>
                            </span>
                            <div className="tz-artifact-actions">
                              {previewKind(item) && (
                                <ActionButton
                                  className="tz-pane-action"
                                  aria-label={`预览 ${item.name}`}
                                  onClick={() => setPreview(item)}
                                >
                                  预览
                                </ActionButton>
                              )}
                              <ActionButton
                                className="tz-pane-action"
                                onClick={() => void download(item)}
                              >
                                下载
                              </ActionButton>
                            </div>
                          </div>
                        ))}
                      </section>
                    )
                  })}
                </div>
              )}
              {preview && tab.visible && (
                <ArtifactPreview
                  key={`${sessionId}:${preview.id}`}
                  sessionId={sessionId}
                  item={preview}
                  onClose={() => setPreview(undefined)}
                />
              )}
            </section>
          )
        },
      ),
    ),
  )
}
