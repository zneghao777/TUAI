import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'

test('设置中的完全权限确认可以取消、关闭和勾选后保存', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('navigation', { name: '设置分类' }).getByRole('tab')).toHaveText([
      '通用',
      '模型',
    ])
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置', exact: true })
    const selector = settings.getByRole('button', { name: /仅可查看/ })
    const openConfirmation = async () => {
      await selector.click()
      await page.getByRole('menuitem', { name: '完全权限', exact: true }).click()
    }
    await openConfirmation()
    let confirmation = page.getByRole('dialog', { name: '确认启用完全权限？' })
    await confirmation.getByRole('button', { name: '关闭', exact: true }).click({ timeout: 5000 })
    await expect(confirmation).toHaveCount(0)
    await openConfirmation()
    confirmation = page.getByRole('dialog', { name: '确认启用完全权限？' })
    await page.keyboard.press('Escape')
    await expect(confirmation).toHaveCount(0)
    await expect(settings).toBeVisible()
    await openConfirmation()
    await confirmation.getByRole('checkbox').check({ timeout: 5000 })
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    await expect(selector).toContainText('仅可查看')
    await openConfirmation()
    await confirmation.getByRole('checkbox').check()
    await confirmation.getByRole('button', { name: '启用完全权限', exact: true }).click()
    await expect(settings.getByRole('button', { name: /完全权限/ })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await expect(
      page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: /完全权限/ }),
    ).toBeVisible()
    await page
      .getByRole('dialog', { name: '设置' })
      .getByRole('button', { name: '关闭', exact: true })
      .click()
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
    const stagedPermission = page.getByRole('button', { name: /访问模式/ })
    await expect(stagedPermission).toContainText('完全权限')
    await expect(stagedPermission).toHaveCSS('color', 'rgb(182, 62, 32)')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '青绿', exact: true }).click()
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await page
      .getByRole('dialog', { name: '设置' })
      .getByRole('button', { name: '关闭', exact: true })
      .click()
    await expect(stagedPermission).toHaveCSS('color', 'rgb(255, 156, 122)')
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('用量位于模型左侧，模型列表点击外部关闭，完全权限醒目显示', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true, contextUsage: 26100 })
  try {
    await page.goto(host.login)
    const editor = page.locator('[contenteditable="true"][role="textbox"]')
    await editor.fill('验证输入区')
    await editor.press('Enter')
    await expect(
      page.getByText('已通过真实 Host 接收：验证输入区。', { exact: true }),
    ).toBeVisible()
    const model = page.getByRole('button', { name: /^选择模型/ })
    const meter = page.getByRole('button', { name: /上下文已用/ })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const meterBox = (await meter.boundingBox())!
      const modelBox = (await model.boundingBox())!
      expect(meterBox.x + meterBox.width).toBeLessThanOrEqual(modelBox.x)
      await model.click()
      await page.getByRole('button', { name: '切换模型' }).click()
      const panel = page.getByRole('dialog', { name: '模型与推理强度' })
      await expect(panel.getByRole('listbox', { name: '模型' })).toBeVisible()
      await expect(panel.getByText('选择模型', { exact: true })).toHaveCount(0)
      await expect(panel.getByRole('button', { name: '返回推理强度' })).toHaveCount(0)
      await page.mouse.click(10, 10)
      await expect(panel).toHaveCount(0)
    }
    const permission = page.getByRole('button', { name: /访问模式/ })
    await permission.click()
    const full = page.getByRole('menuitem', { name: '完全权限', exact: true })
    await expect(full.getByText('完全权限')).toHaveCSS('color', 'rgb(182, 62, 32)')
    await full.click()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '启用完全权限', exact: true }).click()
    await expect(permission).toContainText('完全权限')
    await expect(permission).toHaveCSS('color', 'rgb(182, 62, 32)')
  } finally {
    await page.close()
    await host.dispose()
  }
})
