import { test, expect, type Page } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'

let host: Awaited<ReturnType<typeof fixtureHost>>
let errors: string[]
test.beforeEach(async ({ page }) => {
  host = await fixtureHost()
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('slot entry crashed'))
      errors.push(message.text())
  })
  await page.goto(host.login)
  await expect(page.getByRole('button', { name: /^选择模型/ })).toContainText('P2 受控验收模型')
})
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed())
    console.log(await page.locator('main').ariaSnapshot())
  host.model.continueRuns()
  await page.close()
  await host.dispose()
  expect(errors).toEqual([])
})
async function send(page: Page, text: string) {
  await page.locator('[contenteditable="true"][role="textbox"]').fill(text)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
}
const answer = 'TZ063 验收回答：资料已读取，失败已记录，结果完整。'
const turn = (page: Page) => page.locator('[data-turn-process]').last()
async function openProcess(page: Page) {
  if ((await turn(page).getAttribute('aria-expanded')) === 'false') await turn(page).click()
  const group = page.locator('[data-step-process] button[data-process-activity]').last()
  if ((await group.getAttribute('aria-expanded')) === 'false') await group.click()
}
async function preference(page: Page, from: string, to: string) {
  await page.getByRole('dialog').getByRole('button', { name: from, exact: true }).first().click()
  await page.getByRole('menuitem', { name: to, exact: true }).click()
}
test('流式思考、多步紧凑列表、错误、整轮计时与历史恢复', async ({ page }) => {
  await send(page, 'TZ063 可控思考 对话验收')
  const liveGroup = page.locator('[data-step-process] button[data-process-activity]').last()
  await expect(liveGroup).toBeVisible()
  if ((await liveGroup.getAttribute('aria-expanded')) === 'false') await liveGroup.click()
  await expect(page.locator('[data-variant=think][data-state=running]')).toBeVisible()
  await expect(page.locator('[data-chat-running]')).toBeVisible()
  await expect(page.locator('[data-chat-running]')).toContainText('正在思考')
  await page.screenshot({ path: 'reports/p2/063-streaming.png' })
  host.model.continueRuns()
  await expect(page.getByText(answer, { exact: true })).toBeVisible()
  await expect(turn(page)).toBeVisible()
  const duration = await turn(page).textContent()
  expect(duration).toMatch(/已完成，用时\s*[1-9][0-9]*秒/)
  await openProcess(page)
  await expect(page.locator('[data-variant=think]')).toHaveCount(3)
  const tools = page.locator('[data-tool=read]')
  await expect(tools).toHaveCount(2)
  await expect(tools.nth(0)).toHaveAttribute('data-state', 'ok')
  await expect(tools.nth(1)).toHaveAttribute('data-state', 'error')
  await expect(tools.nth(1)).toContainText('tz063-missing-file.txt')
  expect((await tools.nth(0).boundingBox())!.height).toBeLessThanOrEqual(28)
  await page.locator('[data-variant=think] [data-disclosure-row][aria-expanded]').first().click()
  await expect(page.getByText('核对文件读取与错误处理。', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'reports/p2/063-conversation.png' })
  await page.reload()
  await expect(turn(page)).toHaveText(duration!)
  await openProcess(page)
  await expect(page.locator('[data-variant=think]')).toHaveCount(3)
  await expect(page.getByText(answer, { exact: true })).toHaveCount(1)
  await expect(page.getByText('已批准本次操作，结果请查看工具记录')).toHaveCount(0)
})
test('原显示设置：四种模式、折叠时机和保留回复持久化', async ({ page }) => {
  await send(page, 'TZ063 对话设置')
  await expect(page.getByText(answer, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '对话显示', exact: true }).click()
  await preference(page, '标准', '详细')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await openProcess(page)
  await expect(page.locator('[data-variant=think]').first()).toBeVisible()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '对话显示', exact: true }).click()
  await preference(page, '详细', '完全展开')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(turn(page)).toBeDisabled()
  await expect(page.locator('[data-variant=think]').first()).toBeVisible()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '对话显示', exact: true }).click()
  await preference(page, '完全展开', '简洁')
  await preference(page, '回答结束后', '下次有新消息时')
  await preference(page, '全部回复', '仅最终回答')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '对话显示', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '简洁', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '下次有新消息时', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '仅最终回答', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: 'reports/p2/063-preferences.png' })
})
test('纯思考与停止、断线重连不重复；无思考回答不造过程', async ({ page, context }) => {
  await send(page, 'TZ063 持续思考 纯思考')
  const liveGroup = page.locator('[data-step-process] button[data-process-activity]').last()
  await expect(liveGroup).toBeVisible()
  if ((await liveGroup.getAttribute('aria-expanded')) === 'false') await liveGroup.click()
  await expect(page.locator('[data-variant=think][data-state=running]')).toBeVisible()
  const started = await page.locator('[data-chat-running]').innerText()
  await expect.poll(() => page.locator('[data-chat-running]').innerText()).not.toBe(started)
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: '重新连接', exact: true })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(page.locator('[data-variant=think]')).toHaveCount(1)
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(turn(page)).toContainText('已停止')
  await expect(page.locator('[data-chat-running]')).toHaveCount(0)
  await page.reload()
  await expect(turn(page)).toContainText('已停止')
  await send(page, '没有思考的普通回答')
  await expect(
    page.getByText('已通过真实 Host 接收：没有思考的普通回答。', { exact: true }),
  ).toBeVisible()
  expect(host.model.calls).toHaveLength(2)
  // No reasoning is fabricated for the second Turn.
  const lastTurn = await turn(page).getAttribute('data-turn-process')
  await expect(page.locator(`[data-chat-turn="${lastTurn}"] [data-variant=think]`)).toHaveCount(0)
})
test('长过程内部滚动与窄屏布局', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await send(page, 'TZ063 长过程')
  await expect(page.getByText(answer, { exact: true })).toBeVisible({ timeout: 30000 })
  await openProcess(page)
  const body = page.locator('[data-step-process-body]').last()
  await expect.poll(() => body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  expect(await body.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(501)
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'reports/p2/063-narrow-process.png' })
})
