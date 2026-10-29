import { useEffect, useState } from 'react'
import { ActionButton } from '@deepseek-ai/dsh-client-ui-primitives'
import { Spinner } from '@heroui/react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTypeIcon, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ArtifactInfo } from '@tianzhiai/web-host/types'
import type { AppClient } from '../model/client'
import { describe, unwrap } from '../model/client'

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
    ctx.slots.inject('sidebar.right.tab.files.actions', () =>
      ctx.slots.register({ name: 'sidebar.right.tab.files.actions', id: key }, () => (
        <ActionButton
          className="tz-pane-action"
          onClick={() => ctx.sidebarRight.openTab('artifacts')}
        >
          会话产物
        </ActionButton>
      )),
    ),
  )
  ctx.effect(() =>
    ctx.slots.inject('sidebar.right.pane.tab', () =>
      ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key },
        function Artifacts({ sessionId, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
          const { tab } = useTabInfo()
          const [items, setItems] = useState<ArtifactInfo[]>([])
          const [error, setError] = useState('')
          const [loading, setLoading] = useState(true)
          const [revision, setRevision] = useState(0)
          useEffect(() => {
            if (!tab.visible) return
            let active = true
            setLoading(true)
            setError('')
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
            try {
              const response = await fetch(
                `api/artifact?${new URLSearchParams({ sessionId, artifactId: item.id })}`,
                { credentials: 'same-origin', signal: tab.signal },
              )
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
              if (!tab.signal.aborted) setError(describe(reason))
            }
          }
          return (
            <section className="tz-artifacts" aria-label="会话产物">
              <ActionButton
                className="tz-pane-action"
                aria-label="刷新会话产物"
                onClick={() => setRevision((value) => value + 1)}
              >
                <IconRefreshOutlineRegular />
              </ActionButton>
              {error && <p role="alert">{error}</p>}
              {loading ? (
                <p role="status">
                  <Spinner size="sm" />
                  正在加载…
                </p>
              ) : items.length === 0 ? (
                <p>暂无产物</p>
              ) : (
                items.map((item) => (
                  <div className="tz-artifact" key={item.id}>
                    <span>
                      {item.name}
                      <small>
                        {item.id.startsWith('spill:') ? '工具输出' : '会话附件'} ·{' '}
                        {item.bytes.toLocaleString()} B
                      </small>
                    </span>
                    <ActionButton className="tz-pane-action" onClick={() => void download(item)}>
                      下载
                    </ActionButton>
                  </div>
                ))
              )}
            </section>
          )
        },
      ),
    ),
  )
}
