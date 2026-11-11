// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  finishInput,
  pendingInputs,
  reserveInput,
} from '../../packages/client/ui-conversation/src/client/submission-journal'

describe('durable submission identity', () => {
  it('reuses a pending request, localizes the limit, and leaves the journal intact', () => {
    const id = 'language-journal' as SessionId
    localStorage.clear()
    const first = reserveInput(id, 'same request', 'queue', [], 'Limite raggiunto')
    expect(reserveInput(id, 'same request', 'queue', [], 'Limite raggiunto')).toBe(first)
    for (let i = 1; i < 128; i++) reserveInput(id, `request ${i}`, 'queue', [], 'Limite raggiunto')
    expect(() => reserveInput(id, 'overflow', 'queue', [], 'Limite raggiunto')).toThrow(
      'Limite raggiunto',
    )
    expect(pendingInputs(id)).toHaveLength(128)
    expect(pendingInputs(id)[0]?.requestId).toBe(first)
    finishInput(id, first)
    expect(pendingInputs(id)).toHaveLength(127)
    localStorage.clear()
  })
})
