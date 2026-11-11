/** One-way Host-scoped import. Originals remain recoverable; pending request identities survive upgrades. */
export function migrateUiState(hostId: string, sessionIds: readonly string[]) {
  const prefix = `tianzhiai:${hostId}:`
  try {
    const selection = `${prefix}dsh.sessions.current`
    const old = localStorage.getItem(`tianzhiai:selected:${hostId}`)
    if (!localStorage.getItem(selection) && old && sessionIds.includes(old))
      localStorage.setItem(selection, JSON.stringify({ sessionId: old }))
  } catch {
    /* Storage may be unavailable. */
  }
  for (const id of sessionIds) {
    try {
      const marker = `${prefix}dsh.legacy-imported.${id}`
      if (localStorage.getItem(marker)) continue
      const previous = `tianzhiai:draft:v1:${hostId}:${id}`
      const next = `${prefix}dsh.conversation.${id}`
      const value: unknown = JSON.parse(localStorage.getItem(previous) ?? 'null')
      if (localStorage.getItem(next)) {
        localStorage.setItem(marker, '1')
        continue
      }
      if (
        !value ||
        typeof value !== 'object' ||
        !('text' in value) ||
        typeof value.text !== 'string'
      )
        continue
      const rawFiles: unknown = JSON.parse(localStorage.getItem(`${previous}:uploads`) ?? '[]')
      const files: { id: string; name: string; receiptId?: string }[] = Array.isArray(rawFiles)
        ? rawFiles.flatMap((file) =>
            file && typeof file.id === 'string' && typeof file.name === 'string'
              ? [
                  {
                    id: file.id,
                    name: file.name,
                    ...(typeof file.receipt === 'string' ? { receiptId: file.receipt } : {}),
                  },
                ]
              : [],
          )
        : []
      const pending = 'pending' in value ? value.pending : null
      if (
        pending &&
        typeof pending === 'object' &&
        'id' in pending &&
        typeof pending.id === 'string' &&
        'text' in pending &&
        typeof pending.text === 'string' &&
        'mode' in pending &&
        (pending.mode === 'queue' || pending.mode === 'steer') &&
        'receipts' in pending &&
        Array.isArray(pending.receipts) &&
        pending.receipts.every((r: unknown) => typeof r === 'string')
      ) {
        const attachments = pending.receipts.map((receipt: string, index: number) => {
          const file = files.find((file) => file.receiptId === receipt)
          if (file) return file.id
          const restored = { id: `legacy-${pending.id}-${index}`, name: '附件', receiptId: receipt }
          files.push(restored)
          return restored.id
        })
        localStorage.setItem(
          `${prefix}dsh.pending-input:${id}`,
          JSON.stringify([
            {
              requestId: pending.id,
              text: pending.text,
              signature: JSON.stringify([pending.text, pending.mode, attachments]),
              attachments,
              textFirst: true,
            },
          ]),
        )
      }
      localStorage.setItem(`${prefix}dsh.draft-files.${id}`, JSON.stringify(files))
      localStorage.setItem(
        next,
        JSON.stringify({ draft: value.text, view: null, viewRequest: null }),
      )
      localStorage.setItem(marker, '1')
    } catch {
      /* A malformed legacy Session must not prevent other drafts from migrating. */
    }
  }
}
