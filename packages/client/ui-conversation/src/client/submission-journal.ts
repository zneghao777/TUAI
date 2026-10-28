import { brandString } from '@deepseek-ai/dsh-brand'
import { scopedPersistenceKey } from '@deepseek-ai/dsh-client-store'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { DraftAttachmentId } from './contract/input.ts'

interface PendingInput { requestId: SessionRequestId; text: string; signature: string; attachments: DraftAttachmentId[]; textFirst?: boolean }
const key = (id: SessionId) => scopedPersistenceKey(`dsh.pending-input:${id}`)
export function pendingInputs(id: SessionId): PendingInput[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(key(id)) ?? '[]')
    if (!Array.isArray(rows)) return []
    return rows.flatMap((row: unknown): PendingInput[] => {
      if (typeof row !== 'object' || row === null || !('requestId' in row) || typeof row.requestId !== 'string'
        || !('text' in row) || typeof row.text !== 'string' || !('signature' in row) || typeof row.signature !== 'string'
        || !('attachments' in row) || !Array.isArray(row.attachments) || !row.attachments.every((x: unknown) => typeof x === 'string')) return []
      return [{ ...('textFirst' in row && row.textFirst === true ? { textFirst: true } : {}), requestId: brandString<SessionRequestId>(row.requestId), text: row.text, signature: row.signature,
        attachments: row.attachments.map((id: string) => brandString<DraftAttachmentId>(id)) }]
    })
  } catch { return [] }
}
export function reserveInput(id: SessionId, text: string, mode: string, attachments: readonly DraftAttachmentId[]): SessionRequestId {
  const rows = pendingInputs(id)
  const signature = JSON.stringify([text, mode, attachments])
  const found = rows.find(row => row.signature === signature)
  if (found) return found.requestId
  if (rows.length >= 128) throw new Error('待确认输入过多，请先检查连接与会话历史')
  const requestId = brandString<SessionRequestId>(randomUUID())
  // A failed durable write prevents the send, rather than losing retry identity.
  localStorage.setItem(key(id), JSON.stringify([...rows, { requestId, text, signature, attachments }]))
  return requestId
}
export function finishInput(id: SessionId, requestId: string): void {
  const rows = pendingInputs(id).filter(row => row.requestId !== requestId)
  if (rows.length) localStorage.setItem(key(id), JSON.stringify(rows))
  else localStorage.removeItem(key(id))
}
