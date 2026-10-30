import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'

test('设置分类共用窗口、保留草稿，子菜单先处理 Escape', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toBeVisible()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await expect(dialog).toHaveCSS('opacity', '1')
    const original = await dialog.elementHandle()
    const bounds = await dialog.boundingBox()
    const categories = page.getByRole('navigation', { name: '设置分类' })
    await dialog.getByRole('button', { name: '添加模型提供商' }).click()
    await dialog.getByRole('button', { name: /提供商类型/ }).click()
    await page.getByRole('option', { name: '自定义 API' }).click()
    await dialog.getByRole('textbox', { name: '显示名称' }).fill('尚未保存的模型配置')
    await categories.getByRole('tab', { name: '通用', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: '通用' })).toBeVisible()
    expect(await original!.evaluate((element) => element.isConnected)).toBe(true)
    expect(await dialog.boundingBox()).toEqual(bounds)
    await dialog.getByRole('button', { name: '标准', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '详细', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await categories.getByRole('tab', { name: '模型', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: '显示名称' })).toHaveValue(
      '尚未保存的模型配置',
    )
    expect(await dialog.boundingBox()).toEqual(bounds)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused()
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('会话操作支持键盘，单会话无重复分组，长标题保持布局', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('工作区标题验收')
    await input.press('Enter')
    await expect(
      page.getByText('已通过真实 Host 接收：工作区标题验收。', { exact: true }),
    ).toBeVisible()
    const session = page.locator('[data-session-id][aria-current=page]')
    await expect(session).toBeVisible()
    const history = page.getByRole('navigation', { name: '聊天记录' })
    await expect(history.locator('summary')).toHaveCount(0)
    const row = session
    expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    )
    await session.getByRole('button').first().focus()
    await page.keyboard.press('Tab')
    await expect(row.getByRole('button', { name: /^归档会话/ })).toBeFocused()
    await page.keyboard.press('Tab')
    const trigger = row.getByRole('button', { name: /^会话.*的操作/ })
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveCSS('opacity', '1')
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
    const title = '整理旅行资料与工作记录，并生成一份可以持续维护的详细计划'
    await page.getByRole('dialog').getByRole('textbox').fill(title)
    await page.getByRole('dialog').getByRole('button', { name: '重命名', exact: true }).click()
    await expect(session).toContainText(title)
    await expect(page.locator('header').getByText(title, { exact: true })).toBeVisible()
    for (const width of [1440, 820, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await expect
        .poll(() => page.locator('header').evaluate((el) => el.scrollWidth <= el.clientWidth))
        .toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('触摸端菜单可发现，设置内容独立滚动且关闭恢复焦点', async ({ browser }) => {
  const host = await fixtureHost()
  const context = await browser.newContext({
    viewport: { width: 390, height: 680 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  const focusWarnings: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('Blocked aria-hidden')) focusWarnings.push(message.text())
  })
  try {
    await page.goto(host.login)
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toBeVisible()
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('触屏设置验收')
    await input.press('Enter')
    await expect(
      page.getByText('已通过真实 Host 接收：触屏设置验收。', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: '打开侧边栏' }).tap()
    const menu = page.getByRole('button', { name: /^会话.*的操作/ }).first()
    await expect(menu).toHaveCSS('opacity', '1')
    expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(24)
    await menu.tap()
    await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '设置', exact: true }).tap()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    const close = dialog.getByRole('button', { name: '关闭', exact: true })
    await expect(dialog).toHaveCSS('opacity', '1')
    const closeBounds = await close.boundingBox()
    await dialog.getByRole('button', { name: '添加模型提供商' }).tap()
    await dialog.getByRole('button', { name: /提供商类型/ }).tap()
    await page.getByRole('option', { name: '自定义 API' }).tap()
    for (let i = 0; i < 3; i++)
      await dialog.getByRole('button', { name: '添加模型', exact: true }).tap()
    await dialog.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded()
    const panel = dialog.getByRole('tabpanel', { name: '模型', exact: true })
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await close.boundingBox()).toEqual(closeBounds)
    const categories = page.getByRole('navigation', { name: '设置分类' })
    await categories.getByRole('tab', { name: '通用', exact: true }).tap()
    await expect(dialog.getByRole('heading', { name: '通用' })).toBeVisible()
    expect(await close.boundingBox()).toEqual(closeBounds)
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await close.tap()
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused()
    expect(focusWarnings).toEqual([])
  } finally {
    await context.close()
    await host.dispose()
  }
})
