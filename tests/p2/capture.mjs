import { chromium, expect } from '@playwright/test'
import { fixtureHost } from './fixture-host.mjs'
import { mkdir } from 'node:fs/promises'
const host = await fixtureHost(),
  browser = await chromium.launch({ channel: 'chrome' })
await mkdir('reports/p2/demo', { recursive: true })
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    recordVideo: { dir: 'reports/p2/demo', size: { width: 1440, height: 1000 } },
  }),
  page = await context.newPage()
async function send(text) {
  await page.getByRole('textbox', { name: '消息', exact: true }).fill(text)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
}
try {
  await page.goto(host.login)
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeVisible()
  await page.screenshot({ path: 'reports/p2/01-首页.png' })
  await send('读取工具')
  const tool = page.getByRole('button', { name: /read.*已完成/ })
  await expect(tool).toBeVisible()
  await tool.click()
  await page.screenshot({ path: 'reports/p2/desktop.png' })
  await send('审批展示')
  await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
  await page.screenshot({ path: 'reports/p2/04-等待审批.png' })
  await page.getByRole('button', { name: '仅允许本次' }).click()
  await expect(page.getByRole('button', { name: /bash.*已完成/ })).toBeVisible()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('这个草稿会在刷新后保留')
  await page.reload()
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue(
    '这个草稿会在刷新后保留',
  )
  const narrowContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    storageState: await context.storageState(),
  })
  const narrow = await narrowContext.newPage()
  await narrow.goto(host.base)
  await expect(narrow.getByRole('textbox', { name: '消息', exact: true })).toHaveValue(
    '这个草稿会在刷新后保留',
  )
  await expect(narrow.locator('main > header')).toHaveCount(1)
  await expect(narrow.locator('aside')).toHaveCSS('opacity', '0')
  const button = await narrow.getByRole('button', { name: '发送消息', exact: true }).boundingBox()
  if (!button || button.y + button.height > 844) throw new Error('移动输入操作区越出视口')
  await narrow.screenshot({ path: 'reports/p2/mobile.png' })
  await narrow.getByRole('button', { name: '打开导航' }).click()
  await expect(narrow.locator('aside')).toHaveCSS('opacity', '1')
  await expect(narrow.getByRole('button', { name: '连接与工作区', exact: true })).toBeVisible()
  await narrow.screenshot({ path: 'reports/p2/mobile-navigation.png' })
  await narrowContext.close()
} finally {
  const video = page.video()
  await context.close()
  await video.saveAs('reports/p2/关键流程.webm')
  await browser.close()
  await host.dispose()
}
