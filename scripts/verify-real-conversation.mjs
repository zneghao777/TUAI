// Explicit opt-in only; uses the configured model without printing or changing credentials.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, chmod, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { startWebHost } from '../apps/cli/lib/web.js'
import { resolveHostPaths } from '../packages/product/host-config/lib/index.js'
assert.equal(process.argv[2], '--run', 'Explicit live-model opt-in required: --run')
const original = resolveHostPaths()
const home = await mkdtemp(join(tmpdir(), 'tianzhiai-real-conversation-'))
const previous = process.env.TIANZHIAI_HOME
let runtime, browser
try {
  await mkdir(join(home, 'config'), { mode: 0o700 })
  for (const name of ['model-providers.json', 'model-secrets.key', 'model-secrets.enc']) {
    const path = join(home, 'config', name)
    await copyFile(join(original.config, name), path)
    await chmod(path, 0o600)
  }
  process.env.TIANZHIAI_HOME = home
  runtime = await startWebHost({ port: 0, provider: 'deepseek-official', model: 'deepseek-flash' })
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const base = `http://127.0.0.1:${runtime.ctx.webServer.port}/`
  await page.goto(runtime.ctx.connection.authenticatedUrl(base))
  await page.getByRole('textbox', { name: '消息', exact: true }).waitFor()
  await page.getByRole('combobox', { name: '推理强度', exact: true }).click()
  await page.getByRole('option', { name: '高', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '推理强度', exact: true })).toContainText('高')
  await page
    .getByRole('textbox', { name: '消息', exact: true })
    .fill(
      '这是 TZ063 对话验收。请实际调用 sum_numbers 计算 137+268，再计算非负整数 a≥b≥c 且 a+b+c=12 有多少组解，简要说明计算方法。不要读取文件或执行其他工具。',
    )
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.locator('[data-chat-running]').waitFor({ timeout: 30000 })
  // Snapshot the actual provider's stream, without saving auth URLs or request headers.
  await page.screenshot({ path: 'reports/p2/063-real-streaming.png' })
  await page.locator('[data-turn-process]').waitFor({ timeout: 120000 })
  const processButton = page.locator('[data-turn-process]').last()
  assert.match(await processButton.innerText(), /已完成，用时/)
  await expect(processButton).toHaveAttribute('aria-expanded', 'false')
  await processButton.click()
  const group = page.locator('[data-step-process] button[data-process-activity]').last()
  if ((await group.getAttribute('aria-expanded')) === 'false') await group.click()
  await page.locator('[data-variant=think]').first().waitFor()
  await page.locator('[data-variant=think] [data-disclosure-row]').first().click()
  await page.screenshot({ path: 'reports/p2/063-real-conversation.png' })
  const session = runtime.ctx.sessions
    .list()
    .find((s) => s.snapshotEvents().some((e) => e.type === 'turn/end'))
  const events = session.snapshotEvents()
  const messages = events.filter((e) => e.type === 'assistant/message')
  const reasoning = messages
    .flatMap((e) => e.data.message.content)
    .filter((b) => b.type === 'reasoning')
  assert.ok(
    reasoning.some((b) => b.text.length > 0),
    'Provider did not return durable reasoning',
  )
  const chunks = messages.flatMap((e) => e.data.stream).filter((r) => r.type === 'reasoning-chunks')
  assert.ok(chunks.length > 0, 'Missing actual reasoning deltas')
  const calls = events.filter((e) => e.type === 'tool/call').map((e) => e.data)
  const toolResults = events.filter((e) => e.type === 'tool/result')
  assert.ok(toolResults.some((e) => !e.data.message.isError))
  assert.ok(calls.length > 0 && calls.every((c) => c.name === 'sum_numbers'))
  assert.equal(new Set(calls.map((c) => c.callId)).size, calls.length)
  const duration = await processButton.innerText()
  await page.reload()
  await page.locator('[data-turn-process]').waitFor()
  assert.equal(await page.locator('[data-turn-process]').last().innerText(), duration)
  await expect(page.locator('[data-turn-process]').last()).toHaveAttribute('aria-expanded', 'false')
  await page.locator('[data-turn-process]').last().click()
  const restored = page.locator('[data-step-process] button[data-process-activity]').last()
  if ((await restored.getAttribute('aria-expanded')) === 'false') await restored.click()
  assert.equal(await page.locator('[data-variant=think]').count(), reasoning.length)
  assert.deepEqual(errors, [])
  await writeFile(
    'reports/p2/063-real-model.json',
    JSON.stringify(
      {
        provider: 'deepseek-official',
        model: 'deepseek-flash',
        reasoningEffort: 'high',
        reasoningBlocks: reasoning.length,
        reasoningCharacters: reasoning.reduce((n, b) => n + b.text.length, 0),
        assistantMessages: messages.length,
        toolResults: toolResults.length,
        toolNames: calls.map((c) => c.name),
        streamEvents: chunks.length,
        elapsedMs:
          events.findLast((e) => e.type === 'turn/end').time -
          events.find((e) => e.type === 'turn/start').time,
        durationLabel: duration,
        reloadReasoningRestored: true,
        pageErrors: errors,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'Live reasoning, tool execution, original chat rendering and reload verified; reports/p2/063-real-model.json',
  )
} catch (error) {
  if (browser)
    await browser.contexts()[0]?.pages()[0]?.screenshot({ path: 'reports/p2/063-real-failure.png' })
  throw error
} finally {
  await browser?.close()
  await runtime?.dispose()
  await rm(home, { recursive: true, force: true })
  if (previous === undefined) delete process.env.TIANZHIAI_HOME
  else process.env.TIANZHIAI_HOME = previous
}
