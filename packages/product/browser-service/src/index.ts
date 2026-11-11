import type {} from '@tuai/host-config'
import { Context, Service } from '@deepseek-ai/cordis'
import {
  EgoConnector,
  ConnectorError,
  type EgoConnectorPort,
  type BrowserObservation,
  type CheckedAction,
  type MediaFrame,
  type InputResult,
} from '@tuai/ego-connector'
import { TaskRuntime, digest, type ExecutionBinding } from '@tuai/task-runtime'
import { randomUUID } from 'node:crypto'
import { join, basename } from 'node:path'
import { mkdir, lstat, open, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import type {
  ActionRequest,
  ApprovalRequest,
  BrowserArtifact,
  BrowserGate,
  BrowserSnapshot,
  ControlRequest,
  InputEnvelope,
  OperationReceipt,
  ReviewDecision,
  TransactionView,
} from './types.ts'
import {
  actionRequestSchema,
  approvalSchema,
  controlSchema,
  inputEnvelopeSchema,
  reviewSchema,
} from './schema.ts'
export type * from './types.ts'

export class BrowserInputError extends Error {
  constructor(
    readonly status: 'rejected' | 'unknown',
    code: string,
  ) {
    super(code)
  }
}

const unavailable = {
  available: false,
  cliVersion: '',
  browserVersion: '',
  semantic: false,
  png: false,
  directInput: false,
  nativeHandoff: false,
  downloads: false,
}
export interface BrowserCaller {
  ownerId: string
  sessionId: string
}
export type BrowserReviewer = (
  observation: BrowserObservation,
  action: CheckedAction,
  signal: AbortSignal,
) => Promise<ReviewDecision>
interface LiveBrowser {
  connector: EgoConnectorPort
  binding: ExecutionBinding
  observation?: BrowserObservation
  views: Map<
    string,
    {
      peerId: string
      sequence: number
      sent: number
      pending: number
      stream: boolean
      connected: boolean
    }
  >
  humanConnection?: string
  inputEpoch?: number
  frameListeners: Set<(meta: MediaFrame, bytes: Uint8Array) => void>
  inFlight: Set<string>
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    browsers: BrowserService
  }
}

/** Domain authority, independent of renderer state, model assertions, and SDK handles. */
export class BrowserService extends Service {
  static inject = ['tianzhiaiHost']
  readonly runtime: TaskRuntime
  private live = new Map<string, LiveBrowser>()
  private disposed = false
  private changes = new Set<() => void>()
  private controlListeners = new Set<(snapshot: BrowserSnapshot) => void>()
  private wakeListeners = new Set<(snapshot: BrowserSnapshot) => void>()
  connectorFactory: () => EgoConnectorPort = () => new EgoConnector()
  constructor(ctx: Context) {
    super(ctx, 'browsers')
    this.runtime = new TaskRuntime(ctx.tianzhiaiHost.paths.database)
    this.runtime.transaction(() => {
      this.runtime.db.exec(`
        CREATE TABLE IF NOT EXISTS browser_goal_suspensions (task_id TEXT PRIMARY KEY REFERENCES tasks(id), goal_id TEXT NOT NULL, revision INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS browser_sessions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id), owner_id TEXT NOT NULL, session_id TEXT NOT NULL, state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS browser_operations (browser_id TEXT NOT NULL REFERENCES browser_sessions(id), id TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, kind TEXT NOT NULL, receipt TEXT, at INTEGER NOT NULL, PRIMARY KEY(browser_id,id));
        CREATE TABLE IF NOT EXISTS browser_transactions (id TEXT PRIMARY KEY, browser_id TEXT NOT NULL REFERENCES browser_sessions(id), state TEXT NOT NULL, action TEXT NOT NULL, observation TEXT NOT NULL, epoch INTEGER NOT NULL, intent TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS browser_controls (browser_id TEXT NOT NULL REFERENCES browser_sessions(id), request_id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(browser_id,request_id));
        CREATE TABLE IF NOT EXISTS browser_artifacts (id TEXT PRIMARY KEY, browser_id TEXT NOT NULL REFERENCES browser_sessions(id), session_id TEXT NOT NULL, name TEXT NOT NULL, bytes INTEGER NOT NULL, media_type TEXT NOT NULL, path TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS browser_operation_states ON browser_operations(browser_id,state);
      `)
      // A saved intent cannot prove the external action was never accepted.
      this.runtime.db
        .prepare(
          "UPDATE browser_operations SET state='unknown' WHERE state='intent' AND browser_id IN (SELECT b.id FROM browser_sessions b JOIN executions e ON b.task_id=e.task_id WHERE e.lease_until <= ?)",
        )
        .run(Date.now())
      for (const row of this.runtime.db.prepare('SELECT id,state FROM browser_sessions').all()) {
        const state = JSON.parse(String(row.state)) as BrowserSnapshot
        if (state.lifecycle === 'closed' || this.runtime.get(state.taskId).leaseUntil > Date.now())
          continue
        state.lifecycle = 'error'
        state.egoState = state.egoState === 'native-human' ? 'native-human' : 'unknown'
        state.controlEpoch++
        state.revision++
        state.error = 'HOST_RESTARTED'
        if (state.controller !== 'human') state.controller = 'none'
        state.capabilities = { ...unavailable }
        const unknown = this.runtime.db
          .prepare("SELECT 1 FROM browser_operations WHERE browser_id=? AND state='unknown'")
          .get(state.id)
        this.runtime.db
          .prepare(
            "UPDATE tasks SET status=?,revision=revision+1 WHERE id=? AND status NOT IN ('succeeded','failed','cancelled')",
          )
          .run(unknown ? 'needs_reconciliation' : 'paused', state.taskId)
        this.invalidateTransactions(state)
        this.save(state, 'host-recovered')
      }
    })
    const heartbeat = setInterval(() => {
      for (const [id, live] of this.live) {
        try {
          this.runtime.renew(live.binding)
        } catch {
          this.disconnected(id, 'TASK_LEASE_STALE')
        }
      }
    }, 5000)
    heartbeat.unref()
    ctx.effect(() => async () => {
      this.disposed = true
      this.changes.clear()
      this.controlListeners.clear()
      this.wakeListeners.clear()
      clearInterval(heartbeat)
      await Promise.allSettled([...this.live.values()].map((live) => live.connector.close(false)))
      this.live.clear()
      this.runtime.close()
    })
  }
  get ownerId(): string {
    return `owner:${this.ctx.tianzhiaiHost.settings.hostId}`
  }
  onChange(listener: () => void): () => void {
    this.changes.add(listener)
    return () => {
      this.changes.delete(listener)
    }
  }
  onControl(listener: (snapshot: BrowserSnapshot) => void): () => void {
    this.controlListeners.add(listener)
    return () => {
      this.controlListeners.delete(listener)
    }
  }
  onWake(listener: (snapshot: BrowserSnapshot) => void): () => void {
    this.wakeListeners.add(listener)
    return () => {
      this.wakeListeners.delete(listener)
    }
  }
  list(caller: BrowserCaller): BrowserSnapshot[] {
    return this.runtime.db
      .prepare('SELECT id FROM browser_sessions WHERE owner_id=? AND session_id=?')
      .all(caller.ownerId, caller.sessionId)
      .map((row) => this.get(String(row.id), caller))
  }
  forOwner(ownerId: string): BrowserSnapshot[] {
    if (ownerId !== this.ownerId) throw new Error('BROWSER_OWNER_REQUIRED')
    return this.runtime.db
      .prepare(
        'SELECT id,session_id FROM browser_sessions WHERE owner_id=? ORDER BY rowid DESC LIMIT 100',
      )
      .all(ownerId)
      .map((row) => this.get(String(row.id), { ownerId, sessionId: String(row.session_id) }))
  }
  get(id: string, caller: BrowserCaller): BrowserSnapshot {
    const row = this.runtime.db
      .prepare('SELECT state FROM browser_sessions WHERE id=? AND owner_id=? AND session_id=?')
      .get(id, caller.ownerId, caller.sessionId)
    if (!row) throw new Error('BROWSER_NOT_FOUND')
    const state = JSON.parse(String(row.state)) as BrowserSnapshot
    const task = this.runtime.get(state.taskId)
    if (!this.live.has(state.id) && state.lifecycle === 'open') {
      state.lifecycle = 'error'
      state.egoState = state.egoState === 'native-human' ? 'native-human' : 'unknown'
      state.error = 'BROWSER_CONNECTION_REQUIRED'
      state.capabilities.available = false
      if (state.controller !== 'human') state.controller = 'none'
    }
    return {
      ...state,
      needsReconciliation: !!(
        (state.transaction && ['submitted', 'unknown'].includes(state.transaction.state)) ||
        this.runtime.db
          .prepare("SELECT 1 FROM browser_operations WHERE browser_id=? AND state='unknown'")
          .get(state.id)
      ),
      taskStatus: task.status,
      leaseUntil: task.leaseUntil,
      fence: task.fence,
    }
  }
  private own(id: string): BrowserSnapshot {
    const row = this.runtime.db
      .prepare('SELECT owner_id,session_id FROM browser_sessions WHERE id=?')
      .get(id)
    if (!row) throw new Error('BROWSER_NOT_FOUND')
    return this.get(id, { ownerId: String(row.owner_id), sessionId: String(row.session_id) })
  }
  private save(
    state: BrowserSnapshot,
    event: string,
    detail: Record<string, unknown> = {},
  ): BrowserSnapshot {
    const live = this.live.get(state.id)
    if (live) this.runtime.assertFence(live.binding)
    state.revision++
    this.runtime.db
      .prepare('UPDATE browser_sessions SET state=? WHERE id=?')
      .run(JSON.stringify(state), state.id)
    this.runtime.event(state.taskId, event, {
      browserId: state.id,
      epoch: state.controlEpoch,
      ...detail,
    })
    // Notifications are only wake hints; readers always load the committed snapshot.
    queueMicrotask(() => {
      for (const listener of this.changes) listener()
    })
    return state
  }
  async open(caller: BrowserCaller, goal: string, requestId: string): Promise<BrowserSnapshot> {
    if (caller.ownerId !== this.ownerId) throw new Error('BROWSER_OWNER_REQUIRED')
    const existing = this.list(caller).find((state) => state.lifecycle !== 'closed')
    if (existing) return existing
    if (this.live.size >= 4) throw new Error('BROWSER_RESOURCE_LIMIT')
    const binding = this.runtime.bind(caller.ownerId, caller.sessionId, goal, requestId)
    const snapshot: BrowserSnapshot = {
      id: randomUUID(),
      hostId: this.ctx.tianzhiaiHost.settings.hostId,
      ownerId: caller.ownerId,
      sessionId: caller.sessionId,
      taskId: binding.taskId,
      executionId: binding.executionId,
      fence: binding.fence,
      leaseUntil: binding.leaseUntil,
      connectorId: randomUUID(),
      profileGrantId: `ego-owner:${caller.ownerId}`,
      lifecycle: 'starting',
      controller: 'agent',
      egoState: 'unknown',
      revision: 1,
      controlEpoch: 1,
      waitEventId: 0,
      pageId: '',
      pages: [],
      viewport: { width: 1, height: 1, dpr: 1, version: 0 },
      capabilities: { ...unavailable },
      taskStatus: 'running',
      needsReconciliation: false,
    }
    this.runtime.db
      .prepare('INSERT INTO browser_sessions VALUES (?,?,?,?,?)')
      .run(snapshot.id, binding.taskId, caller.ownerId, caller.sessionId, JSON.stringify(snapshot))
    return this.connect(snapshot, binding, false)
  }
  private async connect(
    state: BrowserSnapshot,
    binding: ExecutionBinding,
    explicitNativeReturn: boolean,
  ): Promise<BrowserSnapshot> {
    const prior = this.live.get(state.id)
    if (prior) {
      this.live.delete(state.id)
      await prior.connector.close(false)
    }
    const connector = this.connectorFactory()
    // New SDK rounds have no active screencast, even when the view survives.
    for (const view of prior?.views.values() ?? []) view.stream = false
    const live: LiveBrowser = {
      connector,
      binding,
      views: prior?.views ?? new Map(),
      frameListeners: prior?.frameListeners ?? new Set(),
      inFlight: new Set(),
      ...(prior?.humanConnection ? { humanConnection: prior.humanConnection } : {}),
    }
    this.live.set(state.id, live)
    connector.onStop((code) => {
      if (this.live.get(state.id) === live) this.disconnected(state.id, code)
    })
    connector.onFrame((meta, bytes) => {
      if (this.disposed || this.live.get(state.id) !== live) return
      try {
        this.runtime.assertFence(live.binding)
      } catch {
        this.disconnected(state.id, 'TASK_LEASE_STALE')
        return
      }
      const current = this.own(state.id)
      if (current.lifecycle !== 'open' || meta.pageId !== current.pageId) return
      if (digest(meta.viewport) !== digest(current.viewport)) {
        current.viewport = meta.viewport
        this.runtime.db
          .prepare('UPDATE browser_sessions SET state=? WHERE id=?')
          .run(JSON.stringify(current), state.id)
      }
      for (const listener of live.frameListeners) listener(meta, bytes)
    })
    try {
      const ready = await connector.start({
        name: `TIanZhiAI-${binding.taskId}`,
        epoch: state.controlEpoch,
        ...(state.spaceId === undefined ? {} : { spaceId: state.spaceId }),
        ...(state.pageId ? { pageId: state.pageId } : {}),
        ...(explicitNativeReturn ? { explicitNativeReturn: true } : {}),
      })
      const current = this.own(state.id)
      if (current.controlEpoch !== state.controlEpoch) throw new Error('CONTROL_EPOCH_STALE')
      Object.assign(current, {
        spaceId: ready.spaceId,
        pages: ready.pages,
        pageId: ready.pageId,
        viewport: ready.viewport,
        capabilities: ready.capabilities,
        lifecycle: 'open',
        egoState: 'agent',
      })
      delete current.error
      if (
        current.controller === 'human' &&
        live.humanConnection &&
        live.views.get(live.humanConnection)?.connected
      ) {
        live.inputEpoch = current.controlEpoch
        current.controlConnectionId = live.humanConnection
      }
      return this.save(current, 'browser-connected')
    } catch (error) {
      this.disconnected(state.id, error instanceof ConnectorError ? error.code : 'EGO_UNAVAILABLE')
      throw error
    }
  }
  private disconnected(id: string, code: string): void {
    let state: BrowserSnapshot
    try {
      state = this.own(id)
    } catch {
      return
    }
    if (
      state.egoState === 'native-human' &&
      ['EGO_DISCONNECTED', 'EGO_CONNECTOR_EXITED'].includes(code)
    )
      return
    if (state.lifecycle === 'closed' || (state.error === code && state.lifecycle === 'error'))
      return
    const live = this.live.get(id)
    if (live) {
      try {
        this.runtime.assertFence(live.binding)
      } catch {
        this.live.delete(id)
        void live.connector.close(false)
        queueMicrotask(() => {
          for (const listener of this.changes) listener()
        })
        return
      }
    }
    state.controlEpoch++
    state.lifecycle = 'error'
    state.egoState = code === 'EGO_NATIVE_HUMAN' ? 'native-human' : 'unknown'
    state.error = code
    if (state.controller !== 'human') state.controller = 'none'
    if (live) {
      delete live.observation
      for (const operation of live.inFlight)
        this.finishOperation(
          id,
          operation,
          'unknown',
          { status: 'unknown', id: operation, browserId: id },
          live.binding,
        )
      try {
        this.runtime.transition(
          live.binding,
          live.inFlight.size ? 'needs_reconciliation' : 'waiting_user',
          'browser-disconnected',
        )
      } catch {
        /* A fenced worker cannot update task facts. */
      }
    }
    this.invalidateTransactions(state)
    this.save(state, 'browser-disconnected', { code })
    for (const listener of this.controlListeners) listener(state)
  }
  private access(caller: BrowserCaller, gate: BrowserGate, allowWaiting = false) {
    const state = this.get(gate.browserId, caller),
      live = this.live.get(state.id)
    if (!live || state.lifecycle !== 'open') throw new Error('BROWSER_DISCONNECTED')
    this.runtime.check(
      { taskId: state.taskId, executionId: gate.executionId, fence: gate.fence },
      allowWaiting,
    )
    if (
      state.controlEpoch !== gate.controlEpoch ||
      state.controller !== 'agent' ||
      state.egoState !== 'agent'
    )
      throw new Error('CONTROL_EPOCH_STALE')
    return { state, live }
  }
  async observe(
    caller: BrowserCaller,
    gate: BrowserGate,
    signal: AbortSignal,
  ): Promise<BrowserObservation> {
    const { state, live } = this.access(caller, gate, true)
    const observation = await live.connector.call<BrowserObservation>(
      'observe',
      {},
      state.controlEpoch,
      signal,
    )
    this.access(caller, gate, true)
    live.observation = observation
    const pages = await live.connector.call<BrowserSnapshot['pages']>(
      'pages',
      {},
      state.controlEpoch,
      signal,
    )
    const current = this.get(state.id, caller)
    if (digest(pages) !== digest(current.pages) || observation.pageId !== current.pageId) {
      current.pages = pages
      current.pageId = observation.pageId
      current.viewport = observation.viewport
      this.save(current, 'browser-pages')
    }
    return observation
  }
  private operation(
    state: BrowserSnapshot,
    id: string,
    hash: string,
  ): OperationReceipt | undefined {
    const old = this.runtime.db
      .prepare('SELECT digest,state,receipt FROM browser_operations WHERE browser_id=? AND id=?')
      .get(state.id, id)
    if (!old) return undefined
    if (old.digest !== hash) throw new Error('BROWSER_OPERATION_CONFLICT')
    if (old.receipt) return JSON.parse(String(old.receipt)) as OperationReceipt
    return { id, browserId: state.id, status: old.state === 'rejected' ? 'rejected' : 'unknown' }
  }
  private startOperation(state: BrowserSnapshot, id: string, hash: string, kind: string): void {
    this.runtime.db
      .prepare("INSERT INTO browser_operations VALUES (?,?,?,'intent',?,NULL,?)")
      .run(state.id, id, hash, kind, Date.now())
    this.runtime.event(state.taskId, 'browser-operation-intent', {
      browserId: state.id,
      operationId: id,
      kind,
      digest: hash,
    })
  }
  private finishOperation(
    browserId: string,
    id: string,
    status: string,
    receipt: OperationReceipt,
    binding: ExecutionBinding,
  ) {
    this.runtime.assertFence(binding)
    this.runtime.db
      .prepare('UPDATE browser_operations SET state=?,receipt=? WHERE browser_id=? AND id=?')
      .run(status, JSON.stringify(receipt), browserId, id)
  }
  async act(
    caller: BrowserCaller,
    request: ActionRequest,
    reviewer: BrowserReviewer,
    signal: AbortSignal,
  ): Promise<OperationReceipt> {
    const parsed = actionRequestSchema.parse(request)
    const { state, live } = this.access(caller, parsed, true)
    if (!['running', 'needs_reconciliation'].includes(this.runtime.get(state.taskId).status))
      throw new Error('TASK_WAITING')
    const action = parsed.action as CheckedAction
    const hash = digest({ action, observationId: parsed.observationId })
    const duplicate = this.operation(state, parsed.operationId, hash)
    if (duplicate) return duplicate
    const old = live.observation
    if (
      !old ||
      old.id !== parsed.observationId ||
      (action.pageId !== old.pageId && action.kind !== 'switch')
    )
      throw new Error('STALE_OBSERVATION')
    this.validateAction(action, old)
    const unknown =
      this.runtime.db
        .prepare("SELECT 1 FROM browser_operations WHERE browser_id=? AND state='unknown'")
        .get(state.id) ||
      (state.transaction && ['submitted', 'unknown'].includes(state.transaction.state))
    const decision = reviewSchema.parse(await reviewer(old, action, signal))
    if (decision.evidenceQuotes.some((quote) => !old.text.includes(quote)))
      throw new Error('REVIEW_EVIDENCE_MISMATCH')
    this.access(caller, parsed, true)
    if (['sensitive', 'unsupported'].includes(decision.kind)) {
      this.needHuman(caller, state.id, decision.reason)
      return { id: parsed.operationId, browserId: state.id, status: 'rejected' }
    }
    if (unknown && decision.kind !== 'read') throw new Error('NEEDS_RECONCILIATION')
    // Read classifications are still bound to independently regenerated current evidence.
    const fresh = await live.connector.call<BrowserObservation>(
      'observe',
      {},
      state.controlEpoch,
      signal,
    )
    this.access(caller, parsed, true)
    if (fresh.fingerprint !== old.fingerprint && action.kind !== 'switch') {
      live.observation = fresh
      throw new Error('STALE_OBSERVATION')
    }
    const oldRef = old.refs.find((ref) => ref.id === action.ref)
    if (oldRef) {
      const targets = fresh.refs.filter((ref) => ref.signature === oldRef.signature)
      if (targets.length !== 1) throw new Error('TARGET_MISMATCH')
      action.ref = targets[0]!.id
    }
    action.observationId = fresh.id
    live.observation = fresh
    if (decision.kind === 'external_submit') {
      if (!decision.summary) throw new Error('TRANSACTION_SUMMARY_REQUIRED')
      const current = this.get(state.id, caller)
      const intent = digest({
        summary: decision.summary,
        kind: action.kind,
        target: oldRef?.signature ?? action.pageId,
      })
      if (
        this.runtime.db
          .prepare('SELECT 1 FROM browser_transactions WHERE browser_id=? AND intent=?')
          .get(state.id, intent)
      )
        throw new Error('TRANSACTION_ALREADY_PREPARED')
      const tx: TransactionView = {
        id: randomUUID(),
        version: 1,
        digest: digest({ summary: decision.summary, fingerprint: fresh.fingerprint, action }),
        summary: decision.summary,
        state: 'awaiting_confirmation',
        expiresAt: Date.now() + 120_000,
        operationId: parsed.operationId,
      }
      this.runtime.transaction(() => {
        this.invalidateTransactions(current)
        this.runtime.db
          .prepare('INSERT INTO browser_transactions VALUES (?,?,?,?,?,?,?)')
          .run(
            tx.id,
            state.id,
            JSON.stringify(tx),
            JSON.stringify(action),
            fresh.fingerprint,
            state.controlEpoch,
            intent,
          )
        current.transaction = tx
        this.runtime.transition(live.binding, 'waiting_approval')
        this.save(current, 'browser-transaction-prepared', {
          transactionId: tx.id,
          digest: tx.digest,
        })
      })
      return {
        id: parsed.operationId,
        browserId: state.id,
        status: 'awaiting_confirmation',
        transactionId: tx.id,
      }
    }
    return this.dispatch(
      caller,
      { ...parsed, action },
      action,
      hash,
      signal,
      undefined,
      decision.kind === 'read',
    )
  }
  private validateAction(action: CheckedAction, observation: BrowserObservation): void {
    if (
      ['click', 'fill', 'select', 'check', 'download'].includes(action.kind) &&
      !observation.refs.some((ref) => ref.id === action.ref)
    )
      throw new Error('TARGET_NOT_OBSERVED')
    const target = observation.refs.find((ref) => ref.id === action.ref)
    if (target?.disabled && !['wait', 'point'].includes(action.kind))
      throw new Error('BROWSER_TARGET_DISABLED')
    if (
      target &&
      ((action.kind === 'fill' && !['textbox', 'searchbox', 'spinbutton'].includes(target.role)) ||
        (action.kind === 'select' && !['combobox', 'listbox'].includes(target.role)) ||
        (action.kind === 'check' && !['checkbox', 'switch', 'radio'].includes(target.role)))
    )
      throw new Error('BROWSER_TARGET_TYPE_UNSUPPORTED')
    if (observation.refs.find((ref) => ref.id === action.ref)?.sensitive && action.kind !== 'point')
      throw new Error('BROWSER_MANUAL_INPUT_REQUIRED')
    if (action.kind === 'navigate') {
      const url = new URL(action.url ?? '')
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('BROWSER_URL_INVALID')
    }
    if (
      action.kind === 'key' &&
      !/^(?:(?:ControlOrMeta|Control|Meta|Alt|Shift)\+)*(?:Enter|Tab|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|[a-zA-Z0-9])$/.test(
        action.key ?? '',
      )
    )
      throw new Error('BROWSER_KEY_UNSUPPORTED')
    if (['fill', 'select'].includes(action.kind) && action.value === undefined)
      throw new Error('BROWSER_VALUE_REQUIRED')
    if (action.kind === 'check' && action.checked === undefined)
      throw new Error('BROWSER_CHECK_REQUIRED')
  }
  private async dispatch(
    caller: BrowserCaller,
    request: ActionRequest,
    action: CheckedAction,
    hash: string,
    signal: AbortSignal,
    transaction?: TransactionView,
    readOnly = false,
  ): Promise<OperationReceipt> {
    const { state, live } = this.access(caller, request, readOnly)
    const old = this.operation(state, request.operationId, hash)
    if (old) return old
    if (action.kind === 'download') this.assertArtifactBudget(state.sessionId)
    const artifactId = action.kind === 'download' ? randomUUID() : undefined
    let downloadPath: string | undefined
    if (artifactId) {
      const root = join(this.ctx.tianzhiaiHost.paths.downloads, state.id)
      await mkdir(root, { recursive: true, mode: 0o700 })
      if ((await lstat(root)).isSymbolicLink()) throw new Error('BROWSER_DOWNLOAD_PATH_INVALID')
      downloadPath = join(root, artifactId)
    }
    this.access(caller, request, readOnly)
    this.runtime.transaction(() => {
      this.startOperation(state, request.operationId, hash, action.kind)
      if (transaction) {
        transaction.state = 'submitted'
        this.writeTransaction(state, transaction, 'browser-submit-intent')
      }
    })
    live.inFlight.add(request.operationId)
    try {
      // Both Host and the connector recheck epoch at the actual dispatch boundary.
      this.access(caller, request, readOnly)
      const receipt = await live.connector.call<unknown>(
        'act',
        {
          action,
          leaseUntil: this.runtime.get(state.taskId).leaseUntil,
          ...(downloadPath ? { downloadPath } : {}),
        },
        state.controlEpoch,
        signal,
      )
      this.runtime.assertFence(live.binding)
      const result: OperationReceipt = {
        id: request.operationId,
        browserId: state.id,
        status: 'executed',
        receipt:
          action.kind === 'point'
            ? JSON.stringify(receipt)
            : receipt &&
                typeof receipt === 'object' &&
                'dispatched' in receipt &&
                receipt.dispatched === false
              ? '当前状态已满足；未再次派发动作'
              : '浏览器动作已派发；网站受理、付款与出票须分别核验',
      }
      if (artifactId && downloadPath) {
        const stat = await lstat(downloadPath)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024) {
          await rm(downloadPath, { force: true })
          throw new Error('BROWSER_DOWNLOAD_LIMIT')
        }
        this.assertArtifactBudget(state.sessionId, stat.size)
        const suggested =
          receipt &&
          typeof receipt === 'object' &&
          'download' in receipt &&
          typeof receipt.download === 'string'
            ? basename(receipt.download).slice(0, 200)
            : 'download'
        this.runtime.db
          .prepare('INSERT INTO browser_artifacts VALUES (?,?,?,?,?,?,?)')
          .run(
            artifactId,
            state.id,
            state.sessionId,
            suggested,
            stat.size,
            'application/octet-stream',
            downloadPath,
          )
        result.artifactId = artifactId
      }
      this.finishOperation(state.id, request.operationId, 'executed', result, live.binding)
      if (transaction) this.runtime.transition(live.binding, 'needs_reconciliation')
      delete live.observation
      this.runtime.event(state.taskId, 'browser-action-dispatched', {
        operationId: request.operationId,
        kind: action.kind,
      })
      return result
    } catch (error) {
      if (
        downloadPath &&
        artifactId &&
        !this.runtime.db.prepare('SELECT 1 FROM browser_artifacts WHERE id=?').get(artifactId)
      )
        await rm(downloadPath, { force: true }).catch(() => {})
      const status = error instanceof ConnectorError && !error.dispatched ? 'rejected' : 'unknown'
      const result: OperationReceipt = { id: request.operationId, browserId: state.id, status }
      this.finishOperation(state.id, request.operationId, status, result, live.binding)
      if (status === 'unknown') {
        const current = this.get(state.id, caller)
        if (transaction) {
          transaction.state = 'unknown'
          this.writeTransaction(current, transaction, 'browser-submit-unknown')
        }
        this.runtime.transition(live.binding, 'needs_reconciliation')
        this.save(this.get(state.id, caller), 'browser-result-unknown', {
          operationId: request.operationId,
        })
      }
      return result
    } finally {
      live.inFlight.delete(request.operationId)
    }
  }
  private writeTransaction(state: BrowserSnapshot, tx: TransactionView, event: string) {
    this.runtime.db
      .prepare('UPDATE browser_transactions SET state=? WHERE id=? AND browser_id=?')
      .run(JSON.stringify(tx), tx.id, state.id)
    const current = this.own(state.id)
    current.transaction = tx
    this.save(current, event, { transactionId: tx.id, digest: tx.digest })
  }
  private invalidateTransactions(state: BrowserSnapshot) {
    for (const row of this.runtime.db
      .prepare('SELECT id,state FROM browser_transactions WHERE browser_id=?')
      .all(state.id)) {
      const tx = JSON.parse(String(row.state)) as TransactionView
      if (['awaiting_confirmation', 'approved'].includes(tx.state)) {
        tx.state = 'invalidated'
        this.runtime.db
          .prepare('UPDATE browser_transactions SET state=? WHERE id=?')
          .run(JSON.stringify(tx), tx.id)
        if (state.transaction?.id === tx.id) state.transaction = tx
      }
    }
  }
  /** Only authenticated UI invokes approval. No model-facing tool calls this method. */
  async approve(
    caller: BrowserCaller,
    request: ApprovalRequest,
    signal: AbortSignal,
  ): Promise<BrowserSnapshot> {
    const r = approvalSchema.parse(request),
      state = this.get(r.browserId, caller),
      live = this.live.get(state.id)
    const old = this.runtime.db
      .prepare('SELECT digest,result FROM browser_controls WHERE browser_id=? AND request_id=?')
      .get(state.id, r.requestId)
    if (old) {
      if (old.digest !== digest(r)) throw new Error('BROWSER_REQUEST_CONFLICT')
      return this.get(state.id, caller)
    }
    if (
      !live ||
      state.revision !== r.expectedRevision ||
      state.controlEpoch !== r.controlEpoch ||
      state.controller !== 'agent'
    )
      throw new Error('BROWSER_CONFLICT')
    this.runtime.check(live.binding, true)
    const tx = state.transaction
    if (
      !tx ||
      tx.id !== r.transactionId ||
      tx.version !== r.version ||
      tx.digest !== r.digest ||
      tx.state !== 'awaiting_confirmation' ||
      Date.now() >= tx.expiresAt
    )
      throw new Error('BROWSER_APPROVAL_STALE')
    const row = this.runtime.db
      .prepare('SELECT action,observation,epoch FROM browser_transactions WHERE id=?')
      .get(tx.id)!
    const fresh = await live.connector.call<BrowserObservation>(
      'observe',
      {},
      state.controlEpoch,
      signal,
    )
    const current = this.get(state.id, caller)
    if (
      current.revision !== r.expectedRevision ||
      current.controlEpoch !== r.controlEpoch ||
      fresh.fingerprint !== row.observation
    ) {
      this.invalidateTransactions(current)
      this.save(current, 'browser-approval-invalidated')
      throw new Error('BROWSER_APPROVAL_STALE')
    }
    this.runtime.transaction(() => {
      tx.state = r.decision === 'approve' ? 'approved' : 'rejected'
      this.writeTransaction(
        current,
        tx,
        r.decision === 'approve' ? 'browser-approved' : 'browser-rejected',
      )
      this.runtime.db
        .prepare('INSERT INTO browser_controls VALUES (?,?,?,?)')
        .run(state.id, r.requestId, digest(r), tx.id)
      this.runtime.transition(live.binding, r.decision === 'approve' ? 'running' : 'paused')
    })
    if (r.decision === 'approve') {
      const action = JSON.parse(String(row.action)) as CheckedAction
      const prior = live.observation
      const priorRef = prior?.refs.find((ref) => ref.id === action.ref)
      if (priorRef) {
        const target = fresh.refs.filter((ref) => ref.signature === priorRef.signature)
        if (target.length !== 1) throw new Error('TARGET_MISMATCH')
        action.ref = target[0]!.id
      }
      action.observationId = fresh.id
      live.observation = fresh
      await this.dispatch(
        caller,
        {
          browserId: state.id,
          executionId: state.executionId,
          fence: state.fence,
          controlEpoch: state.controlEpoch,
          operationId: tx.operationId,
          observationId: fresh.id,
          action,
        },
        action,
        digest({ transactionId: tx.id, version: tx.version, digest: tx.digest }),
        signal,
        tx,
      )
      this.runtime.wake(live.binding, state.controlEpoch, `transaction:${tx.id}:${tx.version}`)
      for (const listener of this.wakeListeners) listener(this.get(state.id, caller))
    }
    return this.get(state.id, caller)
  }
  needHuman(caller: BrowserCaller, id: string, reason: string): BrowserSnapshot {
    const state = this.get(id, caller),
      live = this.live.get(id)
    if (!live) throw new Error('BROWSER_DISCONNECTED')
    this.runtime.check(live.binding, true)
    this.runtime.transition(live.binding, 'waiting_user')
    state.waitEventId++
    state.waitReason = reason.slice(0, 1000)
    this.save(state, 'browser-needs-human')
    return state
  }
  registerView(
    caller: BrowserCaller,
    id: string,
    peerId: string,
    connectionId: string,
  ): BrowserSnapshot {
    const state = this.get(id, caller),
      live = this.live.get(id)
    if (live) {
      if (live.views.size >= 4) throw new Error('BROWSER_VIEW_LIMIT')
      live.views.set(connectionId, {
        peerId,
        sequence: 0,
        sent: Date.now(),
        pending: 0,
        stream: false,
        connected: true,
      })
    }
    return state
  }
  private view(caller: BrowserCaller, id: string, connectionId: string, peerId: string) {
    const state = this.get(id, caller),
      live = this.live.get(id),
      view = live?.views.get(connectionId)
    if (!live || !view?.connected || view.peerId !== peerId) throw new Error('BROWSER_VIEW_STALE')
    return { state, live, view }
  }
  async subscribeFrames(
    caller: BrowserCaller,
    id: string,
    connectionId: string,
    peerId: string,
    listener: (meta: MediaFrame, bytes: Uint8Array) => void,
  ): Promise<() => void> {
    const { state, live, view } = this.view(caller, id, connectionId, peerId)
    live.frameListeners.add(listener)
    view.stream = true
    try {
      if ([...live.views.values()].filter((v) => v.stream).length === 1)
        await live.connector.call('stream', { enabled: true }, state.controlEpoch)
    } catch (e) {
      live.frameListeners.delete(listener)
      view.stream = false
      throw e
    }
    return () => {
      live.frameListeners.delete(listener)
      view.stream = false
      if (this.disposed) return
      if (![...live.views.values()].some((v) => v.stream) && this.own(id).lifecycle === 'open')
        void live.connector
          .call('stream', { enabled: false }, this.own(id).controlEpoch)
          .catch(() => {})
    }
  }
  removeView(id: string, connectionId: string): void {
    if (this.disposed) return
    const live = this.live.get(id),
      view = live?.views.get(connectionId)
    if (!live || !view) return
    view.connected = false
    // A disconnected human keeps control; never infer a return or replay inputs.
    live.views.delete(connectionId)
    if (live.humanConnection === connectionId) {
      const state = this.own(id)
      state.controlEpoch++
      delete live.observation
      this.invalidateTransactions(state)
      this.save(state, 'browser-human-disconnected')
      void live.connector
        .fence(state.controlEpoch)
        .then(() =>
          live.connector.call(
            'input',
            {
              pageId: state.pageId,
              viewportVersion: state.viewport.version,
              leaseUntil: this.runtime.get(state.taskId).leaseUntil,
              input: { type: 'release' },
            },
            state.controlEpoch,
          ),
        )
        .catch(() => this.disconnected(id, 'EGO_DISCONNECTED'))
    }
  }
  async control(
    caller: BrowserCaller,
    request: ControlRequest,
    peerId: string,
  ): Promise<BrowserSnapshot> {
    const r = controlSchema.parse(request),
      state = this.get(r.browserId, caller)
    const previous = this.runtime.db
      .prepare('SELECT digest,result FROM browser_controls WHERE browser_id=? AND request_id=?')
      .get(state.id, r.requestId)
    if (previous) {
      if (previous.digest !== digest(r)) throw new Error('BROWSER_REQUEST_CONFLICT')
      return this.get(state.id, caller)
    }
    if (state.revision !== r.expectedRevision || state.controlEpoch !== r.controlEpoch)
      throw new Error('BROWSER_CONFLICT')
    if (r.action === 'cancel' && (state.egoState === 'native-human' || !this.live.has(state.id))) {
      if (state.lifecycle === 'closed') return state
      const binding = this.runtime.transaction(() => this.runtime.acquire(state.taskId)),
        prior = this.live.get(state.id)
      if (prior) prior.binding = binding
      state.controlEpoch++
      state.controller = 'none'
      state.lifecycle = 'closed'
      state.capabilities.available = false
      delete state.waitReason
      this.invalidateTransactions(state)
      this.runtime.transaction(() => {
        this.runtime.transition(binding, 'cancelled')
        this.save(state, 'browser-task-detached', { native: state.egoState === 'native-human' })
        this.runtime.db
          .prepare('INSERT INTO browser_controls VALUES (?,?,?,?)')
          .run(state.id, r.requestId, digest(r), state.id)
      })
      for (const listener of this.controlListeners) listener(state)
      this.live.delete(state.id)
      // Stop our connector only. Native/user-owned pages must remain with Ego.
      await prior?.connector.close(false)
      return this.get(state.id, caller)
    }
    if (r.action === 'reconnect') {
      if (state.egoState === 'native-human') throw new Error('NATIVE_RETURN_REQUIRED')
      if (state.lifecycle === 'open') return state
      const binding = this.runtime.transaction(() => this.runtime.acquire(state.taskId))
      const oldLive = this.live.get(state.id)
      if (oldLive) oldLive.binding = binding
      this.runtime.db
        .prepare('INSERT INTO browser_controls VALUES (?,?,?,?)')
        .run(state.id, r.requestId, digest(r), state.id)
      state.controlEpoch++
      state.lifecycle = 'starting'
      this.save(state, 'browser-reconnecting')
      return this.connect(state, binding, false)
    }
    if (r.action === 'return' && state.egoState === 'native-human') {
      const binding = this.runtime.transaction(() => this.runtime.acquire(state.taskId))
      const oldLive = this.live.get(state.id)
      if (oldLive) oldLive.binding = binding
      this.runtime.db
        .prepare('INSERT INTO browser_controls VALUES (?,?,?,?)')
        .run(state.id, r.requestId, digest(r), state.id)
      state.controlEpoch++
      state.controller = 'agent'
      this.save(state, 'browser-native-return-requested')
      const connected = await this.connect(state, binding, true)
      return this.returnToAgent(caller, connected, this.live.get(state.id)!)
    }
    const { live } = this.view(caller, state.id, r.connectionId, peerId)
    this.runtime.check(live.binding, true)
    if (
      r.action === 'take' &&
      live.humanConnection &&
      live.humanConnection !== r.connectionId &&
      live.views.get(live.humanConnection)?.connected
    )
      throw new Error('BROWSER_CONTROL_BUSY')
    if (
      r.action === 'switch-page' &&
      (state.controller !== 'human' ||
        live.humanConnection !== r.connectionId ||
        !state.pages.some((page) => page.id === r.pageId))
    )
      throw new Error('BROWSER_PAGE_NOT_AUTHORIZED')
    if (
      r.action === 'native-handoff' &&
      state.controller === 'human' &&
      live.humanConnection !== r.connectionId &&
      live.views.get(live.humanConnection ?? '')?.connected
    )
      throw new Error('BROWSER_CONTROL_NOT_OWNED')
    if (r.action === 'native-handoff' && state.needsReconciliation)
      throw new Error('NEEDS_RECONCILIATION')
    if (
      r.action === 'return' &&
      (state.controller !== 'human' || live.humanConnection !== r.connectionId)
    )
      throw new Error('BROWSER_CONTROL_NOT_OWNED')
    state.controlEpoch++
    state.controller = r.action === 'take' ? 'human' : 'none'
    this.invalidateTransactions(state)
    delete live.observation
    this.runtime.transaction(() => {
      this.runtime.transition(live.binding, r.action === 'cancel' ? 'cancelled' : 'waiting_user')
      this.save(state, 'browser-control-requested', { action: r.action })
      this.runtime.db
        .prepare('INSERT INTO browser_controls VALUES (?,?,?,?)')
        .run(state.id, r.requestId, digest(r), state.id)
    })
    for (const listener of this.controlListeners) listener(state)
    try {
      await live.connector.fence(state.controlEpoch)
      if (r.action === 'take') {
        live.humanConnection = r.connectionId
        live.inputEpoch = state.controlEpoch
        const current = this.get(state.id, caller)
        current.controlConnectionId = r.connectionId
        return this.save(current, 'browser-human-ready')
      }
      if (r.action === 'switch-page') {
        await live.connector.call(
          'act',
          {
            action: { kind: 'switch', pageId: r.pageId },
            leaseUntil: this.runtime.get(state.taskId).leaseUntil,
          },
          state.controlEpoch,
        )
        const observation = await live.connector.call<BrowserObservation>(
          'observe',
          {},
          state.controlEpoch,
        )
        const current = this.get(state.id, caller)
        current.controller = 'human'
        current.pageId = observation.pageId
        current.viewport = observation.viewport
        current.controlConnectionId = r.connectionId
        live.inputEpoch = current.controlEpoch
        return this.save(current, 'browser-human-page-changed')
      }
      if (r.action === 'native-handoff') {
        await live.connector.call('handoff', {}, state.controlEpoch)
        return this.get(state.id, caller)
      }
      if (r.action === 'cancel') {
        await live.connector.close(true)
        this.live.delete(state.id)
        state.lifecycle = 'closed'
        state.controller = 'none'
        state.capabilities.available = false
        return this.save(state, 'browser-task-cancelled')
      }
      await live.connector.call(
        'input',
        {
          pageId: state.pageId,
          viewportVersion: state.viewport.version,
          leaseUntil: this.runtime.get(state.taskId).leaseUntil,
          input: { type: 'release' },
        },
        state.controlEpoch,
      )
      return this.returnToAgent(caller, this.get(state.id, caller), live)
    } catch (error) {
      this.disconnected(state.id, 'EGO_CONTROL_FAILED')
      throw error
    }
  }
  private async returnToAgent(
    caller: BrowserCaller,
    state: BrowserSnapshot,
    live: LiveBrowser,
  ): Promise<BrowserSnapshot> {
    const fresh = await live.connector.call<BrowserObservation>('observe', {}, state.controlEpoch)
    const current = this.get(state.id, caller)
    if (current.controlEpoch !== state.controlEpoch) throw new Error('BROWSER_CONFLICT')
    delete live.humanConnection
    delete state.controlConnectionId
    live.observation = fresh
    delete current.controlConnectionId
    current.controller = 'agent'
    current.egoState = 'agent'
    current.pageId = fresh.pageId
    current.viewport = fresh.viewport
    delete current.waitReason
    this.runtime.transaction(() => {
      const uncertain =
        this.runtime.db
          .prepare("SELECT 1 FROM browser_operations WHERE browser_id=? AND state='unknown'")
          .get(state.id) ||
        (current.transaction && ['submitted', 'unknown'].includes(current.transaction.state))
      this.runtime.transition(live.binding, uncertain ? 'needs_reconciliation' : 'running')
      this.save(current, 'browser-returned')
      this.runtime.wake(live.binding, current.controlEpoch)
    })
    for (const listener of this.wakeListeners) listener(this.get(state.id, caller))
    return this.get(state.id, caller)
  }
  async input(caller: BrowserCaller, value: InputEnvelope, peerId: string): Promise<InputResult> {
    const r = inputEnvelopeSchema.parse(value),
      { state, live, view } = this.view(caller, r.browserId, r.connectionId, peerId)
    this.runtime.check(live.binding, true)
    if (
      state.lifecycle !== 'open' ||
      state.controller !== 'human' ||
      state.egoState !== 'agent' ||
      live.humanConnection !== r.connectionId ||
      live.inputEpoch !== state.controlEpoch ||
      r.controlEpoch !== state.controlEpoch
    )
      throw new Error('CONTROL_EPOCH_STALE')
    if (
      r.pageId !== state.pageId ||
      r.viewportVersion !== state.viewport.version ||
      r.sequence <= view.sequence
    )
      throw new Error('INPUT_STALE')
    if (
      !['release', 'copy'].includes(r.input.type) &&
      ((state.transaction && ['submitted', 'unknown'].includes(state.transaction.state)) ||
        this.runtime.db
          .prepare("SELECT 1 FROM browser_operations WHERE browser_id=? AND state='unknown'")
          .get(state.id))
    )
      throw new Error('NEEDS_RECONCILIATION')
    if (view.pending >= 128) throw new Error('INPUT_QUEUE_LIMIT')
    const now = Date.now()
    view.sent = now
    view.sequence = r.sequence
    view.pending++
    const operationId = `input:${r.connectionId}:${r.sequence}`
    // Keep content out of audit: only a digest and input type are durable.
    this.startOperation(
      state,
      operationId,
      digest({
        browserId: r.browserId,
        pageId: r.pageId,
        connectionId: r.connectionId,
        controlEpoch: r.controlEpoch,
        sequence: r.sequence,
        viewportVersion: r.viewportVersion,
        type: r.input.type,
      }),
      r.input.type,
    )
    live.inFlight.add(operationId)
    delete live.observation
    try {
      const current = this.get(state.id, caller)
      if (current.controlEpoch !== r.controlEpoch || current.controller !== 'human')
        throw new Error('CONTROL_EPOCH_STALE')
      const result = await live.connector.call<InputResult>(
        'input',
        {
          pageId: r.pageId,
          viewportVersion: r.viewportVersion,
          leaseUntil: this.runtime.get(state.taskId).leaseUntil,
          input: r.input,
        },
        r.controlEpoch,
      )
      this.finishOperation(
        state.id,
        operationId,
        'executed',
        { id: operationId, browserId: state.id, status: 'executed' },
        live.binding,
      )
      return result
    } catch (error) {
      const status = error instanceof ConnectorError && !error.dispatched ? 'rejected' : 'unknown'
      this.finishOperation(
        state.id,
        operationId,
        status,
        { id: operationId, browserId: state.id, status },
        live.binding,
      )
      if (status === 'unknown') this.disconnected(state.id, 'INPUT_RESULT_UNKNOWN')
      throw new BrowserInputError(
        status,
        error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
          ? error.message
          : 'INPUT_FAILED',
      )
    } finally {
      view.pending--
      live.inFlight.delete(operationId)
    }
  }
  async reconcile(
    caller: BrowserCaller,
    gate: BrowserGate,
    observationId: string,
    reviewer: (
      observation: BrowserObservation,
      tx: TransactionView,
    ) => Promise<TransactionView['result']>,
    signal: AbortSignal,
  ): Promise<BrowserSnapshot> {
    const { state, live } = this.access(caller, gate, true),
      observation = live.observation
    if (
      !state.transaction ||
      !['submitted', 'unknown'].includes(state.transaction.state) ||
      !observation ||
      observation.id !== observationId
    )
      throw new Error('RECONCILIATION_EVIDENCE_REQUIRED')
    const evidence = await reviewer(observation, state.transaction)
    this.access(caller, gate, true)
    signal.throwIfAborted()
    const fresh = await live.connector.call<BrowserObservation>(
      'observe',
      {},
      state.controlEpoch,
      signal,
    )
    this.access(caller, gate, true)
    if (fresh.fingerprint !== observation.fingerprint) {
      live.observation = fresh
      throw new Error('STALE_OBSERVATION')
    }
    if (
      !evidence?.orderId ||
      !evidence.evidenceDigest ||
      evidence.evidenceDigest !== observation.fingerprint
    )
      throw new Error('RECONCILIATION_EVIDENCE_REQUIRED')
    const tx = state.transaction
    tx.result = evidence
    tx.state = 'reconciled'
    this.runtime.transaction(() => {
      this.writeTransaction(state, tx, 'browser-reconciled')
      this.runtime.db
        .prepare(
          "UPDATE browser_operations SET state='executed' WHERE browser_id=? AND id=? AND state='unknown'",
        )
        .run(state.id, tx.operationId)
      this.runtime.transition(live.binding, 'running')
    })
    return this.get(state.id, caller)
  }
  async capture(
    caller: BrowserCaller,
    gate: BrowserGate,
    observationId: string,
    signal: AbortSignal,
  ): Promise<BrowserArtifact> {
    const { state, live } = this.access(caller, gate, true)
    if (!live.observation || live.observation.id !== observationId)
      throw new Error('STALE_OBSERVATION')
    this.assertArtifactBudget(state.sessionId)
    const id = randomUUID(),
      directory = join(this.ctx.tianzhiaiHost.paths.downloads, state.id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('BROWSER_DOWNLOAD_PATH_INVALID')
    const path = join(directory, id)
    try {
      await live.connector.call(
        'capture',
        { path, observationId, leaseUntil: this.runtime.get(state.taskId).leaseUntil },
        state.controlEpoch,
        signal,
      )
      this.access(caller, gate, true)
      const stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024)
        throw new Error('BROWSER_SCREENSHOT_LIMIT')
      this.access(caller, gate, true)
      this.assertArtifactBudget(state.sessionId, stat.size)
      this.runtime.db
        .prepare('INSERT INTO browser_artifacts VALUES (?,?,?,?,?,?,?)')
        .run(id, state.id, state.sessionId, 'browser-page.png', stat.size, 'image/png', path)
      return {
        id,
        browserId: state.id,
        sessionId: state.sessionId,
        name: 'browser-page.png',
        bytes: stat.size,
        mediaType: 'image/png',
      }
    } catch (error) {
      if (!this.runtime.db.prepare('SELECT 1 FROM browser_artifacts WHERE id=?').get(id))
        await rm(path, { force: true }).catch(() => {})
      throw error
    }
  }

  private assertArtifactBudget(sessionId: string, bytes: number = 0): void {
    const row = this.runtime.db
      .prepare(
        'SELECT count(*) n,coalesce(sum(bytes),0) bytes FROM browser_artifacts WHERE session_id=?',
      )
      .get(sessionId)!
    if (Number(row.n) >= 64 || Number(row.bytes) + bytes > 256 * 1024 * 1024)
      throw new Error('BROWSER_ARTIFACT_BUDGET')
  }
  artifacts(caller: BrowserCaller): BrowserArtifact[] {
    return this.runtime.db
      .prepare(
        'SELECT a.* FROM browser_artifacts a JOIN browser_sessions b ON a.browser_id=b.id WHERE b.owner_id=? AND a.session_id=?',
      )
      .all(caller.ownerId, caller.sessionId)
      .map((row) => ({
        id: String(row.id),
        browserId: String(row.browser_id),
        sessionId: String(row.session_id),
        name: String(row.name),
        bytes: Number(row.bytes),
        mediaType: String(row.media_type),
      }))
  }
  async artifactBytes(caller: BrowserCaller, id: string): Promise<Uint8Array> {
    const entry = this.artifacts(caller).find((item) => item.id === id)
    if (!entry) throw new Error('BROWSER_ARTIFACT_NOT_FOUND')
    const row = this.runtime.db.prepare('SELECT path FROM browser_artifacts WHERE id=?').get(id)!
    const file = await open(String(row.path), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new Error('BROWSER_DOWNLOAD_LIMIT')
      return await file.readFile()
    } finally {
      await file.close()
    }
  }
}
