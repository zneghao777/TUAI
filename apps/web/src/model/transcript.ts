import type {
  SessionEventSource,
  SessionEventLikeEntry,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm/types'
import type {} from '@deepseek-ai/dsh-user-approval/types'
import type {} from '@deepseek-ai/dsh-tool-executor-ptc/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

export interface Row {
  id: string
  seq: number
  time: number
  kind: 'user' | 'assistant' | 'tool' | 'notice' | 'unknown'
  text: string
  blocks?: readonly ContentBlock[]
  name?: string
  args?: string
  output?: readonly ContentBlock[]
  error?: string
  ended?: number
  parent?: string
  raw?: unknown
  live?: boolean
}
const internal = new Set([
  'turn/start',
  'step/start',
  'step/end',
  'request/header',
  'request/config',
  'model/selection',
  'agent/inbox/spliced',
  'agent/inbox/claimed',
  'session/title',
  'session/metadata',
  'usage',
  'permission/preset',
  'sandbox/mode',
  'approval/policy',
])
export class Transcript {
  readonly state = createSnapshotStore<readonly Row[]>([], { flush: 'raf' })
  private rows = new Map<string, Row>()
  private streams = new Map<string, Map<number, string>>()
  private disposeSource: () => void
  private contextId = 'context:opening'
  constructor(private source: SessionEventSource) {
    this.rebuild()
    this.disposeSource = source.subscribe(() => this.change())
  }
  dispose() {
    this.disposeSource()
  }
  private publish() {
    this.state.set([...this.rows.values()].sort((a, b) => a.seq - b.seq))
  }
  private rebuild() {
    this.contextId = 'context:opening'
    this.rows.clear()
    this.streams.clear()
    for (const e of this.source.getSnapshot().entries) this.apply(e)
    this.publish()
  }
  private change() {
    const change = this.source.getSnapshot().change
    if (change.kind === 'replace' || change.kind === 'prepend') {
      this.rebuild()
      return
    }
    if (change.kind === 'settle-assistant') {
      this.rows.delete(`live:${change.attemptId}`)
      this.streams.delete(change.attemptId)
      if (change.entry) this.apply(change.entry)
    } else for (const entry of change.entries) this.apply(entry)
    this.publish()
  }
  private stream(id: string, chunk: StreamChunk) {
    let parts = this.streams.get(id)
    if (!parts) {
      parts = new Map()
      this.streams.set(id, parts)
    }
    if (chunk.type === 'text-delta')
      parts.set(chunk.index, (parts.get(chunk.index) ?? '') + chunk.text)
    if (chunk.type === 'block-end' && chunk.block.type === 'text')
      parts.set(chunk.index, chunk.block.text)
    return [...parts.values()].join('\n\n')
  }
  private context(entry: SessionEventLikeEntry) {
    const previous = this.rows.get(this.contextId)
    const records = [...(Array.isArray(previous?.raw) ? previous.raw : []), entry.event]
    this.rows.set(this.contextId, {
      id: this.contextId,
      seq: previous?.seq ?? entry.event.seq,
      time: entry.event.time,
      kind: 'unknown',
      text: `上下文与来源 · ${records.length} 项`,
      raw: records,
    })
  }
  private apply(entry: SessionEventLikeEntry) {
    const e = entry.event
    const base = { id: `event:${e.seq}`, seq: e.seq, time: e.time, text: '' }
    switch (e.type) {
      case 'turn/start':
        this.contextId = `context:turn:${e.data.turn}`
        break
      case 'system/message':
      case 'developer/message':
      case 'request/context':
        this.context(entry)
        break
      case 'user/message':
        if (e.data.source.kind !== 'user') {
          this.context(entry)
          break
        }
        this.rows.set(base.id, {
          ...base,
          kind: 'user',
          blocks: e.data.content,
          text: blockText(e.data.content),
        })
        break
      case 'assistant/message':
        if (
          !e.data.message.content.some(
            (b) => (b.type === 'text' && b.text) || b.type === 'image' || b.type === 'file',
          )
        )
          break
        this.rows.set(base.id, {
          ...base,
          kind: 'assistant',
          blocks: e.data.message.content,
          text: blockText(e.data.message.content),
        })
        break
      case 'assistant/live-chunk': {
        const id = `live:${e.data.attemptId}`
        const text = this.stream(e.data.attemptId, e.data.chunk)
        if (text)
          this.rows.set(id, {
            ...base,
            id,
            seq: this.rows.get(id)?.seq ?? base.seq,
            kind: 'assistant',
            text,
            live: true,
          })
        break
      }
      case 'tool/call':
        this.rows.set(`tool:${e.data.callId}`, {
          ...base,
          id: `tool:${e.data.callId}`,
          kind: 'tool',
          name: e.data.name,
          args: e.data.arguments,
        })
        break
      case 'tool/result': {
        const id = `tool:${e.data.message.toolCallId}`
        const old = this.rows.get(id)
        this.rows.set(id, {
          ...base,
          ...old,
          id,
          kind: 'tool',
          output: e.data.message.content,
          error: e.data.message.isError
            ? (e.data.error?.reason ?? blockText(e.data.message.content) ?? '工具失败')
            : undefined,
          ended: e.time,
          raw: e.data,
        })
        break
      }
      case 'tool/ptc-dispatch-start':
      case 'tool/ptc-dispatch': {
        const id = `tool:${e.data.subCallId}`
        const old = this.rows.get(id)
        this.rows.set(id, {
          ...base,
          ...old,
          id,
          kind: 'tool',
          name: e.data.name,
          args: JSON.stringify(e.data.arguments, null, 2),
          parent: `tool:${e.data.parentCallId}`,
          ...(e.type === 'tool/ptc-dispatch'
            ? {
                ended: e.time,
                output: e.data.content,
                error: e.data.isError ? blockText(e.data.content) : undefined,
              }
            : {}),
          raw: e.data,
        })
        break
      }
      case 'approval/asked':
        this.rows.set(`approval:${e.data.id}`, {
          ...base,
          id: `approval:${e.data.id}`,
          kind: 'notice',
          text: `等待确认：${e.data.toolName}`,
          raw: e.data,
        })
        break
      case 'approval/decided': {
        const id = `approval:${e.data.id}`
        const old = this.rows.get(id)
        const labels = {
          'allowed-once': '已批准本次操作，结果请查看工具记录',
          rejected: '已拒绝本次操作',
          cancelled: '审批已取消或过期',
          unavailable: '审批不可用，操作未获批准',
        }
        this.rows.set(id, {
          ...base,
          ...old,
          id,
          kind: 'notice',
          text: labels[e.data.outcome],
          raw: e.data,
        })
        break
      }
      case 'turn/end': {
        const r = e.data.reason
        this.rows.set(base.id, {
          ...base,
          kind: 'notice',
          text:
            r.kind === 'completed'
              ? '本轮已完成'
              : r.kind === 'aborted'
                ? '当前执行已停止；已发生的操作不会撤销'
                : `本轮结束：${r.kind}`,
          raw: r,
        })
        break
      }
      case 'assistant/attempt':
        this.rows.set(base.id, {
          ...base,
          kind: 'notice',
          text: '本次模型尝试未形成最终回答',
          raw: e.data,
        })
        break
      default:
        if (!internal.has(e.type))
          this.rows.set(base.id, { ...base, kind: 'unknown', text: e.type, raw: e.data })
    }
  }
}
export function blockText(blocks: readonly ContentBlock[]) {
  return blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n')
}
