import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
let host: Awaited<ReturnType<typeof fixtureHost>>
test.beforeEach(async ({ page }) => {
  host = await fixtureHost()
  page.on('pageerror', (error) => console.error('PAGE ERROR', error))
  await host.runtime.ctx.settingsController.update(
    'ui-chat',
    { transcriptView: 'verbose' },
    undefined,
  )
  await page.goto(host.login)
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '模型与推理强度', exact: true })).toContainText(
    'P2 受控验收模型',
  )
})
test.afterEach(async ({ page }) => {
  await page.close()
  await host?.dispose()
})
async function send(page, text) {
  await page.getByRole('textbox', { name: '消息', exact: true }).fill(text)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
}
test('真实发送、流式、草稿、刷新与唯一最终回答', async ({ page }) => {
  await page.screenshot({ path: 'reports/p2/01-首页.png' })
  await send(page, '你好，真实会话')
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toHaveText(/已通过真实 Host 接收：你好，真实会话/)
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('保留的中文草稿')
  await page.reload()
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue(
    '保留的中文草稿',
  )
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toHaveCount(1)
  await page.screenshot({ path: 'reports/p2/02-真实聊天.png' })
})
test('实际工具执行与错误回执可展开', async ({ page }) => {
  await send(page, '读取工具')
  const tool = page
    .locator('[data-tool="read"][data-state="ok"] [data-disclosure-row][aria-expanded]')
    .first()
  await expect(tool).toBeVisible()
  if ((await tool.getAttribute('aria-expanded')) === 'false') await tool.click()
  await expect(tool).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText(/@tianzhiai\/workspace/).first()).toBeVisible()
  await page.screenshot({ path: 'reports/p2/03-工具详情.png' })
  await send(page, '工具失败')
  await expect(
    page
      .locator('[data-tool="read"][data-state="error"] [data-disclosure-row][aria-expanded]')
      .first(),
  ).toBeVisible()
})
test('真实审批批准与拒绝', async ({ page }) => {
  await send(page, '审批批准')
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  await page.screenshot({ path: 'reports/p2/04-等待审批.png' })
  await page.getByRole('button', { name: '仅允许本次' }).click()
  await expect(page.locator('[data-sample="bash"][data-state="ok"]').first()).toBeVisible()
  const shellRow = page.locator('[data-sample="bash"][data-state="ok"]').first()
  if ((await shellRow.getAttribute('aria-expanded')) === 'false') await shellRow.click()
  await expect(page.getByText('P2_REAL_SHELL_OK', { exact: true })).toBeVisible()
  await send(page, '审批拒绝')
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(page.locator('[data-sample="bash"][data-state="error"]').first()).toBeVisible()
})
test('审批等待可追加队列，批准前不执行，回执后继续', async ({ page }) => {
  await send(page, '审批批准')
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('批准后处理这条队列')
  await page.getByRole('button', { name: '排队发送', exact: true }).click()
  await expect(page.getByText('排队中 · 批准后处理这条队列')).toBeVisible()
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  const before = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(before.some((e) => e.type === 'tool/result')).toBe(false)
  expect(before.some((e) => e.type === 'approval/decided')).toBe(false)
  await page.getByRole('button', { name: '仅允许本次' }).click()
  await expect(page.locator('[data-sample="bash"][data-state="ok"]').first()).toBeVisible()
  await expect(
    page
      .locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])')
      .last(),
  ).toContainText('批准后处理这条队列')
  await expect(page.getByText('排队中 · 批准后处理这条队列')).toHaveCount(0)
})
test('审批等待断线后恢复同一请求，重连本身不批准', async ({ page, context }) => {
  await send(page, '审批批准')
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: '重新连接', exact: true })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  const before = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(before.filter((e) => e.type === 'approval/asked')).toHaveLength(1)
  expect(before.some((e) => e.type === 'tool/result')).toBe(false)
  await page.getByRole('button', { name: '仅允许本次' }).click()
  await expect(page.locator('[data-sample="bash"][data-state="ok"]').first()).toBeVisible()
  const after = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(after.filter((e) => e.type === 'approval/decided')).toHaveLength(1)
  expect(after.filter((e) => e.type === 'tool/result')).toHaveLength(1)
})
test('真实问题选择、自由回答与取消', async ({ page }) => {
  await send(page, '用户问题')
  await page.getByLabel('简洁').check()
  await page.getByRole('textbox', { name: '补充要求 自由输入' }).fill('用中文')
  await page.getByRole('button', { name: '提交回答' }).click()
  await expect(
    page
      .locator(
        '[data-tool="ask_user_question"][data-state="ok"] [data-disclosure-row][aria-expanded]',
      )
      .first(),
  ).toBeVisible()
  await send(page, '再次问题')
  await page.getByRole('button', { name: '取消当前执行', exact: true }).click()
  await expect(page.getByRole('region', { name: '用户问题' })).toHaveCount(0)
})
test('文件图片上传、会话引用、鉴权下载与跨会话拒绝', async ({ page, context }) => {
  await page.locator('input[type=file]').setInputFiles([
    { name: '资料.txt', mimeType: 'text/plain', buffer: Buffer.from('真实上传内容') },
    {
      name: '像素.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC',
        'base64',
      ),
    },
  ])
  await expect(page.locator('[data-upload-state=ready]')).toHaveCount(2)
  await send(page, '请查看附件')
  await expect(page.getByRole('img', { name: '像素.png', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '文件与产物' }).click()
  await expect(page.getByRole('button', { name: '下载', exact: true })).toHaveCount(2)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载', exact: true }).first().click()
  expect((await download).suggestedFilename()).toBe('资料.txt')
  const sessions = host.runtime.ctx.sessions.list()
  const id = sessions[0]?.id
  expect(id).toBeTruthy()
  const events = host.runtime.ctx.sessions.get(id).snapshotEvents()
  const ref = events
    .find((e) => e.type === 'user/message' && e.data.source.kind === 'user')
    .data.content.find((b) => b.type === 'file').attachment
  const path = `api/artifact?${new URLSearchParams({ sessionId: id, artifactId: ref.attachmentId })}`
  expect((await fetch(new URL(path, host.base))).status).toBe(401)
  expect((await context.request.get(new URL(path, host.base).href)).status()).toBe(200)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '新会话', exact: true }).click()
  const different = host.runtime.ctx.sessions.list().find((s) => s.id !== id)?.id
  expect(
    (
      await context.request.get(
        new URL(
          `api/artifact?${new URLSearchParams({ sessionId: different, artifactId: ref.attachmentId })}`,
          host.base,
        ).href,
      )
    ).status(),
  ).toBe(404)
})
test('真实排队、编辑、移除、插话与停止', async ({ page }) => {
  await send(page, '持续运行')
  await expect(page.getByRole('button', { name: '停止当前执行' })).toBeVisible()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('队列第一条')
  await page.getByRole('button', { name: '排队发送', exact: true }).click()
  await expect(page.getByText('排队中 · 队列第一条')).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByRole('textbox', { name: '编辑排队消息' }).fill('队列修改后')
  await page.getByRole('button', { name: '保存纯文本', exact: true }).click()
  await expect(page.getByText('排队中 · 队列修改后')).toBeVisible()
  await page.screenshot({ path: 'reports/p2/05-真实队列.png' })
  await page.getByRole('button', { name: '移除', exact: true }).click()
  await expect(page.getByText('排队中 · 队列修改后')).toHaveCount(0)
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('新的插话')
  await page.getByRole('button', { name: '插话到下一步', exact: true }).click()
  host.model.continueRuns()
  await expect(
    page
      .locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])')
      .last(),
  ).toContainText('新的插话')
  await send(page, '持续运行')
  await page.getByRole('button', { name: '停止当前执行' }).click()
  await expect(page.getByRole('button', { name: '停止当前执行' })).toHaveCount(0)
})
test('离线后流式恢复、草稿不重发且最终回答唯一', async ({ page, context }) => {
  const started = performance.now()
  await send(page, '流式恢复的真实内容')
  await expect(page.locator('[data-chat-running]')).toBeVisible()
  const firstVisibleMs = performance.now() - started
  await context.setOffline(true)
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('离线保留草稿')
  await expect(page.getByRole('button', { name: '重新连接', exact: true })).toBeVisible()
  await page.screenshot({ path: 'reports/p2/06-断线恢复.png' })
  const recoveryStarted = performance.now()
  await context.setOffline(false)
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toHaveCount(1)
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toContainText('流式恢复的真实内容。')
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue('离线保留草稿')
  const all = host.runtime.ctx.sessions
    .list()
    .flatMap((s) => host.runtime.ctx.sessions.get(s.id).snapshotEvents())
  expect(
    all.filter((e) => e.type === 'user/message' && e.data.source.kind === 'user'),
  ).toHaveLength(1)
  expect(all.filter((e) => e.type === 'assistant/message')).toHaveLength(1)
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    'reports/p2/stream-performance.json',
    JSON.stringify(
      {
        browser: await context.browser()?.version(),
        firstVisibleMs,
        recoveryToFinalMs: performance.now() - recoveryStarted,
        scope: '从用户发送动作到首个可见流片段；恢复到唯一持久回答，受控本机模型',
      },
      null,
      2,
    ) + '\n',
  )
})
test('安全 Markdown、窄屏、IME、键盘与焦点', async ({ page }) => {
  let externalImageRequests = 0
  page.on('request', (request) => {
    if (request.url().startsWith('https://invalid.example/')) externalImageRequests++
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const box = page.getByRole('textbox', { name: '消息', exact: true })
  await box.fill('中文输入中')
  await box.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
  })
  await expect(box).toHaveValue('中文输入中')
  expect(host.model.calls).toHaveLength(0)
  await box.press('Shift+Enter')
  await expect(box).toHaveValue('中文输入中\n')
  await send(page, '恶意内容')
  await expect(page.getByText('可读内容', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'p2Injected'))).toBeUndefined()
  expect(
    await page.locator('a[href^="javascript:"],img[src^="https://invalid.example"]').count(),
  ).toBe(0)
  expect(externalImageRequests).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('button', { name: '对话显示', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '连接与工作区', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: 'reports/p2/07-窄屏.png' })
})
test('多窗口审批竞争与取消后的旧回答隔离', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto(host.base)
  await expect(second.getByRole('textbox', { name: '消息', exact: true })).toBeVisible()
  await send(page, '审批竞争')
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  await expect(second.getByRole('region', { name: '操作审批' })).toBeVisible()
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(second.getByRole('region', { name: '操作审批' })).toHaveCount(0)
  await expect(page.locator('[data-sample="bash"][data-state="error"]').first()).toBeVisible()
  await send(page, '审批取消')
  await expect(second.getByRole('region', { name: '操作审批' })).toBeVisible()
  await second.getByRole('button', { name: '取消当前执行', exact: true }).click()
  await expect(page.getByRole('region', { name: '操作审批' })).toHaveCount(0)
  const events = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(
    events
      .filter((e) => e.type === 'approval/decided')
      .every((e) => e.data.outcome !== 'allowed-once'),
  ).toBe(true)
  await second.close()
})
test('真实审批超时失效，不执行过期操作', async ({ page }) => {
  test.setTimeout(45000)
  await send(page, '审批等待过期')
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  await expect(page.getByRole('region', { name: '操作审批' })).toHaveCount(0, { timeout: 35000 })
  const events = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(events.some((e) => e.type === 'approval/decided' && e.data.outcome === 'cancelled')).toBe(
    true,
  )
  expect(events.some((e) => e.type === 'tool/result' && !e.data.message.isError)).toBe(false)
})
test('大工具输出与受鉴权完整产物，清理后明确失败', async ({ page, context }) => {
  await send(page, '生成大输出')
  const tool = page
    .locator('[data-tool="large_fixture"][data-state="ok"] [data-disclosure-row][aria-expanded]')
    .first()
  await expect(tool).toBeVisible()
  if ((await tool.getAttribute('aria-expanded')) === 'false') await tool.click()
  await page.getByRole('button', { name: '文件与产物' }).click()
  await expect(page.getByRole('button', { name: '下载', exact: true })).toHaveCount(1)
  const id = host.runtime.ctx.sessions.list()[0].id
  const { clientFor } = await import('../client.mjs')
  const client = await clientFor(host.runtime)
  const artifacts = await client.ctx.remote.platform.artifacts(id)
  expect(artifacts.ok).toBe(true)
  expect(artifacts.value[0].bytes).toBeGreaterThan(400000)
  const url = new URL(
    `api/artifact?${new URLSearchParams({ sessionId: id, artifactId: artifacts.value[0].id })}`,
    host.base,
  ).href
  const downloaded = await context.request.get(url)
  expect(downloaded.status()).toBe(200)
  expect((await downloaded.text()).endsWith('最终证据')).toBe(true)
  const { rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { sessionDir } = await import('../../../packages/spill/spill-local/lib/index.js')
  await rm(
    join(
      sessionDir(join(host.runtime.ctx.tianzhiaiHost.paths.artifacts, 'spill'), id),
      artifacts.value[0].name,
    ),
  )
  expect((await context.request.get(url)).status()).toBe(404)
  await page.getByRole('button', { name: '下载', exact: true }).click()
  await expect(page.getByRole('alert').last()).toContainText('已清理')
  await client.dispose()
})
test('附件草稿切换会话与刷新保留，未接受失败可编辑', async ({ page }) => {
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: '草稿.txt', mimeType: 'text/plain', buffer: Buffer.from('草稿附件') })
  await expect(page.locator('[data-upload-state=ready]')).toBeVisible()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('附件草稿')
  await page.reload()
  await expect(page.getByRole('listitem', { name: '草稿.txt · 已上传，尚未发送' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue('附件草稿')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.getByText('草稿.txt', { exact: true })).toBeVisible()
})
test('真实 Host 已接受但 HTTP 回执丢失，刷新不重复提交', async ({ page }) => {
  let dropped = false
  await page.route('**/api/session/prompt', async (route) => {
    if (dropped) {
      await route.continue()
      return
    }
    dropped = true
    await route.fetch()
    await route.abort('failed')
  })
  await send(page, '回执丢失验收')
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toContainText('回执丢失验收')
  await page.reload()
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue('')
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toHaveCount(1)
  const events = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(
    events.filter((e) => e.type === 'user/message' && e.data.source.kind === 'user'),
  ).toHaveLength(1)
})
test('发送前断网保留身份，用户重试同一请求只接受一次', async ({ page }) => {
  let dropped = false,
    ids: string[] = []
  await page.route('**/api/session/prompt', async (route) => {
    const body = route.request().postDataJSON()
    ids.push(body.payload.args.request.requestId)
    if (!dropped) {
      dropped = true
      await route.abort('failed')
    } else await route.continue()
  })
  await send(page, '传输失败重试')
  await expect(page.getByRole('button', { name: '重试本次输入' })).toBeVisible()
  await page.getByRole('button', { name: '重试本次输入' }).click()
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toContainText('传输失败重试')
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
})
test('窄屏导航键盘隔离、返回焦点与触屏降级', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('aside')).toHaveAttribute('inert', '')
  const opener = page.getByRole('button', { name: '打开导航' })
  await opener.click()
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('aside'))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  await expect(page.locator('aside')).toHaveAttribute('inert', '')
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const mobile = await touch.newPage()
  try {
    await mobile.goto(host.login)
    await expect(mobile.getByRole('textbox', { name: '消息', exact: true })).toBeVisible()
    await expect(mobile.locator('aside')).toHaveCSS('transition-duration', '0s')
    await expect(mobile.locator('[class*="glow_"]')).toHaveCSS('display', 'none')
  } finally {
    await touch.close()
  }
})
test('Host 明确拒绝后草稿仍可编辑，粘贴附件走真实上传', async ({ page }) => {
  await page.route(
    '**/api/session/prompt',
    async (route) => {
      const body = route.request().postDataJSON()
      body.payload.args.request.content = []
      await route.continue({ postData: JSON.stringify(body) })
    },
    { times: 1 },
  )
  await send(page, '被拒绝的输入')
  await expect(page.getByText(/Host 已拒绝/)).toBeVisible()
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeEditable()
  await page.getByRole('textbox', { name: '消息', exact: true }).evaluate((el) => {
    const data = new DataTransfer()
    data.items.add(new File(['粘贴的真实内容'], '粘贴.txt', { type: 'text/plain' }))
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }))
  })
  await expect(page.getByRole('listitem', { name: '粘贴.txt · 已上传，尚未发送' })).toBeVisible()
  await send(page, '修正后发送')
  await expect(page.getByText('粘贴.txt', { exact: true })).toBeVisible()
})
