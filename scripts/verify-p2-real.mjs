// Opt-in production composition, actual configured provider, private disposable profile.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, chmod, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { startWebHost } from '../apps/cli/lib/web.js'
import { resolveHostPaths } from '../packages/product/host-config/lib/index.js'
assert.equal(process.argv[2], '--run')
const original = resolveHostPaths(),
  previous = process.env.TIANZHIAI_HOME
const home = await mkdtemp(join(tmpdir(), 'tianzhiai-p2-live-'))
let runtime, browser
const report = {
  provider: 'deepseek-official',
  model: 'deepseek-flash',
  approvals: 0,
  questionAnswers: 0,
  reviews: 0,
  pageErrors: [],
}
try {
  await mkdir(join(home, 'config'), { mode: 0o700 })
  for (const name of ['model-providers.json', 'model-secrets.key', 'model-secrets.enc']) {
    const path = join(home, 'config', name)
    await copyFile(join(original.config, name), path)
    await chmod(path, 0o600)
  }
  process.env.TIANZHIAI_HOME = home
  runtime = await startWebHost({ port: 0, provider: 'deepseek-official', model: 'deepseek-flash' })
  // Count actual reviewer requests without retaining their prompts or credentials.
  const stream = runtime.ctx.llm.stream.bind(runtime.ctx.llm)
  runtime.ctx.llm.stream = function (options) {
    if (options.system?.startsWith('REVIEW_POLICY')) report.reviews++
    return stream(options)
  }
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (e) => report.pageErrors.push(e.message))
  await page.goto(
    runtime.ctx.connection.authenticatedUrl(`http://127.0.0.1:${runtime.ctx.webServer.port}/`),
  )
  const input = page.locator('[contenteditable="true"][role="textbox"]')
  await input.waitFor()
  await page.getByRole('button', { name: /访问模式/ }).click()
  await page.getByRole('menuitem', { name: '仅可查看', exact: true }).click()
  await page.getByRole('button', { name: /^选择模型/ }).click()
  const effort = page.getByRole('menuitem', { name: /推理等级/ })
  if (await effort.count()) {
    await effort.click()
    await page.getByRole('menuitemradio', { name: /^(High|高)$/ }).click()
  } else await page.keyboard.press('Escape')
  await input.fill(
    '这是 P2 本地验收。请严格按顺序：1. 实际调用 bash 执行 printf "P2_REAL_APPROVAL_OK\\n"，不要访问网络或其他文件。2. 调用 ask_user_question 问我回答采用“简洁”还是“详细”，只有这一题，不要用普通消息代替工具。3. 收到回答后用所选风格解释 137+268 的结果。',
  )
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.locator('[data-approval-key]').waitFor({ timeout: 120000 })
  await page.screenshot({ path: 'reports/p2/022-live-approval.png' })
  await page.getByRole('button', { name: '允许一次', exact: true }).click()
  report.approvals++
  await page.locator('[data-question-key]').waitFor({ timeout: 120000 })
  await page.screenshot({ path: 'reports/p2/022-live-question.png' })
  await page.getByRole('radio', { name: /简洁/ }).click()
  const submit = page.getByRole('button', { name: '提交', exact: true })
  if (await submit.isVisible()) await submit.click()
  report.questionAnswers++
  await expect(page.locator('[data-question-key]')).toHaveCount(0, { timeout: 20000 })
  await page.locator('[data-turn-process]').waitFor({ timeout: 120000 })
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible({
    timeout: 120000,
  })
  const session = runtime.ctx.sessions
    .list()
    .find((s) => s.snapshotEvents().some((e) => e.type === 'turn/end'))
  const events = session.snapshotEvents()
  const calls = events.filter((e) => e.type === 'tool/call').map((e) => e.data.name)
  assert.ok(calls.includes('bash') && calls.includes('ask_user_question'))
  assert.ok(
    events.some(
      (e) =>
        e.type === 'assistant/message' &&
        e.data.message.content.some((b) => b.type === 'reasoning' && b.text.length > 0),
    ),
  )
  assert.ok(events.some((e) => e.type === 'approval/decided' && e.data.outcome === 'allowed-once'))
  report.conversation = {
    calls,
    toolResults: events.filter((e) => e.type === 'tool/result').length,
    reasoning: true,
    elapsedMs:
      events.findLast((e) => e.type === 'turn/end').time -
      events.find((e) => e.type === 'turn/start').time,
  }
  const duration = await page.locator('[data-turn-process]').last().innerText()
  await page.reload()
  await expect(page.locator('[data-turn-process]').last()).toHaveText(duration)
  await page.locator('[data-turn-process]').last().click()
  await page.screenshot({ path: 'reports/p2/022-live-complete.png' })
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
  await expect(page.locator('[data-session-id][aria-current=page]')).not.toHaveAttribute(
    'data-session-id',
    session.id,
  )
  await expect(page.locator('[data-turn-process]')).toHaveCount(0)
  await page.getByRole('button', { name: /访问模式/ }).click()
  await page.getByRole('menuitem', { name: /自动审查/ }).click()
  await page.getByRole('dialog').getByRole('checkbox').check()
  await page.getByRole('dialog').getByRole('button', { name: '启用自动审查', exact: true }).click()
  await input.fill(
    '这是 Auto 审查验收。我明确授权只执行 bash 命令 printf "P2_REAL_AUTO_OK\\n"，不读取、创建或修改任何文件。请实际执行一次，然后报告结果。',
  )
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('[data-turn-process]').last()).toContainText('已完成', {
    timeout: 120000,
  })
  const auto = runtime.ctx.sessions.list().find((s) => s.id !== session.id)
  const autoEvents = auto.snapshotEvents()
  assert.ok(report.reviews > 0, 'Actual reviewer request missing')
  assert.ok(autoEvents.some((e) => e.type === 'tool/result' && !e.data.message.isError))
  report.auto = {
    reviewRequests: report.reviews,
    calls: autoEvents.filter((e) => e.type === 'tool/call').map((e) => e.data.name),
    errors: autoEvents.filter((e) => e.type === 'tool/result' && e.data.message.isError).length,
  }
  await page.locator('[data-turn-process]').last().click()
  await page.screenshot({ path: 'reports/p2/022-live-auto.png' })
  assert.deepEqual(report.pageErrors, [])
  await writeFile(
    'reports/p2/022-live-model.json',
    JSON.stringify({ ...report, result: 'passed' }, null, 2) + '\n',
  )
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await browser
    ?.contexts()[0]
    ?.pages()[0]
    ?.screenshot({ path: 'reports/p2/022-live-failure.png' })
    .catch(() => {})
  await writeFile(
    'reports/p2/022-live-model.json',
    JSON.stringify({ ...report, result: 'failed', error: String(error) }, null, 2) + '\n',
  )
  throw error
} finally {
  await browser?.close()
  await runtime?.dispose()
  await rm(home, { recursive: true, force: true })
  if (previous === undefined) delete process.env.TIANZHIAI_HOME
  else process.env.TIANZHIAI_HOME = previous
}
