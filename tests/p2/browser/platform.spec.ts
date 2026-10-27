import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { proxyFor } from '../proxy.mjs'
test('代理路径 RPC、MUX、上传下载，切换另一 Host 不串线', async ({ page }) => {
  const first = await fixtureHost(),
    proxy = await proxyFor(first)
  let second
  try {
    await page.goto(proxy.login)
    await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeVisible()
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: '代理.txt', mimeType: 'text/plain', buffer: Buffer.from('前缀上传') })
    await expect(page.getByText(/已上传，尚未发送/)).toBeVisible()
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('代理路径消息')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.locator('[data-message-kind="assistant"]')).toContainText('代理路径消息')
    const link = page.getByRole('link', { name: /代理.txt/ })
    expect(await link.getAttribute('href')).toMatch(/^api\/artifact/)
    expect(
      (
        await page.context().request.get(new URL(await link.getAttribute('href'), proxy.base).href)
      ).status(),
    ).toBe(200)
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('第一个 Host 的草稿')
    second = await fixtureHost()
    await page.getByRole('button', { name: '连接与工作区', exact: true }).click()
    await page.getByRole('textbox', { name: '目标 Host 地址' }).fill(second.login)
    await page.getByRole('button', { name: '切换并重新认证' }).click()
    await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue('')
    await expect(page.getByRole('navigation', { name: '会话历史' })).not.toContainText(
      '代理路径消息',
    )
    await page.goto(proxy.base)
    await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue(
      '第一个 Host 的草稿',
    )
  } finally {
    await page.close()
    await second?.dispose()
    await proxy.dispose()
    await first.dispose()
  }
})
