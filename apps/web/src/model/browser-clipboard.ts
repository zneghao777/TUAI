import type { InputResult } from '@tuai/ego-connector/types'

/** Obtain local clipboard permission before deleting the captured remote selection. */
export async function transferBrowserSelection(
  cut: boolean,
  read: () => Promise<InputResult>,
  write: (text: string) => Promise<void>,
  remove: (selectionDigest: string) => Promise<unknown>,
): Promise<void> {
  const selection = await read()
  if (!selection.text) return
  const digest = selection.selectionDigest
  if (cut && !digest) throw new Error('CUT_SELECTION_REQUIRED')
  await write(selection.text)
  if (cut && digest) await remove(digest)
}
