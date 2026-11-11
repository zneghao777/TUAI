import { DatabaseSync } from 'node:sqlite'
import { chmodSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export type TaskStatus =
  | 'running'
  | 'waiting_user'
  | 'waiting_approval'
  | 'paused'
  | 'needs_reconciliation'
  | 'cancelled'
  | 'succeeded'
  | 'failed'
export interface ExecutionBinding {
  taskId: string
  executionId: string
  sessionId: string
  ownerId: string
  goal: string
  status: TaskStatus
  revision: number
  fence: number
  leaseOwner: string
  leaseUntil: number
}
export function digest(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
}

/** P4's durable execution prerequisite. DSH remains the only agent engine. */
export class TaskRuntime {
  readonly db: DatabaseSync
  readonly workerId: string = randomUUID()
  constructor(
    path: string,
    readonly leaseMs: number = 30_000,
  ) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error('业务数据库不能是符号链接')
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT')) throw e
    }
    this.db = new DatabaseSync(path)
    chmodSync(path, 0o600)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS product_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_id TEXT NOT NULL, goal TEXT NOT NULL,
          status TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS session_bindings (
          task_id TEXT PRIMARY KEY REFERENCES tasks(id), session_id TEXT NOT NULL, owner_id TEXT NOT NULL,
          engine TEXT NOT NULL CHECK(engine='dsh')
        );
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
          fence INTEGER NOT NULL, lease_owner TEXT NOT NULL, lease_until INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS task_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id),
          kind TEXT NOT NULL, revision INTEGER NOT NULL, at INTEGER NOT NULL, detail TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS task_requests (
          owner_id TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id),
          PRIMARY KEY(owner_id, request_id)
        );
        CREATE TABLE IF NOT EXISTS task_wakeups (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), epoch INTEGER NOT NULL, cause TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('pending','delivering','delivered')), message_id TEXT NOT NULL UNIQUE,
          UNIQUE(task_id, cause)
        );
        INSERT OR IGNORE INTO product_migrations VALUES ('p4-runtime-v1', ${Date.now()});
      `)
      if (
        !this.db
          .prepare('PRAGMA table_info(task_wakeups)')
          .all()
          .some((column) => column.name === 'cause')
      ) {
        this.db.exec(`
          ALTER TABLE task_wakeups RENAME TO task_wakeups_v1;
          CREATE TABLE task_wakeups (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), epoch INTEGER NOT NULL, cause TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('pending','delivering','delivered')), message_id TEXT NOT NULL UNIQUE, UNIQUE(task_id,cause));
          INSERT INTO task_wakeups SELECT id,task_id,epoch,'control:' || epoch,state,message_id FROM task_wakeups_v1;
          DROP TABLE task_wakeups_v1;
        `)
      }
      this.db
        .prepare("INSERT OR IGNORE INTO product_migrations VALUES ('p4-wake-cause-v2', ?)")
        .run(Date.now())
    })
  }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = work()
      this.db.exec('COMMIT')
      return value
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  bind(ownerId: string, sessionId: string, goal: string, requestId: string): ExecutionBinding {
    return this.transaction(() => {
      const hash = digest({ sessionId, goal })
      const previous = this.db
        .prepare('SELECT digest, task_id FROM task_requests WHERE owner_id=? AND request_id=?')
        .get(ownerId, requestId)
      if (previous) {
        if (previous.digest !== hash) throw new Error('TASK_REQUEST_CONFLICT')
        return this.acquire(String(previous.task_id))
      }
      const current = this.db
        .prepare(
          "SELECT id FROM tasks WHERE owner_id=? AND session_id=? AND status NOT IN ('cancelled','succeeded','failed') ORDER BY created_at DESC LIMIT 1",
        )
        .get(ownerId, sessionId)
      let taskId: string
      if (current) taskId = String(current.id)
      else {
        taskId = randomUUID()
        this.db
          .prepare('INSERT INTO tasks VALUES (?,?,?,?,?,1,?)')
          .run(taskId, ownerId, sessionId, goal.slice(0, 16_000), 'running', Date.now())
        this.db
          .prepare("INSERT INTO session_bindings VALUES (?,?,?,'dsh')")
          .run(taskId, sessionId, ownerId)
        this.db
          .prepare('INSERT INTO executions VALUES (?,?,1,?,?)')
          .run(randomUUID(), taskId, this.workerId, Date.now() + this.leaseMs)
        this.event(taskId, 'created', {})
      }
      this.db
        .prepare('INSERT INTO task_requests VALUES (?,?,?,?)')
        .run(ownerId, requestId, hash, taskId)
      return this.acquire(taskId)
    })
  }
  get(taskId: string): ExecutionBinding {
    const row = this.db
      .prepare(
        `SELECT t.*, e.id execution_id, e.fence, e.lease_owner, e.lease_until
      FROM tasks t JOIN executions e ON e.task_id=t.id WHERE t.id=?`,
      )
      .get(taskId)
    if (!row) throw new Error('TASK_NOT_FOUND')
    return {
      taskId,
      executionId: String(row.execution_id),
      sessionId: String(row.session_id),
      ownerId: String(row.owner_id),
      goal: String(row.goal),
      status: String(row.status) as TaskStatus,
      revision: Number(row.revision),
      fence: Number(row.fence),
      leaseOwner: String(row.lease_owner),
      leaseUntil: Number(row.lease_until),
    }
  }
  /** Must run in the caller's transaction when combined with other domain writes. */
  acquire(taskId: string): ExecutionBinding {
    const old = this.get(taskId)
    if (old.leaseOwner !== this.workerId && old.leaseUntil > Date.now())
      throw new Error('TASK_LEASE_BUSY')
    const changed = this.db
      .prepare(
        `UPDATE executions SET fence=fence+?, lease_owner=?, lease_until=?
      WHERE task_id=? AND fence=? AND (lease_owner=? OR lease_until<=?)`,
      )
      .run(
        old.leaseOwner === this.workerId && old.leaseUntil > Date.now() ? 0 : 1,
        this.workerId,
        Date.now() + this.leaseMs,
        taskId,
        old.fence,
        this.workerId,
        Date.now(),
      )
    if (Number(changed.changes) !== 1) throw new Error('TASK_LEASE_BUSY')
    return this.get(taskId)
  }
  check(
    binding: Pick<ExecutionBinding, 'taskId' | 'executionId' | 'fence'>,
    allowWaiting: boolean = false,
  ): ExecutionBinding {
    const current = this.assertFence(binding)
    if (['cancelled', 'succeeded', 'failed'].includes(current.status))
      throw new Error('TASK_TERMINAL')
    if (!allowWaiting && current.status !== 'running')
      throw new Error(`TASK_${current.status.toUpperCase()}`)
    return current
  }
  assertFence(
    binding: Pick<ExecutionBinding, 'taskId' | 'executionId' | 'fence'>,
  ): ExecutionBinding {
    const current = this.get(binding.taskId)
    if (
      current.executionId !== binding.executionId ||
      current.fence !== binding.fence ||
      current.leaseOwner !== this.workerId ||
      current.leaseUntil <= Date.now()
    )
      throw new Error('TASK_LEASE_STALE')
    return current
  }
  renew(binding: ExecutionBinding): void {
    this.check(binding, true)
    const result = this.db
      .prepare('UPDATE executions SET lease_until=? WHERE id=? AND fence=? AND lease_owner=?')
      .run(Date.now() + this.leaseMs, binding.executionId, binding.fence, this.workerId)
    if (Number(result.changes) !== 1) throw new Error('TASK_LEASE_STALE')
  }
  transition(binding: ExecutionBinding, status: TaskStatus, kind: string = status): void {
    this.check(binding, true)
    this.db
      .prepare('UPDATE tasks SET status=?, revision=revision+1 WHERE id=?')
      .run(status, binding.taskId)
    this.event(binding.taskId, kind, {})
  }
  event(taskId: string, kind: string, detail: Record<string, unknown>): void {
    const task = this.db.prepare('SELECT revision FROM tasks WHERE id=?').get(taskId)
    if (!task) throw new Error('TASK_NOT_FOUND')
    this.db
      .prepare('INSERT INTO task_events(task_id,kind,revision,at,detail) VALUES (?,?,?,?,?)')
      .run(taskId, kind, Number(task.revision), Date.now(), JSON.stringify(detail))
  }
  wake(binding: ExecutionBinding, epoch: number, cause: string = `control:${epoch}`): void {
    this.check(binding, true)
    this.db
      .prepare("INSERT OR IGNORE INTO task_wakeups VALUES (?,?,?,?,'pending',?)")
      .run(randomUUID(), binding.taskId, epoch, cause, randomUUID())
  }
  release(): void {
    this.db.prepare('UPDATE executions SET lease_until=0 WHERE lease_owner=?').run(this.workerId)
  }
  close(): void {
    this.release()
    this.db.close()
  }
}
