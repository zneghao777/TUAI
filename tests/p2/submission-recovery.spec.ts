import { migrateUiState } from '../../apps/web/src/model/migrate-ui-state'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { setPersistenceScope } from '@deepseek-ai/dsh-client-store'
import {
  pendingInputs,
  reserveInput,
  finishInput,
} from '../../packages/client/ui-conversation/src/client/submission-journal'
const storage = new Map<string, string>()
function mount() {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
}
afterEach(() => {
  vi.unstubAllGlobals()
  setPersistenceScope('')
})
it('uncertain sends retain identity through reload; settled repeats get a new identity', () => {
  mount()
  setPersistenceScope('host-a')
  const session = SessionId('same-session')
  const first = reserveInput(session, 'hello', 'queue', [])
  expect(reserveInput(session, 'hello', 'queue', [])).toBe(first)
  expect(reserveInput(session, 'edited', 'queue', [])).not.toBe(first)
  finishInput(session, first)
  expect(reserveInput(session, 'hello', 'queue', [])).not.toBe(first)
})
it('same Session id on another Host cannot borrow pending identity or draft', () => {
  mount()
  setPersistenceScope('host-a')
  const session = SessionId('same')
  const first = reserveInput(session, 'private draft', 'queue', [])
  setPersistenceScope('host-b')
  expect(pendingInputs(session)).toEqual([])
  expect(reserveInput(session, 'private draft', 'queue', [])).not.toBe(first)
  setPersistenceScope('host-a')
  expect(pendingInputs(session)[0]?.requestId).toBe(first)
})
it('storage refusal prevents untracked admission', () => {
  mount()
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {},
  })
  expect(() => reserveInput(SessionId('quota'), 'keep this draft', 'queue', [])).toThrow('quota')
})

it('imports legacy pending identity once and preserves payload order', () => {
  mount()
  setPersistenceScope('tianzhiai:old-host')
  const session = SessionId('legacy')
  localStorage.setItem(
    'tianzhiai:draft:v1:old-host:legacy',
    JSON.stringify({
      text: 'old draft',
      pending: { id: 'original-request', text: 'old draft', mode: 'queue', receipts: [] },
    }),
  )
  migrateUiState('old-host', [session])
  expect(reserveInput(session, 'old draft', 'queue', [])).toBe('original-request')
  expect(pendingInputs(session)[0]?.textFirst).toBe(true)
  finishInput(session, 'original-request')
  migrateUiState('old-host', [session])
  expect(pendingInputs(session)).toEqual([])
})
