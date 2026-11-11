import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'

test('DSH Slot 切换隔离草稿，快捷键只创建一次且尊重弹窗', async ({ page }) => {
  const host = await fixtureHost()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('slot entry crashed'))
      errors.push(message.text())
  })
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    const create = page.getByRole('button', { name: /新(?:建)?会话/ }).first()
    await expect(input).toBeVisible()
    const first = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    await input.fill('第一个会话的草稿')
    const shortcut = process.platform === 'darwin' ? 'Meta+Alt+n' : 'Control+Alt+n'
    for (let round = 0; round < 3; round++) {
      const count = await page.locator('[data-session-id]').count()
      await expect(create).toBeEnabled()
      await page.keyboard.press(shortcut)
      await expect(page.locator('[data-session-id]')).toHaveCount(count + 1)
      await expect(input).toHaveText('')
      await input.fill(`另一会话草稿 ${round}`)
    }
    await page.locator(`[data-session-id="${first}"]`).click()
    await expect(input).toHaveText('第一个会话的草稿')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveAttribute('data-shortcut-modal', 'settings')
    const count = await page.locator('[data-session-id]').count()
    await page.keyboard.press(shortcut)
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('[data-session-id]')).toHaveCount(count)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.reload()
    await expect(input).toHaveText('第一个会话的草稿')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(
      page.locator(
        '[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])',
      ),
    ).toContainText('第一个会话的草稿')
    await page.screenshot({ path: 'reports/p2/062-slot-session.png' })
    expect(errors).toEqual([])
  } finally {
    await page.close()
    await host.dispose()
  }
})
