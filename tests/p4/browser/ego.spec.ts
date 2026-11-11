import { checkBrowserVariants } from './visual-check'
import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { resolveHostPaths } from '../../../packages/product/host-config/lib/index.js'
const run = JSON.parse(
  readFileSync(process.env.P4_RUNTIME_FILE ?? '/tmp/tianzhiai-p4-runtime.json', 'utf8'),
)
// Bounds come from the product's current structured observation. Target receipts come
// from the controlled website, without opening a competing Ego execution round.
function currentObservation() {
  const root = join(run.root, 'data/sessions')
  const observations = []
  for (const file of readdirSync(root, { recursive: true }).filter((v) =>
    v.endsWith('session.v4.jsonl'),
  )) {
    for (const line of readFileSync(join(root, file), 'utf8').trim().split('\n')) {
      const event = JSON.parse(line)
      if (event.type !== 'tool/result') continue
      for (const block of event.data.message.content ?? []) {
        if (block.type !== 'text') continue
        try {
          const value = JSON.parse(block.text)
          if (value.refs) observations.push(value)
        } catch {}
      }
    }
  }
  return observations.sort((a, b) => a.observedAt - b.observedAt).at(-1)
}
function binding() {
  const db = new DatabaseSync(resolveHostPaths({ env: { TUAI_HOME: run.root } }).database, {
    readOnly: true,
  })
  try {
    const row = db
      .prepare(
        'SELECT b.state,t.status FROM browser_sessions b JOIN tasks t ON t.id=b.task_id ORDER BY b.rowid DESC LIMIT 1',
      )
      .get()
    return { ...JSON.parse(String(row.state)), taskStatus: row.status }
  } finally {
    db.close()
  }
}
async function receipts(page: Page) {
  return (await page.request.get(run.site + '/api/evidence')).json()
}
async function remoteClick(page: Page, name: string) {
  const observation = currentObservation(),
    r = observation.refs.find(
      (r: { description: string; bounds?: unknown }) =>
        r.description.includes('"' + name + '"') && r.bounds,
    )?.bounds
  if (!r) throw new Error('No current semantic bounds for ' + name)
  const canvas = page.locator('.tz-browser canvas'),
    box = (await canvas.boundingBox())!,
    v = observation.viewport
  if (r.y < 0 || r.y + r.height > v.height) throw new Error('Target outside viewport: ' + name)
  await page.mouse.click(
    box.x + ((r.x + r.width / 2) * box.width) / v.width,
    box.y + ((r.y + r.height / 2) * box.height) / v.height,
  )
}
test('formal chat → real Ego → direct panel input → same-execution continuation', async ({
  page,
}) => {
  test.setTimeout(process.env.P4_PERF ? 240000 : 120000)
  const launchUiAt = Date.now()
  const hostRss = () =>
    Number(
      execFileSync('ps', ['-o', 'rss=', '-p', String(run.hostPid)], { encoding: 'utf8' }).trim(),
    ) * 1024
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    if (r.status() === 404) console.log('P4 missing resource:', r.url())
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
      console.log('P4 browser error:', msg.text())
    }
  })
  await page.addInitScript(() => {
    ;(window as any).p4Metrics = []
    window.addEventListener('tianzhiai:browser-metric', (event: any) => {
      ;(window as any).p4Metrics.push(event.detail)
    })
  })
  await page.goto(run.authURL)
  const composer = page.locator('[contenteditable=true][role=textbox]')
  await expect(composer).toBeVisible()
  if (!run.autoSessionId) {
    await composer.click()
    await page.keyboard.insertText(
      'P4 出行验收：在受控网站查询 2026-11-15 Milano 到 Roma，等待我登录和输入中文备注，交还后从原任务继续。',
    )
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled()
    await composer.press('Enter')
  } else {
    await page
      .getByRole('navigation', { name: '聊天记录' })
      .getByRole('button')
      .filter({ hasText: 'P4 出行' })
      .first()
      .click()
  }
  await expect(page.getByRole('button', { name: '接管', exact: true })).toBeVisible({
    timeout: 60000,
  })
  await expect(
    page.getByText('请接管当前页面完成合成登录和中文备注，然后明确交还 Agent。', { exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect
    .poll(() => page.locator('.tz-browser canvas').evaluate((c: HTMLCanvasElement) => c.width))
    .toBe(2710)
  await page.screenshot({ path: 'reports/p4/formal-chat-agent.png' })
  const beforeHandoff = binding()
  const initialFrameAt = Date.now()
  await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click()
  await expect(page.locator('.tz-browser canvas')).toBeHidden()
  await page.waitForTimeout(300)
  await expect(page.locator('.tz-browser canvas')).toBeHidden()
  expect(binding().pageId).toBe(beforeHandoff.pageId)
  await page.getByRole('button', { name: '打开右侧边栏', exact: true }).click()
  await expect(page.locator('.tz-browser canvas')).toBeVisible()
  console.log('P4: agent waiting')
  await page.getByRole('button', { name: '接管', exact: true }).click()
  await expect(page.getByRole('button', { name: '交还 Agent', exact: true })).toBeVisible()
  await remoteClick(page, '姓名')
  await page.keyboard.insertText('合成测试用户')
  await remoteClick(page, '登录')
  await expect
    .poll(async () =>
      (await receipts(page)).events.some((e: { kind: string }) => e.kind === 'login'),
    )
    .toBe(true)
  await remoteClick(page, '旅行备注')
  await page.keyboard.insertText('本机中文输入')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('第二行')
  await expect
    .poll(
      async () =>
        (await receipts(page)).events.findLast(
          (e: { kind: string; value: { id: string } }) =>
            e.kind === 'input' && e.value.id === 'note',
        )?.value.value,
    )
    .toBe('本机中文输入\n第二行')
  await remoteClick(page, '保存备注')
  await expect
    .poll(async () =>
      (await receipts(page)).events.some(
        (e: { kind: string; value: string }) =>
          e.kind === 'note' && e.value === '本机中文输入\n第二行',
      ),
    )
    .toBe(true)
  console.log('P4: real website received Chinese and multiline note')
  await page.screenshot({ path: 'reports/p4/formal-chat-human.png' })
  // Exercise physical key translation, paste, composition replacement and target receipts.
  await remoteClick(page, '旅行备注')
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
  await page.locator('.tz-browser-proxy').evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', '粘贴中文\n第二行')
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }))
  })
  await expect
    .poll(
      async () =>
        (await receipts(page)).events.findLast(
          (e: any) => e.kind === 'input' && e.value.id === 'note',
        )?.value.value,
    )
    .toBe('粘贴中文\n第二行')
  if (process.env.P4_PERF) {
    await page.waitForTimeout(250)
    const beforeMemory = {
      hostRssBytes: hostRss(),
      rendererHeapBytes: await page.evaluate(
        () => (performance as any).memory?.usedJSHeapSize ?? null,
      ),
    }
    const metricStart = (await page.evaluate(() => (window as any).p4Metrics)).length
    const start = Date.now(),
      latencies: number[] = []
    for (let n = 0; n < 220; n++) {
      const before = await page
          .locator('.tz-browser canvas')
          .evaluate((c: HTMLCanvasElement) =>
            Array.from(c.getContext('2d')!.getImageData(8, 8, 1, 1).data).join(','),
          ),
        at = Date.now()
      await page.keyboard.insertText('测')
      await expect
        .poll(
          () =>
            page
              .locator('.tz-browser canvas')
              .evaluate((c: HTMLCanvasElement) =>
                Array.from(c.getContext('2d')!.getImageData(8, 8, 1, 1).data).join(','),
              ),
          { timeout: 5000, intervals: [5] },
        )
        .not.toBe(before)
      latencies.push(Date.now() - at)
      const next = start + (n + 1) * 275
      if (next > Date.now()) await page.waitForTimeout(next - Date.now())
    }
    const metrics = (await page.evaluate(() => (window as any).p4Metrics)).slice(metricStart),
      p95 = (v: number[]) => v.sort((a, b) => a - b)[Math.ceil(v.length * 0.95) - 1]
    writeFileSync(
      'reports/p4/performance.json',
      JSON.stringify(
        {
          durationMs: Date.now() - start,
          uiToFirstFrameMs: initialFrameAt - launchUiAt,
          fixtureLaunchToFirstFrameMs: initialFrameAt - run.launchedAt,
          coldBoundary: 'Ego already running; fresh connector and UI, not OS/Ego cold boot',
          memory: {
            before: beforeMemory,
            after: {
              hostRssBytes: hostRss(),
              rendererHeapBytes: await page.evaluate(
                () => (performance as any).memory?.usedJSHeapSize ?? null,
              ),
            },
          },
          observedFramesPerSecond:
            metrics.filter((m: any) => m.phase === 'frame').length / ((Date.now() - start) / 1000),
          queueBounds: { mediaInFlight: 1, mediaPending: 1, decodePending: 1, inputPending: 128 },
          inputSamples: 220,
          actualPixelChangeP95Ms: p95(latencies),
          inputAckP95Ms: p95(
            metrics.filter((m: any) => m.phase === 'input').map((m: any) => m.latencyMs),
          ),
          captureToDrawP95Ms: p95(
            metrics.filter((m: any) => m.phase === 'frame').map((m: any) => m.ageMs),
          ),
          frames: metrics.filter((m: any) => m.phase === 'frame').length,
          metrics,
        },
        null,
        2,
      ),
    )
  }
  // Toolbar drag must stay within its viewport and must not click the website.
  const handle = page.getByRole('button', { name: '移动控制栏；按 Home 复位' }),
    h = (await handle.boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x - 100, h.y - 100, { steps: 5 })
  await page.mouse.up()
  await handle.focus()
  await page.keyboard.press('Home')
  console.log('P4: toolbar drag complete, returning')
  await page.getByRole('button', { name: '交还 Agent', exact: true }).click()
  console.log('P4: return clicked')
  await expect(page.getByText(/已从原 Task \/ Execution 的当前登录页面继续查询/)).toBeVisible({
    timeout: 60000,
  })
  const after = await (await page.request.get(run.site + '/api/evidence')).json()
  const afterReturn = binding()
  expect(afterReturn.taskId).toBe(beforeHandoff.taskId)
  expect(afterReturn.executionId).toBe(beforeHandoff.executionId)
  expect(afterReturn.controlEpoch).toBeGreaterThan(beforeHandoff.controlEpoch)
  expect(afterReturn.pageId).toBe(beforeHandoff.pageId)
  expect(
    after.events.filter((e: { kind: string }) => e.kind === 'search').length,
  ).toBeGreaterThanOrEqual(2)
  await page.screenshot({ path: 'reports/p4/formal-chat-returned.png' })
  await composer.click()
  await page.keyboard.insertText(
    'P4 事务：准备创建一笔测试预订，必须等我具体批准，结果未知时只读核验。',
  )
  await composer.press('Enter')
  await expect(page.getByRole('region', { name: '确认具体操作' })).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('region', { name: '确认具体操作' })).toContainText('35 EUR')
  expect((await receipts(page)).orders).toHaveLength(0)
  await page.getByRole('button', { name: '批准这次操作', exact: true }).click()
  await expect(
    page.getByText('受控预订已只读核验；未付款、未出票。未重复提交。', { exact: true }),
  ).toBeVisible({ timeout: 60000 })
  const orders = await receipts(page)
  expect(orders.orders).toHaveLength(1)
  expect(orders.events.filter((e: any) => e.kind === 'submit-click')).toHaveLength(1)
  await page.screenshot({ path: 'reports/p4/transaction-reconciled.png' })
  console.log('P4: console errors', JSON.stringify(errors))
  writeFileSync(
    'reports/p4/ui-evidence.json',
    JSON.stringify(
      {
        kind: 'controlled model / real Ego / automated product UI',
        identity: { beforeHandoff, afterReturn },
        inputReceipts: after,
        transactionReceipts: orders,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  )
  expect(errors).toEqual([])
  if (process.env.P4_VISUAL) await checkBrowserVariants(page)
})
