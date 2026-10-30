import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { startWebHost } from '../../../apps/cli/lib/web.js'

test('语言设置切换并在 Host 重启后恢复', async ({ page }) => {
  page.setDefaultTimeout(5000)
  const host = await fixtureHost()
  let reboot: Awaited<ReturnType<typeof startWebHost>> | undefined
  try {
    await page.goto(host.login)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    const languageButton = page.getByRole('button', { name: '语言: 中文' })
    const permissionButton = page.getByRole('button', { name: '仅可查看', exact: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const languageBox = await languageButton.boundingBox()
      const permissionBox = await permissionButton.boundingBox()
      expect(languageBox).not.toBeNull()
      expect(permissionBox).not.toBeNull()
      expect(Math.abs(languageBox!.height - permissionBox!.height)).toBeLessThanOrEqual(1)
      expect(
        Math.abs(languageBox!.x + languageBox!.width - permissionBox!.x - permissionBox!.width),
      ).toBeLessThanOrEqual(1)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await languageButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('button[aria-label="Dismiss"]').first()).toHaveCount(1)
    await page.getByRole('button', { name: 'Language: English' }).click()
    await page.getByRole('menuitem', { name: 'Italiano' }).click()
    await expect(page.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Generale' })).toBeVisible()
    await expect(page.getByText('Autorizzazioni', { exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    const dismiss = page.locator('button[tabindex="-1"][style*="width: 1px"]').first()
    await expect(dismiss).toHaveAttribute('aria-label', /.+/)
    await expect(dismiss).not.toHaveAttribute('aria-label', '取消')
    await page.getByRole('button', { name: 'Sola lettura', exact: true }).click()
    await expect(
      page.getByRole('menuitem', { name: 'Accesso completo', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Modelli', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Modelli' })).toBeVisible()
    await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
    await page.getByRole('button', { name: 'Competenze', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Competenze', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Documenti', exact: true })).toBeVisible()
    await page.goto('about:blank')
    await host.runtime.dispose()
    reboot = await startWebHost({ port: 0 })
    const base = `http://127.0.0.1:${reboot.ctx.webServer.port}/`
    await page.goto(reboot.ctx.connection.authenticatedUrl(base))
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    await page.getByRole('button', { name: 'Impostazioni', exact: true }).click()
    await page.getByRole('tab', { name: 'Generale', exact: true }).click()
    await page.getByRole('button', { name: 'Lingua: Italiano' }).click()
    await page.getByRole('menuitem', { name: '中文' }).click()
    await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  } finally {
    await page.close().catch(() => {})
    await reboot?.dispose()
    await host.dispose()
  }
})
