import { test } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { SessionRemotes } from '../../packages/api/session-controller/src/client/sessions/remotes.ts'
const remote = new Proxy(
  {},
  {
    get() {
      throw new Error('Catalog-only test must not call Remote')
    },
  },
) as SessionRemotes
import assert from 'node:assert/strict'
import { Session } from '../../packages/api/session-controller/src/client/sessions/session.ts'

test('Repeated catalog notifications keep lifecycle snapshot identity, while real lifecycle changes publish', async () => {
  const session = new Session(SessionId('p4-snapshot'), remote)
  const initial = session.getSnapshot()
  let changes = 0,
    seen = initial
  const off = session.subscribe(() => {
    const next = session.getSnapshot()
    if (next !== seen) changes++
    seen = next
  })
  try {
    for (let i = 0; i < 220; i++) {
      session.configureSubagent(undefined)
      await Promise.resolve()
    }
    assert.equal(session.getSnapshot(), initial)
    assert.equal(changes, 0)
    session.handleRunning(true)
    await Promise.resolve()
    assert.equal(session.getSnapshot().running, true)
    assert.equal(changes, 1)
    session.handleRunning(false)
    await Promise.resolve()
    assert.equal(session.getSnapshot().running, false)
    assert.equal(changes, 2)
  } finally {
    off()
    await session.dispose()
  }
})
test('Subagent snapshot equality preserves exact address, parent availability, and resolved mode changes', async () => {
  const address: SubagentAddress = {
      parentSessionId: SessionId('parent'),
      childSessionId: SessionId('child'),
      mode: 'unknown',
    },
    session = new Session(SessionId('p4-child'), remote, { address })
  try {
    const initial = session.getSnapshot()
    session.configureSubagent({ ...address })
    assert.equal(session.getSnapshot(), initial)
    session.handleSubagentParentAvailable(true)
    const available = session.getSnapshot()
    assert.notEqual(available, initial)
    session.configureSubagent({ ...address }, true)
    assert.equal(session.getSnapshot(), available)
    session.configureSubagent({ ...address, mode: 'continuable' }, true)
    assert.equal(session.getSnapshot().subagent.address.mode, 'continuable')
    session.configureSubagent({ ...address, childSessionId: SessionId('other') }, false)
    assert.equal(session.getSnapshot().subagent.address.childSessionId, 'other')
  } finally {
    await session.dispose()
  }
})
