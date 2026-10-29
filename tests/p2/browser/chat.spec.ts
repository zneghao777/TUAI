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
  await expect(page.getByRole('button', { name: /^选择模型/ })).toContainText('P2 受控验收模型')
})
test.afterEach(async ({ page }) => {
  await page.close()
  await host?.dispose()
})
async function send(page, text) {
  await page.locator('[contenteditable="true"][role="textbox"]').fill(text)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
}
test('真实发送、流式、草稿、刷新与唯一最终回答', async ({ page }) => {
  await page.screenshot({ path: 'reports/p2/01-首页.png' })
  await send(page, '你好，真实会话')
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toHaveText(/已通过真实 Host 接收：你好，真实会话/)
  await page.locator('[contenteditable="true"][role="textbox"]').fill('保留的中文草稿')
  await page.reload()
  await expect(page.locator('[contenteditable="true"][role="textbox"]')).toHaveText(
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
  await expect(page.locator('[data-approval-key]')).toBeVisible()
  await page.screenshot({ path: 'reports/p2/04-等待审批.png' })
  await page.getByRole('button', { name: '允许一次' }).click()
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
  await expect(page.locator('[data-approval-key]')).toBeVisible()
  await page.locator('[contenteditable="true"][role="textbox"]').fill('批准后处理这条队列')
  await page.getByRole('button', { name: '排队发送', exact: true }).click()
  await expect(
    page.locator('[data-queue-dock]').getByText('批准后处理这条队列', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-approval-key]')).toBeVisible()
  const before = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(before.some((e) => e.type === 'tool/result')).toBe(false)
  expect(before.some((e) => e.type === 'approval/decided')).toBe(false)
  await page.getByRole('button', { name: '允许一次' }).click()
  await expect(page.locator('[data-sample="bash"][data-state="ok"]').first()).toBeVisible()
  await expect(
    page
      .locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])')
      .last(),
  ).toContainText('批准后处理这条队列')
  await expect(
    page.locator('[data-queue-dock]').getByText('批准后处理这条队列', { exact: true }),
  ).toHaveCount(0)
})
test('审批等待断线后恢复同一请求，重连本身不批准', async ({ page, context }) => {
  await send(page, '审批批准')
  await expect(page.locator('[data-approval-key]')).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: '重新连接', exact: true })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(page.locator('[data-approval-key]')).toBeVisible()
  const before = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(before.filter((e) => e.type === 'approval/asked')).toHaveLength(1)
  expect(before.some((e) => e.type === 'tool/result')).toBe(false)
  await page.getByRole('button', { name: '允许一次' }).click()
  await expect(page.locator('[data-sample="bash"][data-state="ok"]').first()).toBeVisible()
  const after = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(after.filter((e) => e.type === 'approval/decided')).toHaveLength(1)
  expect(after.filter((e) => e.type === 'tool/result')).toHaveLength(1)
})
test('真实问题选择、自由回答与取消', async ({ page }) => {
  await send(page, '用户问题')
  await page.getByRole('radio', { name: '简洁', exact: true }).click()
  await page.getByPlaceholder('输入你的答案').fill('用中文')
  await page.getByRole('button', { name: '提交', exact: true }).click()
  await expect(
    page
      .locator(
        '[data-tool="ask_user_question"][data-state="ok"] [data-disclosure-row][aria-expanded]',
      )
      .first(),
  ).toBeVisible()
  await send(page, '再次问题')
  await page.getByRole('button', { name: '放弃整组问题', exact: true }).click()
  await expect(page.getByRole('button', { name: '放弃整组问题' })).toHaveCount(0)
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
  await page.getByRole('button', { name: '打开右侧边栏' }).click()
  await page.getByRole('button', { name: /会话产物/ }).click()
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
  await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click()
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
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
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({
    name: '排队附件.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('编辑队列必须保留的内容'),
  })
  await expect(page.locator('[data-upload-state=ready]')).toBeVisible()
  await page.locator('[contenteditable="true"][role="textbox"]').fill('队列第一条')
  await page.getByRole('button', { name: '排队发送', exact: true }).click()
  await expect(
    page.locator('[data-queue-dock]').getByText('队列第一条', { exact: true }),
  ).toBeVisible()
  const agent = host.runtime.ctx.agents.get(host.runtime.ctx.sessions.list()[0].id)
  // The optimistic strip appears before Host admission. Only an admitted row is editable.
  await expect(page.getByRole('button', { name: '编辑排队消息', exact: true })).toBeEnabled()
  await expect.poll(() => agent.inbox.nextTurn.length).toBe(1)
  const admitted = agent.inbox.nextTurn[0].content.filter((block) => block.type !== 'text')
  expect(admitted).toHaveLength(1)
  await page.getByRole('button', { name: '编辑排队消息', exact: true }).click()
  await page.getByRole('textbox', { name: '编辑排队消息' }).fill('队列修改后')
  await page.getByRole('button', { name: '保存排队消息', exact: true }).click()
  await expect(
    page.locator('[data-queue-dock]').getByText('队列修改后', { exact: true }),
  ).toBeVisible()
  expect(agent.inbox.nextTurn[0].content.filter((block) => block.type !== 'text')).toEqual(admitted)
  await expect(
    page.locator('[data-queue-dock]').getByText('排队附件.txt', { exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: 'reports/p2/05-真实队列.png' })
  await page.getByRole('button', { name: '删除排队消息', exact: true }).click()
  await expect(
    page.locator('[data-queue-dock]').getByText('队列修改后', { exact: true }),
  ).toHaveCount(0)
  await page.locator('[contenteditable="true"][role="textbox"]').fill('新的插话')
  await page
    .locator('[contenteditable="true"][role="textbox"]')
    .press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  host.model.continueRuns()
  await expect(
    page
      .locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])')
      .last(),
  ).toContainText('新的插话')
  await send(page, '持续运行')
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0)
})
test('离线后流式恢复、草稿不重发且最终回答唯一', async ({ page, context }) => {
  const started = performance.now()
  await send(page, '流式恢复的真实内容')
  await expect(page.locator('[data-chat-running]')).toBeVisible()
  const firstVisibleMs = performance.now() - started
  await context.setOffline(true)
  await page.locator('[contenteditable="true"][role="textbox"]').fill('离线保留草稿')
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
  await expect(page.locator('[contenteditable="true"][role="textbox"]')).toHaveText('离线保留草稿')
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
  const box = page.locator('[contenteditable="true"][role="textbox"]')
  await box.fill('中文输入中')
  await box.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
  })
  await expect(box).toHaveText('中文输入中')
  expect(host.model.calls).toHaveLength(0)
  await box.press('Shift+Enter')
  await expect(box).toHaveText('中文输入中\n')
  await send(page, '恶意内容')
  await expect(page.getByText('可读内容', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'p2Injected'))).toBeUndefined()
  expect(
    await page.locator('a[href^="javascript:"],img[src^="https://invalid.example"]').count(),
  ).toBe(0)
  expect(externalImageRequests).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '打开侧边栏' }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('tab', { name: '对话显示', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '连接与工作区', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: 'reports/p2/07-窄屏.png' })
})
test('多窗口审批竞争与取消后的旧回答隔离', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto(host.base)
  await expect(second.locator('[contenteditable="true"][role="textbox"]')).toBeVisible()
  await send(page, '审批竞争')
  await expect(page.locator('[data-approval-key]')).toBeVisible()
  await expect(second.locator('[data-approval-key]')).toBeVisible()
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(second.locator('[data-approval-key]')).toHaveCount(0)
  await expect(page.locator('[data-sample="bash"][data-state="error"]').first()).toBeVisible()
  await send(page, '审批取消')
  await expect(second.locator('[data-approval-key]')).toBeVisible()
  await second.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.locator('[data-approval-key]')).toHaveCount(0)
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
  await expect(page.locator('[data-approval-key]')).toBeVisible()
  await expect(page.locator('[data-approval-key]')).toHaveCount(0, { timeout: 35000 })
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
  await page.getByRole('button', { name: '打开右侧边栏' }).click()
  await page.getByRole('button', { name: /会话产物/ }).click()
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
  await page.locator('[contenteditable="true"][role="textbox"]').fill('附件草稿')
  await page.reload()
  await expect(page.getByRole('button', { name: '移除文件 草稿.txt' })).toBeVisible()
  await expect(page.locator('[contenteditable="true"][role="textbox"]')).toHaveText('附件草稿')
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
  await expect(page.locator('[contenteditable="true"][role="textbox"]')).toHaveText('')
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toHaveCount(1)
  const events = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
  expect(
    events.filter((e) => e.type === 'user/message' && e.data.source.kind === 'user'),
  ).toHaveLength(1)
})
test('发送前传输失败，有限重试沿用同一身份只接受一次', async ({ page }) => {
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
  await expect(
    page.locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])'),
  ).toContainText('传输失败重试')
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
})
test('原侧栏窄屏展开收起与触摸设置，弹窗隔离键盘焦点', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const opener = page.getByRole('button', { name: '打开侧边栏', exact: true })
  await expect(opener).toBeVisible()
  await opener.click()
  await expect(page.getByRole('tree', { name: '会话' })).toBeVisible()
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await expect(opener).toBeVisible()
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const mobile = await touch.newPage()
  try {
    await mobile.goto(host.login)
    await mobile.getByRole('button', { name: '设置', exact: true }).tap()
    const dialog = mobile.getByRole('dialog', { name: '设置', exact: true })
    await expect(dialog).toBeInViewport()
    for (let n = 0; n < 10; n++) {
      await mobile.keyboard.press('Tab')
      expect(
        await mobile.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
      ).toBe(true)
    }
    await mobile.keyboard.press('Escape')
    await expect(mobile.getByRole('button', { name: '设置', exact: true })).toBeFocused()
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
  await expect(page.locator('[contenteditable="true"][role="textbox"]')).toBeEditable()
  await page.locator('[contenteditable="true"][role="textbox"]').evaluate((el) => {
    const data = new DataTransfer()
    data.items.add(new File(['粘贴的真实内容'], '粘贴.txt', { type: 'text/plain' }))
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }))
  })
  await expect(page.getByRole('button', { name: '移除文件 粘贴.txt' })).toBeVisible()
  await send(page, '修正后发送')
  await expect(page.getByText('粘贴.txt', { exact: true })).toBeVisible()
})
