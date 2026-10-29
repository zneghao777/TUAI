import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  AttachmentId,
  FileAttachmentRef,
  ImageAttachmentRef,
} from '@deepseek-ai/dsh-attachment/types'
import { sessionDir } from '@deepseek-ai/dsh-spill-local'
import { join } from 'node:path'
import { lstat, readdir, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import type { ArtifactInfo } from './types.ts'

type Entry = { info: ArtifactInfo } & (
  | { kind: 'file'; ref: FileAttachmentRef }
  | { kind: 'image'; ref: ImageAttachmentRef }
  | { kind: 'spill'; path: string }
)
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** Only durable, first-party content fields grant attachment membership. */
export async function entries(ctx: Context, id: SessionId): Promise<Entry[]> {
  using observation = await ctx.sessionQuery.observeSession(id, { projectionMode: 'none' })
  const found = new Map<string, Entry>()
  function content(value: unknown) {
    if (!Array.isArray(value)) return
    for (const block of value) {
      if (
        !record(block) ||
        (block.type !== 'image' && block.type !== 'file') ||
        !record(block.attachment)
      )
        continue
      const ref = block.attachment
      if (
        typeof ref.attachmentId !== 'string' ||
        typeof ref.bytes !== 'number' ||
        !Number.isSafeInteger(ref.bytes) ||
        ref.bytes < 0
      )
        continue
      const name = typeof ref.name === 'string' ? ref.name : '图片'
      const base = {
        attachmentId: brandString<AttachmentId>(ref.attachmentId),
        bytes: ref.bytes,
        name,
      }
      if (block.type === 'file')
        found.set(ref.attachmentId, {
          kind: 'file',
          ref: base,
          info: {
            id: ref.attachmentId,
            name,
            bytes: ref.bytes,
            mediaType: 'application/octet-stream',
          },
        })
      else if (
        (ref.mediaType === 'image/png' ||
          ref.mediaType === 'image/jpeg' ||
          ref.mediaType === 'image/webp' ||
          ref.mediaType === 'image/gif') &&
        typeof ref.width === 'number' &&
        typeof ref.height === 'number'
      )
        found.set(ref.attachmentId, {
          kind: 'image',
          ref: { ...base, mediaType: ref.mediaType, width: ref.width, height: ref.height },
          info: { id: ref.attachmentId, name, bytes: ref.bytes, mediaType: ref.mediaType },
        })
    }
  }
  for (const event of observation.events) {
    const data: unknown = event.data
    if (!record(data)) continue
    if (['user/message', 'tool/ptc-dispatch'].includes(event.type)) content(data.content)
    if (
      ['assistant/message', 'system/message', 'developer/message', 'tool/result'].includes(
        event.type,
      ) &&
      record(data.message)
    )
      content(data.message.content)
  }
  const directory = sessionDir(join(ctx.tianzhiaiHost.paths.artifacts, 'spill'), String(id))
  try {
    const stat = await lstat(directory)
    if (
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (process.platform === 'win32' || !(stat.mode & 0o077))
    ) {
      for (const file of await readdir(directory, { withFileTypes: true })) {
        if (!file.isFile()) continue
        const path = join(directory, file.name),
          item = await lstat(path)
        if (!item.isFile() || item.isSymbolicLink()) continue
        const artifactId = `spill:${file.name}`
        found.set(artifactId, {
          kind: 'spill',
          path,
          info: { id: artifactId, name: file.name, bytes: item.size, mediaType: 'text/plain' },
        })
      }
    }
  } catch (error) {
    if (!record(error) || error.code !== 'ENOENT') throw error
  }
  return [...found.values()]
}

/** Connection owns authentication; this route admits only the owner's carrier. */
export async function download(ctx: Context, request: Request): Promise<Response> {
  const url = new URL(request.url),
    session = url.searchParams.get('sessionId'),
    id = url.searchParams.get('artifactId')
  if (!session || !id) return new Response('需要会话和产物身份', { status: 400 })
  if (ctx.get('conversationTrash')?.has(SessionId(session)))
    return new Response('该会话已删除', { status: 404 })
  try {
    const entry = (await entries(ctx, SessionId(session))).find((item) => item.info.id === id)
    if (!entry) return new Response('产物不存在或不属于此会话', { status: 404 })
    const headers = {
      'Content-Type': entry.info.mediaType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entry.info.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    }
    if (request.method === 'HEAD') return new Response(null, { headers })
    async function* bytes(): AsyncGenerator<Uint8Array> {
      if (entry!.kind === 'file') yield* ctx.attachments.readFileStream(entry!.ref, request.signal)
      else if (entry!.kind === 'image') yield (await ctx.attachments.readImage(entry!.ref)).data
      else {
        const file = await open(entry!.path, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          for await (const chunk of file.createReadStream({ autoClose: false })) {
            request.signal.throwIfAborted()
            yield chunk
          }
        } finally {
          await file.close()
        }
      }
    }
    const iterator = bytes()
    return new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const value = await iterator.next()
            if (value.done) controller.close()
            else controller.enqueue(value.value)
          } catch (error) {
            controller.error(error)
          }
        },
        async cancel() {
          await iterator.return(undefined)
        },
      }),
      { headers },
    )
  } catch (error) {
    ctx.logger.warn('产物下载失败: %s', error instanceof Error ? error.name : 'unknown')
    return new Response('无法读取产物', { status: 404 })
  }
}
