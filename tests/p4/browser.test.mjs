import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Context } from '../../vendor/cordis/lib/index.js'
import { BrowserService } from '../../packages/product/browser-service/lib/index.js'
import { TaskRuntime, digest } from '../../packages/product/task-runtime/lib/index.js'
import { ConnectorError } from '../../packages/product/ego-connector/lib/index.js'
import {
  resolveHostPaths,
  ensureHostDirectories,
} from '../../packages/product/host-config/lib/index.js'

const summary = {
  merchant: 'P4 Travel',
  itinerary: 'Milano → Roma',
  dataScope: 'Synthetic passenger',
  amount: '35',
  currency: 'EUR',
  terms: 'Reservation only; unpaid; no ticket',
  action: 'Create one test reservation',
}
const text =
  'P4 Travel\nMilano → Roma\n35 EUR\nSynthetic passenger\nReservation only; unpaid; no ticket\nSearch\nSubmit'
class ConnectorFixture {
  epoch = 0
  actions = []
  inputs = []
  stops = new Set()
  frames = new Set()
  fingerprint = 'stable'
  nextAction
  closed = false
  stream = false
  observation() {
    return {
      id: randomUUID(),
      pageId: 'p1',
      url: 'https://test.invalid/',
      title: 'Controlled page',
      text,
      fingerprint: this.fingerprint,
      refs: [
        { id: '@1', signature: 'search', role: 'button', description: 'Search' },
        { id: '@2', signature: 'submit', role: 'button', description: 'Submit' },
      ],
      truncated: false,
      viewport: { width: 1000, height: 700, dpr: 2, version: 1 },
      observedAt: Date.now(),
    }
  }
  async start(options) {
    this.epoch = options.epoch
    return {
      spaceId: 101,
      pageId: 'p1',
      pages: [
        { id: 'p1', title: 'Controlled page', url: 'https://test.invalid/', openedBy: 'agent' },
      ],
      viewport: { width: 1000, height: 700, dpr: 2, version: 1 },
      capabilities: {
        available: true,
        cliVersion: 'fixture',
        browserVersion: 'fixture',
        semantic: true,
        png: true,
        directInput: true,
        nativeHandoff: true,
        downloads: true,
      },
    }
  }
  async call(method, params, epoch) {
    if (epoch !== this.epoch) throw new ConnectorError('CONTROL_EPOCH_STALE', false)
    if (method === 'observe') return this.observation()
    if (method === 'pages')
      return [
        { id: 'p1', title: 'Controlled page', url: 'https://test.invalid/', openedBy: 'agent' },
      ]
    if (method === 'stream') {
      this.stream = params.enabled
      return null
    }
    if (method === 'input') {
      this.inputs.push(params)
      return { status: 'executed' }
    }
    if (method === 'act') {
      if (this.nextAction) {
        const run = this.nextAction
        this.nextAction = undefined
        return run(params, epoch)
      }
      this.actions.push(params.action)
      if (params.downloadPath) await writeFile(params.downloadPath, 'synthetic itinerary')
      return { dispatched: true, download: params.downloadPath ? 'trip.txt' : null }
    }
    return null
  }
  async fence(epoch) {
    assert.ok(epoch > this.epoch)
    this.epoch = epoch
  }
  onFrame(listener) {
    this.frames.add(listener)
    return () => this.frames.delete(listener)
  }
  onStop(listener) {
    this.stops.add(listener)
    return () => this.stops.delete(listener)
  }
  async close(finish) {
    this.finished = finish
    this.closed = true
  }
}
async function environment(t) {
  const root = await mkdtemp(join(tmpdir(), 'tz-p4-domain-'))
  const paths = resolveHostPaths({ env: { TUAI_HOME: root } })
  await ensureHostDirectories(paths)
  const ctx = new Context()
  ctx.provide('tianzhiaiHost', { paths, settings: { hostId: 'p4-test' }, credentials: {} })
  await ctx.plugin(BrowserService)
  const connector = new ConnectorFixture()
  ctx.browsers.connectorFactory = () => connector
  t.after(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  const caller = { ownerId: ctx.browsers.ownerId, sessionId: 'chat-one' }
  const state = await ctx.browsers.open(caller, 'Query a synthetic itinerary', 'request-open')
  const current = () => ctx.browsers.get(state.id, caller)
  const gate = () => {
    const s = current()
    return {
      browserId: s.id,
      executionId: s.executionId,
      fence: s.fence,
      controlEpoch: s.controlEpoch,
    }
  }
  const observe = () => ctx.browsers.observe(caller, gate(), new AbortController().signal)
  const act = async (kind = 'read', options = {}) => {
    const o = await observe()
    return ctx.browsers.act(
      caller,
      {
        ...gate(),
        operationId: options.operationId ?? randomUUID(),
        observationId: o.id,
        action: {
          kind: 'click',
          pageId: 'p1',
          ref: kind === 'external_submit' ? '@2' : '@1',
          ...options.action,
        },
      },
      async () => ({
        kind,
        reason: 'Current synthetic action',
        evidenceQuotes: ['P4 Travel'],
        ...(kind === 'external_submit' ? { summary } : {}),
        ...options.review,
      }),
      new AbortController().signal,
    )
  }
  const view = (id = 'view-one', peer = 'peer-one') =>
    ctx.browsers.registerView(caller, state.id, peer, id)
  const control = (
    action,
    id = 'view-one',
    peer = 'peer-one',
    requestId = randomUUID(),
    expected = current(),
  ) =>
    ctx.browsers.control(
      caller,
      {
        browserId: state.id,
        connectionId: id,
        requestId,
        expectedRevision: expected.revision,
        controlEpoch: expected.controlEpoch,
        action,
      },
      peer,
    )
  const input = (sequence = 1, patch = {}) =>
    ctx.browsers.input(
      caller,
      {
        browserId: state.id,
        pageId: 'p1',
        connectionId: 'view-one',
        controlEpoch: current().controlEpoch,
        sequence,
        viewportVersion: 1,
        input: { type: 'text', text: '合成中文\n第二行' },
        ...patch,
      },
      'peer-one',
    )
  const approval = (state, requestId = randomUUID()) => ({
    browserId: state.id,
    transactionId: state.transaction.id,
    version: state.transaction.version,
    digest: state.transaction.digest,
    decision: 'approve',
    requestId,
    expectedRevision: state.revision,
    controlEpoch: state.controlEpoch,
  })
  return {
    ctx,
    root,
    paths,
    connector,
    caller,
    state,
    current,
    gate,
    observe,
    act,
    view,
    control,
    input,
    approval,
  }
}

test('Task request keys reject changed content, and worker fencing rejects old owners', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tz-p4-lease-')),
    path = join(root, 'domain.sqlite3')
  const a = new TaskRuntime(path, 5000),
    b = new TaskRuntime(path, 5000)
  t.after(async () => {
    a.close()
    b.close()
    await rm(root, { recursive: true, force: true })
  })
  const binding = a.bind('owner', 'chat', 'goal', 'one')
  assert.equal(a.bind('owner', 'chat', 'goal', 'one').taskId, binding.taskId)
  assert.throws(() => a.bind('owner', 'chat', 'changed', 'one'), /TASK_REQUEST_CONFLICT/)
  assert.throws(() => b.acquire(binding.taskId), /TASK_LEASE_BUSY/)
  a.release()
  const next = b.acquire(binding.taskId)
  assert.ok(next.fence > binding.fence)
  assert.throws(() => a.check(binding), /TASK_LEASE_STALE/)
})
test('Business writes roll back together and persist independently of Session logs', async (t) => {
  const e = await environment(t)
  assert.throws(
    () =>
      e.ctx.browsers.runtime.transaction(() => {
        e.ctx.browsers.runtime.transition(e.ctx.browsers.runtime.get(e.state.taskId), 'paused')
        throw new Error('rollback')
      }),
    /rollback/,
  )
  assert.equal(e.current().taskStatus, 'running')
  assert.ok((await readFile(e.paths.database)).length > 0)
})
test('A resource cannot be read with another owner or Session binding', async (t) => {
  const e = await environment(t)
  for (const caller of [
    { ...e.caller, ownerId: 'another-owner' },
    { ...e.caller, sessionId: 'another-chat' },
  ])
    assert.throws(() => e.ctx.browsers.get(e.state.id, caller), /BROWSER_NOT_FOUND/)
})
test('Stale lease, epoch, observation and unobserved targets fail before browser dispatch', async (t) => {
  const e = await environment(t),
    o = await e.observe(),
    base = {
      ...e.gate(),
      operationId: 'action-one',
      observationId: o.id,
      action: { kind: 'click', pageId: 'p1', ref: '@1' },
    }
  for (const patch of [
    { fence: 0 },
    { controlEpoch: 0 },
    { observationId: 'missing' },
    { action: { kind: 'click', pageId: 'p1', ref: '@999' } },
  ])
    await assert.rejects(
      e.ctx.browsers.act(
        e.caller,
        { ...base, ...patch },
        async () => ({ kind: 'read', reason: 'read', evidenceQuotes: ['Search'] }),
        new AbortController().signal,
      ),
    )
  assert.equal(e.connector.actions.length, 0)
})
test('DOM mutation while Reviewer is running invalidates the pending action', async (t) => {
  const e = await environment(t),
    o = await e.observe()
  await assert.rejects(
    e.ctx.browsers.act(
      e.caller,
      {
        ...e.gate(),
        operationId: 'mutated',
        observationId: o.id,
        action: { kind: 'click', pageId: 'p1', ref: '@1' },
      },
      async () => {
        e.connector.fingerprint = 'changed'
        return { kind: 'read', reason: 'query', evidenceQuotes: ['Search'] }
      },
      new AbortController().signal,
    ),
    /STALE_OBSERVATION/,
  )
  assert.equal(e.connector.actions.length, 0)
})
test('Reviewer evidence must exist on the current page', async (t) => {
  const e = await environment(t)
  await assert.rejects(
    e.act('read', { review: { evidenceQuotes: ['invented text'] } }),
    /REVIEW_EVIDENCE_MISMATCH/,
  )
  assert.equal(e.connector.actions.length, 0)
})
test('Unknown action kinds, URLs, key chords and unsupported targets fail closed', async (t) => {
  const e = await environment(t)
  for (const action of [
    { kind: 'evaluate', pageId: 'p1' },
    { kind: 'navigate', pageId: 'p1', url: 'javascript:alert(1)' },
    { kind: 'key', pageId: 'p1', key: 'Meta+F12' },
  ])
    await assert.rejects(e.act('read', { action }))
  const rejected = await e.act('unsupported')
  assert.equal(rejected.status, 'rejected')
  assert.equal(e.current().taskStatus, 'waiting_user')
})
test('The same operation returns its receipt and never dispatches twice', async (t) => {
  const e = await environment(t),
    o = await e.observe(),
    request = {
      ...e.gate(),
      operationId: 'same-operation',
      observationId: o.id,
      action: { kind: 'click', pageId: 'p1', ref: '@1' },
    },
    review = async () => ({ kind: 'read', reason: 'query', evidenceQuotes: ['Search'] })
  const first = await e.ctx.browsers.act(e.caller, request, review, new AbortController().signal)
  assert.deepEqual(
    await e.ctx.browsers.act(e.caller, request, review, new AbortController().signal),
    first,
  )
  assert.equal(e.connector.actions.length, 1)
  await assert.rejects(
    e.ctx.browsers.act(
      e.caller,
      { ...request, action: { ...request.action, ref: '@2' } },
      review,
      new AbortController().signal,
    ),
    /BROWSER_OPERATION_CONFLICT/,
  )
})
test('Takeover stops Agent actions, accepts ordered direct input, and return creates a new observation/wake', async (t) => {
  const e = await environment(t),
    old = e.gate()
  e.view()
  await e.control('take')
  assert.equal(e.current().controller, 'human')
  await assert.rejects(
    e.ctx.browsers.observe(e.caller, old, new AbortController().signal),
    /CONTROL_EPOCH_STALE/,
  )
  await e.input()
  assert.equal(e.connector.inputs.at(-1).input.text, '合成中文\n第二行')
  const humanEpoch = e.current().controlEpoch
  await e.control('return')
  assert.ok(e.current().controlEpoch > humanEpoch)
  assert.equal(e.current().taskId, e.state.taskId)
  assert.equal(e.current().executionId, e.state.executionId)
  assert.equal(e.ctx.browsers.runtime.db.prepare('SELECT count(*) n FROM task_wakeups').get().n, 1)
  assert.ok((await e.observe()).id)
})
test('Only one concurrent CAS takeover wins', async (t) => {
  const e = await environment(t)
  e.view()
  e.view('view-two', 'peer-two')
  const initial = e.current()
  const outcomes = await Promise.allSettled([
    e.control('take', 'view-one', 'peer-one', 'take-one', initial),
    e.control('take', 'view-two', 'peer-two', 'take-two', initial),
  ])
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1)
})
test('Control identities, input sequence, page and viewport versions cannot be forged', async (t) => {
  const e = await environment(t)
  e.view()
  await e.control('take')
  await e.input()
  for (const patch of [
    { sequence: 1 },
    { connectionId: 'forged' },
    { pageId: 'p2' },
    { viewportVersion: 0 },
    { controlEpoch: 0 },
  ])
    await assert.rejects(e.input(2, patch))
  assert.equal(e.connector.inputs.filter((p) => p.input.type === 'text').length, 1)
})
test('Disconnect keeps human control, fences old input and does not schedule a return', async (t) => {
  const e = await environment(t)
  e.view()
  await e.control('take')
  const epoch = e.current().controlEpoch
  e.ctx.browsers.removeView(e.state.id, 'view-one')
  assert.equal(e.current().controller, 'human')
  assert.ok(e.current().controlEpoch > epoch)
  await assert.rejects(e.input(1))
  assert.equal(e.ctx.browsers.runtime.db.prepare('SELECT count(*) n FROM task_wakeups').get().n, 0)
})
test('A hidden view stops its stream while preserving the Ego page and task', async (t) => {
  const e = await environment(t)
  e.view()
  const off = await e.ctx.browsers.subscribeFrames(
    e.caller,
    e.state.id,
    'view-one',
    'peer-one',
    () => {},
  )
  assert.equal(e.connector.stream, true)
  off()
  await Promise.resolve()
  assert.equal(e.connector.stream, false)
  assert.equal(e.connector.closed, false)
  assert.equal(e.current().lifecycle, 'open')
})
test('Prepared transaction needs concrete UI approval and duplicate approval cannot submit again', async (t) => {
  const e = await environment(t)
  const prepared = await e.act('external_submit')
  assert.equal(prepared.status, 'awaiting_confirmation')
  assert.equal(e.connector.actions.length, 0)
  assert.equal(e.current().taskStatus, 'waiting_approval')
  const request = e.approval(e.current(), 'approval-one')
  await e.ctx.browsers.approve(e.caller, request, new AbortController().signal)
  assert.equal(e.connector.actions.length, 1)
  assert.equal(e.current().transaction.state, 'submitted')
  assert.equal(e.current().taskStatus, 'needs_reconciliation')
  await e.ctx.browsers.approve(e.caller, request, new AbortController().signal)
  assert.equal(e.connector.actions.length, 1)
})
test('Price/target changes and expired approvals invalidate authorization', async (t) => {
  const e = await environment(t)
  await e.act('external_submit')
  const request = e.approval(e.current())
  e.connector.fingerprint = 'changed-price'
  await assert.rejects(
    e.ctx.browsers.approve(e.caller, request, new AbortController().signal),
    /BROWSER_APPROVAL_STALE/,
  )
  assert.equal(e.connector.actions.length, 0)
  assert.equal(e.current().transaction.state, 'invalidated')
})
test('Takeover invalidates an old concrete approval', async (t) => {
  const e = await environment(t)
  await e.act('external_submit')
  const request = e.approval(e.current())
  e.view()
  await e.control('take')
  await e.control('return')
  await assert.rejects(e.ctx.browsers.approve(e.caller, request, new AbortController().signal))
  assert.equal(e.connector.actions.length, 0)
})
test('Accepted-but-lost receipt becomes unknown and forbids another external write', async (t) => {
  const e = await environment(t)
  await e.act('external_submit')
  let accepted = 0
  e.connector.nextAction = () => {
    accepted++
    throw new ConnectorError('SITE_ACCEPTED_RECEIPT_LOST', true)
  }
  await e.ctx.browsers.approve(e.caller, e.approval(e.current()), new AbortController().signal)
  assert.equal(e.current().transaction.state, 'unknown')
  assert.equal(e.current().taskStatus, 'needs_reconciliation')
  assert.equal(accepted, 1)
  await assert.rejects(e.act('external_submit'), /NEEDS_RECONCILIATION/)
  assert.equal(accepted, 1)
  assert.equal((await e.act('read')).status, 'executed')
  const o = await e.observe()
  await e.ctx.browsers.reconcile(
    e.caller,
    e.gate(),
    o.id,
    async () => ({
      orderId: 'order-evidence',
      orderState: 'reserved',
      paid: false,
      ticketed: false,
      evidenceDigest: o.fingerprint,
    }),
    new AbortController().signal,
  )
  assert.equal(e.current().transaction.result.paid, false)
  assert.equal(e.current().transaction.result.ticketed, false)
  assert.equal(e.current().transaction.state, 'reconciled')
})
test('Cancellation closes owned resources and does not claim order cancellation or refund', async (t) => {
  const e = await environment(t)
  e.view()
  await e.control('cancel')
  assert.equal(e.current().taskStatus, 'cancelled')
  assert.equal(e.current().lifecycle, 'closed')
  assert.equal(e.connector.closed, true)
})
test('Downloads are private artifacts bound to the owning Session', async (t) => {
  const e = await environment(t)
  const receipt = await e.act('read', { action: { kind: 'download', pageId: 'p1', ref: '@1' } })
  const items = e.ctx.browsers.artifacts(e.caller)
  assert.equal(items.length, 1)
  assert.equal(items[0].id, receipt.artifactId)
  assert.equal(
    new TextDecoder().decode(await e.ctx.browsers.artifactBytes(e.caller, items[0].id)),
    'synthetic itinerary',
  )
  await assert.rejects(
    e.ctx.browsers.artifactBytes({ ...e.caller, sessionId: 'other' }, items[0].id),
    /BROWSER_ARTIFACT_NOT_FOUND/,
  )
})
test('Input content and secrets do not appear in durable operation/audit records', async (t) => {
  const e = await environment(t)
  e.view()
  await e.control('take')
  await e.input(1, { input: { type: 'text', text: 'synthetic-secret-不得记录' } })
  const rows = e.ctx.browsers.runtime.db.prepare('SELECT * FROM task_events').all(),
    ops = e.ctx.browsers.runtime.db.prepare('SELECT * FROM browser_operations').all()
  assert.equal(JSON.stringify([...rows, ...ops]).includes('synthetic-secret'), false)
})
test('Connector stop suspends the task, increments epoch and never silently creates another space', async (t) => {
  const e = await environment(t)
  const epoch = e.current().controlEpoch
  for (const listener of e.connector.stops) listener('EGO_NATIVE_HUMAN')
  assert.equal(e.current().egoState, 'native-human')
  assert.ok(e.current().controlEpoch > epoch)
  assert.equal(e.current().taskStatus, 'waiting_user')
  assert.equal(e.current().spaceId, 101)
})

test('Control return and transaction approval have independent idempotent wake identities', async (t) => {
  const e = await environment(t)
  e.view()
  await e.control('take')
  await e.control('return')
  await e.act('external_submit')
  await e.ctx.browsers.approve(e.caller, e.approval(e.current()), new AbortController().signal)
  const rows = e.ctx.browsers.runtime.db.prepare('SELECT cause FROM task_wakeups').all()
  assert.equal(rows.length, 2)
  assert.notEqual(rows[0].cause, rows[1].cause)
})
test('Lease loss while SDK is in flight cannot persist a late receipt', async (t) => {
  const e = await environment(t),
    other = new TaskRuntime(e.paths.database)
  t.after(() => other.close())
  e.connector.nextAction = () => {
    e.ctx.browsers.runtime.release()
    other.acquire(e.state.taskId)
    return { dispatched: true }
  }
  await assert.rejects(e.act('read'), /TASK_LEASE_STALE/)
  const op = e.ctx.browsers.runtime.db.prepare('SELECT state FROM browser_operations').get()
  assert.equal(op.state, 'intent')
})
test('Expired approval never dispatches', async (t) => {
  const e = await environment(t)
  await e.act('external_submit')
  const before = e.current()
  before.transaction.expiresAt = Date.now() - 1
  e.ctx.browsers.runtime.db
    .prepare('UPDATE browser_sessions SET state=? WHERE id=?')
    .run(JSON.stringify(before), before.id)
  await assert.rejects(
    e.ctx.browsers.approve(e.caller, e.approval(before), new AbortController().signal),
    /BROWSER_APPROVAL_STALE/,
  )
  assert.equal(e.connector.actions.length, 0)
})

test('Unknown transaction forbids direct human input and another tab handoff cannot steal control', async (t) => {
  const e = await environment(t)
  await e.act('external_submit')
  e.connector.nextAction = () => {
    throw new ConnectorError('LOST', true)
  }
  await e.ctx.browsers.approve(e.caller, e.approval(e.current()), new AbortController().signal)
  e.view()
  await e.control('take')
  await assert.rejects(e.input(), /NEEDS_RECONCILIATION/)
  e.view('view-two', 'peer-two')
  await assert.rejects(
    e.control('native-handoff', 'view-two', 'peer-two'),
    /BROWSER_CONTROL_NOT_OWNED/,
  )
  await e.control('return')
  assert.equal(e.current().taskStatus, 'needs_reconciliation')
  await assert.rejects(e.control('native-handoff'), /NEEDS_RECONCILIATION/)
})
test('Recovery marks abandoned intents unknown without taking over a live worker lease', async (t) => {
  const e = await environment(t)
  e.ctx.browsers.runtime.db
    .prepare("INSERT INTO browser_operations VALUES (?,?,?,'intent',?,NULL,?)")
    .run(e.state.id, 'crash-intent', 'hash', 'click', Date.now())
  const second = new Context()
  second.provide('tianzhiaiHost', {
    paths: e.paths,
    settings: { hostId: 'p4-test' },
    credentials: {},
  })
  await second.plugin(BrowserService)
  assert.equal(
    second.browsers.runtime.db.prepare('SELECT state FROM browser_operations').get().state,
    'intent',
  )
  await second.fiber.dispose()
  e.ctx.browsers.runtime.release()
  const recovered = new Context()
  recovered.provide('tianzhiaiHost', {
    paths: e.paths,
    settings: { hostId: 'p4-test' },
    credentials: {},
  })
  await recovered.plugin(BrowserService)
  try {
    const state = recovered.browsers.get(e.state.id, e.caller)
    assert.equal(state.taskStatus, 'needs_reconciliation')
    assert.equal(state.lifecycle, 'error')
    assert.equal(state.spaceId, e.state.spaceId)
    assert.equal(
      recovered.browsers.runtime.db.prepare('SELECT state FROM browser_operations').get().state,
      'unknown',
    )
    assert.equal(
      recovered.browsers.runtime.db.prepare('SELECT count(*) n FROM task_wakeups').get().n,
      0,
    )
  } finally {
    await recovered.fiber.dispose()
  }
})

test('Connector, viewer and pending-input budgets reject overflow before another dispatch', async (t) => {
  const e = await environment(t)
  for (let i = 0; i < 4; i++) e.view('view-' + i, 'peer-' + i)
  assert.throws(() => e.view('view-overflow', 'peer-overflow'), /BROWSER_VIEW_LIMIT/)
  e.ctx.browsers.connectorFactory = () => new ConnectorFixture()
  for (let i = 0; i < 3; i++)
    await e.ctx.browsers.open(
      { ...e.caller, sessionId: 'budget-' + i },
      'Budget case',
      'budget-' + i,
    )
  await assert.rejects(
    e.ctx.browsers.open(
      { ...e.caller, sessionId: 'budget-overflow' },
      'Budget overflow',
      'budget-overflow',
    ),
    /BROWSER_RESOURCE_LIMIT/,
  )
  await e.control('take', 'view-0', 'peer-0')
  let release
  const held = new Promise((resolve) => {
      release = resolve
    }),
    original = e.connector.call.bind(e.connector)
  e.connector.call = async (method, params, epoch) => {
    if (method === 'input' && params.input.type === 'text') await held
    return original(method, params, epoch)
  }
  const inputs = []
  try {
    for (let sequence = 1; sequence <= 128; sequence++)
      inputs.push(
        e.ctx.browsers.input(
          e.caller,
          {
            browserId: e.state.id,
            pageId: 'p1',
            connectionId: 'view-0',
            controlEpoch: e.current().controlEpoch,
            sequence,
            viewportVersion: 1,
            input: { type: 'text', text: 'x' },
          },
          'peer-0',
        ),
      )
    await assert.rejects(
      e.ctx.browsers.input(
        e.caller,
        {
          browserId: e.state.id,
          pageId: 'p1',
          connectionId: 'view-0',
          controlEpoch: e.current().controlEpoch,
          sequence: 129,
          viewportVersion: 1,
          input: { type: 'text', text: 'overflow' },
        },
        'peer-0',
      ),
      /INPUT_QUEUE_LIMIT/,
    )
  } finally {
    release()
    await Promise.all(inputs)
  }
  assert.equal(e.connector.inputs.filter((v) => v.input.type === 'text').length, 128)
})
test('Artifact count budget rejects the next download and keeps existing owned artifacts readable', async (t) => {
  const e = await environment(t)
  for (let i = 0; i < 64; i++)
    await e.act('read', { action: { kind: 'download', pageId: 'p1', ref: '@1' } })
  await assert.rejects(
    e.act('read', { action: { kind: 'download', pageId: 'p1', ref: '@1' } }),
    /BROWSER_ARTIFACT_BUDGET/,
  )
  assert.equal(e.connector.actions.length, 64)
  const items = e.ctx.browsers.artifacts(e.caller)
  assert.equal(items.length, 64)
  assert.equal(
    new TextDecoder().decode(await e.ctx.browsers.artifactBytes(e.caller, items[0].id)),
    'synthetic itinerary',
  )
})

test('A screenshot whose worker lease expired before publication is removed without an artifact receipt', async (t) => {
  const e = await environment(t),
    other = new TaskRuntime(e.paths.database),
    o = await e.observe(),
    base = e.connector.call.bind(e.connector)
  t.after(() => other.close())
  e.connector.call = async (method, params, epoch) => {
    if (method === 'capture') {
      await writeFile(params.path, 'unpublished screenshot')
      e.ctx.browsers.runtime.release()
      other.acquire(e.state.taskId)
      return null
    }
    return base(method, params, epoch)
  }
  await assert.rejects(
    e.ctx.browsers.capture(e.caller, e.gate(), o.id, new AbortController().signal),
    /TASK_LEASE_STALE/,
  )
  assert.equal(e.ctx.browsers.artifacts(e.caller).length, 0)
  assert.deepEqual(await readdir(join(e.paths.downloads, e.state.id)), [])
})

test('A new native-return SDK round resets the surviving view stream and starts fresh frames', async (t) => {
  const e = await environment(t)
  e.view()
  const stop = await e.ctx.browsers.subscribeFrames(
    e.caller,
    e.state.id,
    'view-one',
    'peer-one',
    () => {},
  )
  await e.control('native-handoff')
  for (const fn of e.connector.stops) fn('EGO_NATIVE_HUMAN')
  const fresh = new ConnectorFixture()
  e.ctx.browsers.connectorFactory = () => fresh
  await e.control('return')
  const off = await e.ctx.browsers.subscribeFrames(
    e.caller,
    e.state.id,
    'view-one',
    'peer-one',
    () => {},
  )
  assert.equal(fresh.stream, true)
  off()
  stop()
})
test('A lost input receipt is explicitly unknown and cannot be replayed after reconnect', async (t) => {
  const e = await environment(t)
  e.view()
  await e.control('take')
  const original = e.connector.call.bind(e.connector)
  e.connector.call = async (method, params, epoch) => {
    if (method === 'input') throw new ConnectorError('INPUT_RECEIPT_LOST', true)
    return original(method, params, epoch)
  }
  await assert.rejects(
    e.input(),
    (error) => error.status === 'unknown' && error.message === 'INPUT_RECEIPT_LOST',
  )
  assert.equal(e.current().needsReconciliation, true)
  assert.equal(e.current().lifecycle, 'error')
  await assert.rejects(e.input(2), /CONTROL_EPOCH_STALE/)
})

test('Host recovery preserves native human control and never turns reconnect into an implicit return', async (t) => {
  const e = await environment(t)
  for (const fn of e.connector.stops) fn('EGO_NATIVE_HUMAN')
  e.ctx.browsers.runtime.release()
  const recovered = new Context()
  recovered.provide('tianzhiaiHost', {
    paths: e.paths,
    settings: { hostId: 'p4-test' },
    credentials: {},
  })
  await recovered.plugin(BrowserService)
  try {
    const state = recovered.browsers.get(e.state.id, e.caller)
    assert.equal(state.egoState, 'native-human')
    assert.equal(state.executionId, e.state.executionId)
    await assert.rejects(
      recovered.browsers.control(
        e.caller,
        {
          browserId: state.id,
          requestId: randomUUID(),
          expectedRevision: state.revision,
          controlEpoch: state.controlEpoch,
          connectionId: 'new-view',
          action: 'reconnect',
        },
        'new-peer',
      ),
      /NATIVE_RETURN_REQUIRED/,
    )
  } finally {
    await recovered.fiber.dispose()
  }
})

test('Cancelling native human control stops the task without closing user-controlled Ego pages', async (t) => {
  const e = await environment(t)
  e.view()
  for (const fn of e.connector.stops) fn('EGO_NATIVE_HUMAN')
  await e.control('cancel')
  assert.equal(e.current().taskStatus, 'cancelled')
  assert.equal(e.current().lifecycle, 'closed')
  assert.equal(e.connector.finished, false)
})
test('An authenticated owner can cancel a recovered disconnected task without taking over Ego', async (t) => {
  const e = await environment(t)
  for (const fn of e.connector.stops) fn('EGO_NATIVE_HUMAN')
  e.ctx.browsers.runtime.release()
  const recovered = new Context()
  recovered.provide('tianzhiaiHost', {
    paths: e.paths,
    settings: { hostId: 'p4-test' },
    credentials: {},
  })
  await recovered.plugin(BrowserService)
  try {
    recovered.browsers.connectorFactory = () => {
      throw new Error('Cancellation must not start SDK')
    }
    const state = recovered.browsers.get(e.state.id, e.caller)
    const result = await recovered.browsers.control(
      e.caller,
      {
        browserId: state.id,
        requestId: randomUUID(),
        expectedRevision: state.revision,
        controlEpoch: state.controlEpoch,
        connectionId: 'owner-view',
        action: 'cancel',
      },
      'owner-peer',
    )
    assert.equal(result.taskStatus, 'cancelled')
    assert.equal(result.lifecycle, 'closed')
    assert.equal(result.egoState, 'native-human')
  } finally {
    await recovered.fiber.dispose()
  }
})
