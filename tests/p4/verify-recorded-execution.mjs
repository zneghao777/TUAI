// Verify the actual persisted controlled run, independently of the model's final text.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { resolveHostPaths } from '../../packages/product/host-config/lib/index.js'
const root =
  process.env.P4_EVIDENCE_ROOT ??
  JSON.parse(
    readFileSync('/tmp/tianzhiai-p4-final-host.log', 'utf8')
      .trim()
      .split('\n')
      .find((line) => line.startsWith('{"baseURL"')),
  ).root
const db = new DatabaseSync(resolveHostPaths({ env: { TUAI_HOME: root } }).database, {
  readOnly: true,
})
try {
  const browser = db.prepare('SELECT state FROM browser_sessions ORDER BY rowid LIMIT 1').get(),
    afterReturn = JSON.parse(browser.state)
  let beforeHandoff
  const events = []
  for (const name of readdirSync(join(root, 'data/sessions'), { recursive: true }).filter((name) =>
    name.endsWith('session.v4.jsonl'),
  )) {
    for (const line of readFileSync(join(root, 'data/sessions', name), 'utf8')
      .trim()
      .split('\n')) {
      const event = JSON.parse(line)
      events.push(event)
      if (event.type !== 'tool/result') continue
      for (const block of event.data.message.content ?? []) {
        if (block.type !== 'text') continue
        try {
          const value = JSON.parse(block.text)
          if (!beforeHandoff && value.id === afterReturn.id && value.executionId)
            beforeHandoff = value
        } catch {}
      }
    }
  }
  assert.ok(beforeHandoff)
  assert.equal(beforeHandoff.taskId, afterReturn.taskId)
  assert.equal(beforeHandoff.executionId, afterReturn.executionId)
  assert.ok(afterReturn.controlEpoch > beforeHandoff.controlEpoch)
  assert.equal(
    db.prepare('SELECT count(*) n FROM executions WHERE task_id=?').get(afterReturn.taskId).n,
    1,
  )
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM task_events WHERE task_id=? AND kind='browser-returned'")
      .get(afterReturn.taskId).n,
    1,
  )
  assert.equal(afterReturn.transaction.result.paid, false)
  assert.equal(afterReturn.transaction.result.ticketed, false)
  const report = JSON.parse(readFileSync('reports/p4/ui-evidence.json', 'utf8'))
  report.identity = { beforeHandoff, afterReturn }
  report.recordedExecutionVerified = true
  const reviews = db
    .prepare("SELECT detail FROM task_events WHERE task_id=? AND kind='browser-review-usage'")
    .all(afterReturn.taskId)
    .map((row) => JSON.parse(row.detail))
  report.reviewUsage = {
    kind: 'controlled model route; not production model quality',
    calls: reviews.length,
    inputTokens: reviews.reduce((n, r) => n + r.inputTokens, 0),
    outputTokens: reviews.reduce((n, r) => n + r.outputTokens, 0),
  }
  writeFileSync('reports/p4/ui-evidence.json', JSON.stringify(report, null, 2) + '\n')
  console.log(
    'Recorded execution: same Task/Execution, one return, unpaid reservation, reviewer route verified',
  )
} finally {
  db.close()
}
