import { expect, test } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'

test('three languages remain usable across themes and screen sizes', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('Draft 原文')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    const languages = [
      {
        option: 'English',
        button: 'Language: English',
        palette: ['White', 'Forest', 'Dawn'],
        light: 'Light',
        dark: 'Dark',
        system: 'System',
        dialog: 'Settings',
      },
      {
        option: 'Italiano',
        button: 'Lingua: Italiano',
        palette: ['Bianco', 'Verde', 'Alba'],
        light: 'Chiaro',
        dark: 'Scuro',
        system: 'Sistema',
        dialog: 'Impostazioni',
      },
      {
        option: '中文',
        button: '语言: 中文',
        palette: ['纯白', '青绿', '晨曦'],
        light: '浅色',
        dark: '深色',
        system: '跟随系统',
        dialog: '设置',
      },
    ]
    let current = '语言: 中文'
    for (const language of languages) {
      await page.getByRole('button', { name: current }).click()
      await page.getByRole('menuitem', { name: language.option, exact: true }).click()
      current = language.button
      const dialog = page.getByRole('dialog', { name: language.dialog })
      for (const palette of language.palette) {
        const choice = dialog.getByRole('button', { name: palette, exact: true })
        await choice.click()
        await expect(choice).toHaveAttribute('aria-pressed', 'true')
        if (palette === language.palette[1]) {
          const dark = dialog.getByRole('button', { name: language.dark, exact: true })
          await dark.click()
          await expect(dark).toHaveAttribute('aria-pressed', 'true')
          const system = dialog.getByRole('button', { name: language.system, exact: true })
          await system.click()
          await expect(system).toHaveAttribute('aria-pressed', 'true')
          await dialog.getByRole('button', { name: language.light, exact: true }).click()
        }
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 844 })
          const control = dialog.getByRole('button', { name: language.button })
          await expect(control).toBeEnabled()
          const bounds = await control.boundingBox()
          expect(bounds).not.toBeNull()
          expect(bounds!.x).toBeGreaterThanOrEqual(0)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        }
      }
    }
    await page
      .getByRole('dialog', { name: '设置' })
      .getByRole('button', { name: '关闭', exact: true })
      .click()
    await expect(input).toHaveText('Draft 原文')
  } finally {
    await page.close().catch(() => {})
    await host.dispose()
  }
})
