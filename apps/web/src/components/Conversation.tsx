import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import { useSource } from '../bindings'
import { Transcript, blockText, type Row } from '../model/transcript'
import { Button, Icon, Copy, SafeMarkdown, Raw, TextOutput } from './kit'
import { AppClient, describe, unwrap } from '../model/client'
import s from '../App.module.css'
export function Conversation({ binding, client }: { binding: SessionBinding; client: AppClient }) {
  const transcript = useMemo(() => new Transcript(binding.eventSource), [binding])
  useEffect(() => () => transcript.dispose(), [transcript])
  const rows = useSource(transcript.state),
    state = useSource(binding.session)
  const scroll = useRef<HTMLDivElement>(null),
    following = useRef(true),
    [atBottom, setAtBottom] = useState(true)
  const rootRows = useMemo(() => rows.filter((row) => !row.parent), [rows])
  const virtual = useVirtualizer({
    count: rootRows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 140,
    getItemKey: (index) => rootRows[index].id,
    overscan: 6,
  })
  const olderAnchor = useRef<{ key: string; offset: number } | undefined>(undefined)
  useLayoutEffect(() => {
    if (olderAnchor.current) {
      const target = rootRows.findIndex((r) => r.id === olderAnchor.current!.key)
      if (target >= 0) {
        virtual.scrollToIndex(target, { align: 'start' })
        const offset = olderAnchor.current.offset
        requestAnimationFrame(() => scroll.current?.scrollBy({ top: offset }))
        olderAnchor.current = undefined
      }
      return
    }
    if (following.current && rootRows.length)
      virtual.scrollToIndex(rootRows.length - 1, { align: 'end' })
  }, [rootRows, virtual])
  const older = async () => {
    following.current = false
    const first = virtual.getVirtualItems().find((v) => v.end > (scroll.current?.scrollTop ?? 0))
    if (first)
      olderAnchor.current = {
        key: rootRows[first.index].id,
        offset: (scroll.current?.scrollTop ?? 0) - first.start,
      }
    await binding.session.loadOlder()
  }
  return (
    <div className={s.conversationWrap}>
      <div
        ref={scroll}
        className={s.conversation}
        onScroll={(e) => {
          const el = e.currentTarget
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100
          following.current = near
          setAtBottom(near)
        }}
      >
        <div className={s.historyControl}>
          {state.hasMore ? (
            <Button busy={state.loadingOlder} onClick={() => void older()}>
              加载更早记录
            </Button>
          ) : rootRows.length ? (
            <span>已加载到会话开头</span>
          ) : null}
          {state.openError ? (
            <p role="alert">
              {state.openError.message}
              <Button onClick={() => client.connection.reconnect()}>重新连接</Button>
            </p>
          ) : null}
        </div>
        <div
          className={s.messageWidth}
          style={{ height: virtual.getTotalSize(), position: 'relative' }}
        >
          {virtual.getVirtualItems().map((item) => {
            const row = rootRows[item.index]
            return (
              <div
                key={row.id}
                data-index={item.index}
                ref={virtual.measureElement}
                className={s.virtualRow}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <Message row={row} rows={rows} binding={binding} client={client} />
              </div>
            )
          })}
        </div>
        {state.lastAgentError ? (
          <div role="alert" className={s.error}>
            {state.lastAgentError}
          </div>
        ) : null}
        {state.running ? (
          <div className={s.running} role="status">
            <span />
            正在执行…
          </div>
        ) : null}
      </div>
      {!atBottom ? (
        <Button
          className={s.toBottom}
          onClick={() => {
            following.current = true
            virtual.scrollToIndex(rootRows.length - 1, { align: 'end' })
          }}
        >
          回到最新消息
        </Button>
      ) : null}
    </div>
  )
}
function Message({
  row,
  rows,
  binding,
  client,
}: {
  row: Row
  rows: readonly Row[]
  binding: SessionBinding
  client: AppClient
}) {
  const [expanded, setExpanded] = useState(false)
  if (row.kind === 'tool')
    return (
      <div className={s.tool}>
        <button
          className={s.toolSummary}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className={row.error ? s.failedDot : row.ended ? s.doneDot : s.activeDot} />
          <span>{row.name ?? '工具记录'}</span>
          <span className={s.toolState}>
            {row.error ? '失败' : row.ended ? '已完成' : '执行中'}
          </span>
          <Icon name="chevron" />
        </button>
        {expanded ? (
          <div className={s.toolBody}>
            <h4>参数与命令</h4>
            <pre>{row.args}</pre>
            <Copy text={row.args ?? ''} />
            <h4>原始输出{row.ended ? ` · ${Math.max(0, row.ended - row.time)} ms` : ''}</h4>
            {row.error ? (
              <p className={s.error} role="alert">
                {row.error}
              </p>
            ) : null}
            <Output blocks={row.output ?? []} binding={binding} client={client} />
            {row.output ? <Copy text={blockText(row.output)} /> : <p>等待工具回执</p>}
            {rows
              .filter((child) => child.parent === row.id)
              .map((child) => (
                <Message key={child.id} row={child} rows={rows} binding={binding} client={client} />
              ))}
            {row.raw ? (
              <details>
                <summary>完整结果记录</summary>
                <Raw value={row.raw} />
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  if (row.kind === 'notice')
    return (
      <div className={s.notice}>
        <span>{row.text}</span>
        {row.raw ? (
          <details>
            <summary>查看记录</summary>
            <Raw value={row.raw} />
          </details>
        ) : null}
      </div>
    )
  if (row.kind === 'unknown')
    return (
      <details className={s.notice}>
        <summary>执行记录 · {row.text}</summary>
        <Raw value={row.raw} />
      </details>
    )
  return (
    <article
      className={row.kind === 'user' ? s.userMessage : s.assistantMessage}
      data-message-kind={row.kind}
    >
      <div className={s.messageText}>
        <SafeMarkdown text={row.text} />
        {row.blocks ? <Attachments blocks={row.blocks} binding={binding} client={client} /> : null}
      </div>
      {row.live ? (
        <span className={s.liveCursor} aria-label="正在输出" />
      ) : row.kind === 'assistant' ? (
        <div className={s.messageActions}>
          <Copy text={row.text} />
        </div>
      ) : null}
    </article>
  )
}
function Output({
  blocks,
  binding,
  client,
}: {
  blocks: readonly ContentBlock[]
  binding: SessionBinding
  client: AppClient
}) {
  return (
    <>
      <TextOutput text={blockText(blocks)} />
      <Attachments blocks={blocks} binding={binding} client={client} />
    </>
  )
}
function Attachments({
  blocks,
  binding,
  client,
}: {
  blocks: readonly ContentBlock[]
  binding: SessionBinding
  client: AppClient
}) {
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'file' ? (
          <a
            className={s.attachmentLink}
            key={i}
            href={`api/artifact?${new URLSearchParams({ sessionId: binding.sessionId, artifactId: b.attachment.attachmentId })}`}
            download={b.attachment.name}
          >
            <Icon name="download" />
            {b.attachment.name} · {b.attachment.bytes.toLocaleString()} B
          </a>
        ) : b.type === 'image' ? (
          <ImageAttachment
            key={i}
            id={b.attachment.attachmentId}
            binding={binding}
            client={client}
          />
        ) : null,
      )}
    </>
  )
}
function ImageAttachment({
  id,
  binding,
}: {
  id: Parameters<SessionBinding['session']['readAttachment']>[0]
  binding: SessionBinding
  client: AppClient
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    let gone = false,
      created = ''
    void binding.session
      .readAttachment(id)
      .then(unwrap)
      .then((value) => {
        created = URL.createObjectURL(
          new Blob([new Uint8Array(value.data)], { type: value.attachment.mediaType }),
        )
        if (gone) URL.revokeObjectURL(created)
        else setUrl(created)
      })
      .catch((e) => {
        if (!gone) setError(describe(e))
      })
    return () => {
      gone = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [id, binding])
  return url ? (
    <img className={s.imageAttachment} src={url} alt="已发送的图片" />
  ) : (
    <span>{error || '正在读取图片…'}</span>
  )
}
