import type {} from '@deepseek-ai/dsh-goal'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, freezeMessage, MessageId } from '@deepseek-ai/dsh-llm'
import type {} from '@tuai/browser-service'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'browser-return': { kind: 'browser-return'; taskId: string; browserId: string; epoch: number }
  }
}

/** One durable wake outbox feeds the existing Session/Goal driver; never a second loop. */
export function mountBrowserEngine(ctx: Context) {
  let stopped = false,
    rerun = false,
    running: Promise<void> | undefined
  const db = ctx.browsers.runtime.db
  db.prepare(
    "UPDATE task_wakeups SET state='pending' WHERE state='delivering' AND task_id IN (SELECT task_id FROM executions WHERE lease_until <= ?)",
  ).run(Date.now())
  const deliver = async () => {
    do {
      rerun = false
      for (const row of db
        .prepare(
          "SELECT w.*, t.session_id, t.owner_id FROM task_wakeups w JOIN tasks t ON t.id=w.task_id WHERE w.state='pending'",
        )
        .all()) {
        if (stopped) return
        const snapshots = ctx.browsers.list({
          ownerId: String(row.owner_id),
          sessionId: String(row.session_id),
        })
        const snapshot = snapshots.find((s) => s.taskId === row.task_id)
        if (
          !snapshot ||
          snapshot.controller !== 'agent' ||
          snapshot.lifecycle !== 'open' ||
          !['running', 'needs_reconciliation'].includes(snapshot.taskStatus)
        )
          continue
        const resolved = await ctx.sessionController.resolveAgent(SessionId(snapshot.sessionId))
        if ('error' in resolved) continue
        const agent = resolved.agent
        await agent.whenIdle()
        if (stopped) return
        const current = ctx.browsers.get(snapshot.id, {
          ownerId: snapshot.ownerId,
          sessionId: snapshot.sessionId,
        })
        if (current.controlEpoch !== snapshot.controlEpoch || current.controller !== 'agent')
          continue
        if (
          Number(
            db
              .prepare("UPDATE task_wakeups SET state='delivering' WHERE id=? AND state='pending'")
              .run(String(row.id)).changes,
          ) !== 1
        )
          continue
        try {
          const messageId = String(row.message_id)
          const already = agent.session
            .snapshotEvents()
            .some((event) => JSON.stringify(event.data).includes(messageId))
          if (!already) {
            const task = ctx.browsers.runtime.get(snapshot.taskId)
            const input = createUserMessage({
              source: {
                kind: 'browser-return',
                taskId: task.taskId,
                browserId: snapshot.id,
                epoch: current.controlEpoch,
              },
              content: [
                {
                  type: 'text',
                  text: `用户已明确归还浏览器或批准了具体操作。继续同一 Task ${task.taskId} / Execution ${task.executionId}。原目标：${task.goal}\nBrowserSession=${snapshot.id}；controlEpoch=${current.controlEpoch}。先调用 browser_observe 重新观察当前页面；旧 Ref、Reviewer 与批准均不再复用。${current.taskStatus === 'needs_reconciliation' ? '当前结果未知，只允许只读核验，禁止重放提交或人工输入。' : ''}`,
                },
              ],
            })
            const message = freezeMessage({ ...input, id: MessageId(messageId) })
            const suspended = db
              .prepare('SELECT goal_id,revision FROM browser_goal_suspensions WHERE task_id=?')
              .get(task.taskId)
            const goal = ctx.goals.get(agent)
            if (
              suspended &&
              goal?.phase === 'paused' &&
              goal.id === suspended.goal_id &&
              goal.revision === Number(suspended.revision)
            ) {
              agent.inject(message)
              if (!(await ctx.sessions.flush(agent.session)))
                throw new Error('BROWSER_WAKE_SESSION_NOT_DURABLE')
              // GoalDriver is the sole continuation in this branch.
              ctx.goals.resume(agent, { id: goal.id, revision: goal.revision })
            } else agent.followup(message)
          }
          if (!(await ctx.sessions.flush(agent.session)))
            throw new Error('BROWSER_WAKE_SESSION_NOT_DURABLE')
          db.prepare("UPDATE task_wakeups SET state='delivered' WHERE id=?").run(String(row.id))
          ctx.browsers.runtime.event(snapshot.taskId, 'browser-wake-delivered', {
            epoch: current.controlEpoch,
          })
        } catch {
          db.prepare("UPDATE task_wakeups SET state='pending' WHERE id=?").run(String(row.id))
          // Retry on the next state/connection edge, with the same durable message identity.
        }
      }
    } while (rerun && !stopped)
  }
  const schedule = () => {
    if (stopped) return
    rerun = true
    if (!running) {
      running = deliver().finally(() => {
        running = undefined
      })
      void running.catch(() => {})
    }
  }
  const offWake = ctx.browsers.onWake(schedule)
  const offControl = ctx.browsers.onControl((snapshot) => {
    const agent = ctx.agents.get(SessionId(snapshot.sessionId))
    if (!agent) return
    const goal = ctx.goals.get(agent)
    if (goal?.phase === 'active') {
      const paused = ctx.goals.pause(agent, { id: goal.id, revision: goal.revision })
      db.prepare('INSERT OR REPLACE INTO browser_goal_suspensions VALUES (?,?,?)').run(
        snapshot.taskId,
        paused.id,
        paused.revision,
      )
    }
    agent.cancel({ kind: 'user' })
  })
  ctx.on('agent/created', () => {
    schedule()
    return undefined
  })
  ctx.effect(() => async () => {
    stopped = true
    offWake()
    offControl()
    await running?.catch(() => {})
  })
  schedule()
}
