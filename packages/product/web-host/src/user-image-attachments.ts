interface UserImageAttachment {
  id: string
  name: string
  bytes: number
  createdAt: number | null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Only a persisted user message makes an uploaded image part of the library. */
export function userImageAttachments(events: readonly unknown[]): UserImageAttachment[] {
  const images = new Map<string, UserImageAttachment>()
  for (const event of events) {
    if (!record(event) || event.type !== 'user/message' || !record(event.data)) continue
    const { source, content } = event.data
    if (!record(source) || source.kind !== 'user' || !Array.isArray(content)) continue
    for (const block of content) {
      if (!record(block) || block.type !== 'image' || !record(block.attachment)) continue
      const ref = block.attachment
      if (
        typeof ref.attachmentId !== 'string' ||
        !ref.attachmentId ||
        typeof ref.bytes !== 'number' ||
        !Number.isSafeInteger(ref.bytes) ||
        ref.bytes < 0 ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(ref.mediaType)) ||
        typeof ref.width !== 'number' ||
        typeof ref.height !== 'number'
      )
        continue
      if (!images.has(ref.attachmentId))
        images.set(ref.attachmentId, {
          id: ref.attachmentId,
          name: typeof ref.name === 'string' && ref.name ? ref.name : '图片',
          bytes: ref.bytes,
          createdAt:
            typeof event.time === 'number' && Number.isFinite(event.time) ? event.time : null,
        })
    }
  }
  return [...images.values()]
}
