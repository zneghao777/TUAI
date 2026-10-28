import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { proxyFor } from '../proxy.mjs'
test('代理路径 RPC、MUX、上传下载，切换另一 Host 不串线', async ({ page }) => {
  const first = await fixtureHost(),
    proxy = await proxyFor(first)
  let second
  try {
    await page.goto(proxy.login)
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toBeVisible()
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: '代理.txt', mimeType: 'text/plain', buffer: Buffer.from('前缀上传') })
    await expect(page.locator('[data-upload-state=ready]')).toBeVisible()
    await page.locator('[contenteditable="true"][role="textbox"]').fill('代理路径消息')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(
      page.locator(
        '[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])',
      ),
    ).toContainText('代理路径消息')
    await expect(page.getByText('代理.txt', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '打开右侧边栏' }).click()
    await page.getByRole('button', { name: /会话产物/ }).click()
    const response = page.waitForResponse((value) =>
      value.url().startsWith(proxy.base + 'api/artifact?'),
    )
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载', exact: true }).click()
    expect((await response).status()).toBe(200)
    expect((await download).suggestedFilename()).toBe('代理.txt')
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click()
    await page.locator('[contenteditable="true"][role="textbox"]').fill('第一个 Host 的草稿')
    second = await fixtureHost()
    await page.goto(second.login)
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toHaveText('')
    await expect(page.getByRole('tree', { name: '会话' })).not.toContainText('代理路径消息')
    await page.goto(proxy.base)
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toHaveText(
      '第一个 Host 的草稿',
    )
  } finally {
    await page.close()
    await second?.dispose()
    await proxy.dispose()
    await first.dispose()
  }
})
