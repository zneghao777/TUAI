import { extname, isAbsolute, relative } from 'node:path'

export type LibraryKind = 'document' | 'image'

/** A candidate has a successful first-party write event, not just a matching filename. */
export interface CreatedFileCandidate {
  path: string
  kind: LibraryKind
  createdAt: number
  sourceId: string
  sourceKind: 'create' | 'publish'
}

const images = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const documents = new Set(['.md', '.txt', '.pdf', '.docx', '.xlsx', '.pptx', '.csv'])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Recover only creates backed by a successful write and its persisted result metadata.
 * Candidates still require workspace authorization and physical-file verification before use.
 */
export function createdFiles(
  events: readonly unknown[],
  workspace: string,
): CreatedFileCandidate[] {
  if (!isAbsolute(workspace)) return []
  const calls = new Map<string, string>()
  const found = new Map<string, CreatedFileCandidate>()
  for (const event of events) {
    if (!record(event) || !record(event.data)) continue
    const data = event.data
    if (
      event.type === 'tool/call' &&
      typeof data.callId === 'string' &&
      (data.name === 'write' || data.name === 'publish_file')
    ) {
      calls.set(data.callId, data.name)
      continue
    }
    if (event.type !== 'tool/result' || !record(data.message)) continue
    const id = data.message.toolCallId
    if (typeof id !== 'string') continue
    const name = calls.get(id)
    calls.delete(id)
    if (!name) continue
    if (data.message.isError === true || data.error !== undefined || !record(data.meta)) continue
    const { operation, path } = data.meta
    if (
      !(
        (name === 'write' && operation === 'create') ||
        (name === 'publish_file' && operation === 'publish')
      ) ||
      typeof path !== 'string' ||
      !isAbsolute(path)
    )
      continue
    const inside = relative(workspace, path)
    if (
      !inside ||
      inside === '..' ||
      inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
      isAbsolute(inside)
    )
      continue
    const extension = extname(path).toLowerCase()
    const kind = images.has(extension) ? 'image' : documents.has(extension) ? 'document' : undefined
    if (!kind || typeof event.time !== 'number' || !Number.isFinite(event.time)) continue
    found.set(path, {
      path,
      kind,
      createdAt: event.time,
      sourceId: id,
      sourceKind: name === 'write' ? 'create' : 'publish',
    })
  }
  return [...found.values()]
}
