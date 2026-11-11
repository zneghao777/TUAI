import { expect, test } from 'vitest'
import { transferBrowserSelection } from '../../apps/web/src/model/browser-clipboard'
const selection = {
  status: 'executed',
  text: '合成选区\n第二行',
  selectionDigest: 'a'.repeat(64),
} as const

test('denied local clipboard permission leaves the remote selection intact', async () => {
  let removed = false
  await expect(
    transferBrowserSelection(
      true,
      async () => selection,
      async () => {
        throw new Error('NotAllowedError')
      },
      async () => {
        removed = true
      },
    ),
  ).rejects.toThrow('NotAllowedError')
  expect(removed).toBe(false)
})
test('cut deletes only the captured selection after the local write succeeds', async () => {
  let written = '',
    removed = ''
  await transferBrowserSelection(
    true,
    async () => selection,
    async (text) => {
      written = text
    },
    async (token) => {
      expect(written).toBe(selection.text)
      removed = token
    },
  )
  expect(removed).toBe(selection.selectionDigest)
})
test('empty and unbound selections do not overwrite the clipboard or delete text', async () => {
  let changes = 0
  await transferBrowserSelection(
    true,
    async () => ({ status: 'executed', text: '' }),
    async () => {
      changes++
    },
    async () => {
      changes++
    },
  )
  await expect(
    transferBrowserSelection(
      true,
      async () => ({ status: 'executed', text: 'test' }),
      async () => {
        changes++
      },
      async () => {
        changes++
      },
    ),
  ).rejects.toThrow('CUT_SELECTION_REQUIRED')
  expect(changes).toBe(0)
})
