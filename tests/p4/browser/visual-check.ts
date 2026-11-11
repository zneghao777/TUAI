import { expect, type Page } from '@playwright/test'
export async function checkBrowserVariants(page: Page) {
  const languages = [
    {
      option: '中文',
      settings: '设置',
      general: '通用',
      control: '语言: 中文',
      close: '关闭',
      take: '接管',
      palettes: ['纯白', '青绿', '晨曦'],
      modes: ['浅色', '深色'],
    },
    {
      option: 'English',
      settings: 'Settings',
      general: 'General',
      control: 'Language: English',
      close: 'Close',
      take: 'Take control',
      palettes: ['White', 'Forest', 'Dawn'],
      modes: ['Light', 'Dark'],
    },
    {
      option: 'Italiano',
      settings: 'Impostazioni',
      general: 'Generale',
      control: 'Lingua: Italiano',
      close: 'Chiudi',
      take: 'Prendi controllo',
      palettes: ['Bianco', 'Verde', 'Alba'],
      modes: ['Chiaro', 'Scuro'],
    },
  ]
  let current = languages[0]
  for (const [i, language] of languages.entries()) {
    await page.getByRole('button', { name: current.settings, exact: true }).click()
    await page.getByRole('tab', { name: current.general, exact: true }).click()
    if (i) {
      await page.getByRole('button', { name: current.control, exact: true }).click()
      await page.getByRole('menuitem', { name: language.option, exact: true }).click()
    }
    for (const [j, palette] of language.palettes.entries())
      for (const [k, mode] of language.modes.entries()) {
        if (j || k) {
          await page.getByRole('button', { name: language.settings, exact: true }).click()
          await page.getByRole('tab', { name: language.general, exact: true }).click()
        }
        const dialog = page.getByRole('dialog', { name: language.settings })
        await dialog.getByRole('button', { name: palette, exact: true }).click()
        const modeButton = dialog.getByRole('button', { name: mode, exact: true })
        if (j !== 1 && k === 1) await expect(modeButton).toBeDisabled()
        else {
          await expect(modeButton).toBeEnabled()
          await modeButton.click()
        }
        await dialog.getByRole('button', { name: language.close, exact: true }).click()
        await expect(page.getByRole('button', { name: language.take, exact: true })).toBeVisible()
        await page.screenshot({ path: `reports/p4/visual-${i}-${j}-${k}.png` })
      }
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: language.take, exact: true })).toBeVisible()
    const bounds = (await page.locator('.tz-browser-controls').boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
    await page.screenshot({ path: `reports/p4/visual-narrow-${i}.png` })
    await page.setViewportSize({ width: 1600, height: 1050 })
    current = language
  }
  await page.getByRole('button', { name: current.settings, exact: true }).click()
  await page.getByRole('tab', { name: current.general, exact: true }).click()
  await page.getByRole('button', { name: current.control, exact: true }).click()
  await page.getByRole('menuitem', { name: '中文', exact: true }).click()
  await page
    .getByRole('dialog', { name: '设置' })
    .getByRole('button', { name: '关闭', exact: true })
    .click()
}
