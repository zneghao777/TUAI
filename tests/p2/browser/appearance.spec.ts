import { test, expect } from '@playwright/test'
import { readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureHost } from '../fixture-host.mjs'

const editor = (page) => page.locator('[contenteditable="true"][role="textbox"]')
async function openAppearance(page) {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '对话显示', exact: true }).click()
  await expect(page.getByRole('button', { name: '青绿', exact: true })).toBeEnabled()
  await expect(page.locator('.tz-settings-backdrop')).toHaveCSS('opacity', '1')
}

test('TZ-077 dawn and forest share durable settings, keyboard selection and readable surfaces', async ({
  page,
}) => {
  const host = await fixtureHost({ composerControls: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    await editor(page).fill('主题切换后保留的草稿')
    await openAppearance(page)
    await page.getByRole('button', { name: '青绿', exact: true }).click()
    await expect(page.getByRole('button', { name: '青绿', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-ds-dark-theme', '')
    const dawn = page.getByRole('button', { name: '晨曦', exact: true })
    await dawn.focus()
    await page.keyboard.press('Space')
    await expect(dawn).toHaveAttribute('aria-pressed', 'true')
    await expect(dawn).toBeEnabled()
    await expect(dawn).toHaveCSS('background-color', 'rgb(234, 243, 255)')
    await expect(page.locator('body')).toHaveAttribute('data-tz-palette', 'dawn')
    await expect(page.locator('body')).not.toHaveAttribute('data-ds-dark-theme', '')
    await expect(page.getByRole('button', { name: '深色', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '浅色', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 248, 252)')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      'rgb(245, 248, 252)',
    )
    const stored = JSON.parse(
      await readFile(
        join(host.runtime.ctx.tianzhiaiHost.paths.config, 'ui-theme-preferences.json'),
        'utf8',
      ),
    )
    expect(stored.user).toMatchObject({ palette: 'dawn', preference: 'light' })
    await expect(page.locator('[data-slot="sidebar"] > :first-child')).toHaveCSS(
      'background-image',
      /linear-gradient/,
    )
    await page.mouse.move(-1, -1)
    await page.screenshot({ path: 'reports/p2/077-dawn-settings.png' })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(editor(page)).toHaveText('主题切换后保留的草稿')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(
      page.getByText('已通过真实 Host 接收：主题切换后保留的草稿。', { exact: true }),
    ).toBeVisible()
    await page.mouse.move(-1, -1)
    await page.screenshot({ path: 'reports/p2/077-dawn-chat.png' })
    await page.reload()
    await expect(editor(page)).toBeVisible()
    await expect(page.locator('body')).toHaveAttribute('data-tz-palette', 'dawn')
    await openAppearance(page)
    await expect(dawn).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '青绿', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-tz-palette', 'forest')
    await page.getByRole('button', { name: '跟随系统', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-ds-theme-source', 'system')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('body')).toHaveAttribute('data-ds-dark-theme', '')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('body')).not.toHaveAttribute('data-ds-dark-theme', '')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 246, 243)')
    await page.setViewportSize({ width: 390, height: 844 })
    await dawn.click()
    await expect(dawn).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeVisible()
    await expect(dawn).toBeEnabled()
    await page.mouse.move(-1, -1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'reports/p2/077-dawn-narrow.png' })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.tz-cursor-glow')).toHaveCSS('display', 'none')
    expect(errors).toEqual([])
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('TZ-077 failed durable writes preserve selection and can be retried', async ({ page }) => {
  const host = await fixtureHost()
  const config = host.runtime.ctx.tianzhiaiHost.paths.config
  const moved = `${config}-appearance-test`
  let unavailable = false
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    await openAppearance(page)
    await rename(config, moved)
    unavailable = true
    await page.getByRole('button', { name: '晨曦', exact: true }).click()
    await expect(page.locator('.tz-appearance-error')).toBeVisible()
    await expect(page.getByRole('button', { name: '纯白', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('body')).toHaveAttribute('data-tz-palette', 'white')
    await page.getByRole('button', { name: '纯白', exact: true }).click()
    await expect(page.locator('.tz-appearance-error')).toHaveCount(0)
    await rename(moved, config)
    unavailable = false
    await page.getByRole('button', { name: '晨曦', exact: true }).click()
    await expect(page.getByRole('button', { name: '晨曦', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('.tz-appearance-error')).toHaveCount(0)
  } finally {
    if (unavailable) await rename(moved, config)
    await page.close()
    await host.dispose()
  }
})

for (const palette of ['dawn', 'white'] as const) {
  test(`TZ-082 ${palette} boots before modules and survives reconnect, long text, code, tools and popovers`, async ({
    page,
    context,
  }) => {
    const host = await fixtureHost({ composerControls: true })
    try {
      await host.runtime.ctx.settingsController.update('ui-theme', {
        palette,
        preference: 'light',
      })
      await host.runtime.ctx.settingsController.update('ui-chat', { transcriptView: 'verbose' })
      await page.goto(host.login)
      await expect(editor(page)).toBeVisible()
      const boot = await context.newPage()
      try {
        await boot.route('**/assets/*.js', (route) => route.abort())
        await boot.goto(host.base)
        await expect(boot.locator('body')).toHaveAttribute('data-tz-palette', palette)
        await expect(boot.locator('body')).not.toHaveAttribute('data-tz-appearance-ready', '')
        await expect(boot.locator('body')).toHaveCSS(
          'background-color',
          palette === 'white' ? 'rgb(255, 255, 255)' : 'rgb(245, 248, 252)',
        )
        await expect(boot.locator('html')).toHaveCSS('color-scheme', 'light')
      } finally {
        await boot.close()
      }
      await context.setOffline(true)
      await expect(page.locator('.tz-connection')).toBeVisible()
      await context.setOffline(false)
      await page.getByRole('button', { name: '重新连接', exact: true }).click()
      await expect(page.locator('.tz-connection')).toHaveCount(0)
      await expect(page.locator('body')).toHaveAttribute('data-tz-palette', palette)
      await editor(page).fill(
        `${'长对话阅读核验。'.repeat(240)}\n\n\`\`\`typescript\nconst result = 42;\n\`\`\``,
      )
      await page.getByRole('button', { name: '发送消息', exact: true }).click()
      const code = page.locator('[data-chat-flow-kind=assistant-step] pre.shiki').last()
      await expect(code).toBeVisible()
      await expect(
        page.locator('[data-chat-flow-kind=assistant-step] .md-code-block').last(),
      ).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(page.getByRole('button', { name: /^选择模型/ })).toBeEnabled()
      await page.getByRole('button', { name: /^选择模型/ }).click()
      const popover = page.getByRole('dialog', { name: '模型与推理强度' })
      await expect(popover).toBeVisible()
      await expect(popover).toHaveCSS(
        'color',
        palette === 'white' ? 'rgb(36, 39, 46)' : 'rgb(30, 41, 59)',
      )
      await page.keyboard.press('Escape')
      await editor(page).fill('晨曦读取工具')
      await page.getByRole('button', { name: '发送消息', exact: true }).click()
      await expect(page.getByText('工具回执已收到。', { exact: true })).toBeVisible()
      const tool = page.locator('[data-tool=read]')
      await tool.locator('[data-disclosure-row]').click()
      await expect(tool.locator('[data-code-wrap]')).toBeVisible()
      if (palette === 'white') {
        await page.mouse.move(-1, -1)
        await page.screenshot({ path: 'reports/p2/082-white-reading.png' })
      }
      await page.setViewportSize({ width: 320, height: 844 })
      await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    } finally {
      await context.setOffline(false)
      await page.close()
      await host.dispose()
    }
  })
}

test('TZ-082 white defaults, local glass, atomic selection, refresh and narrow keyboard settings', async ({
  page,
}) => {
  const host = await fixtureHost({ composerControls: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    await expect(page.locator('body')).toHaveAttribute('data-tz-palette', 'white')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    const sidebar = page.locator('[data-slot="sidebar"] > :first-child')
    const composer = page.locator('[data-composer-card]')
    await expect(sidebar).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.8)')
    await expect(sidebar).toHaveCSS('backdrop-filter', 'blur(20px)')
    await expect(composer).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.9)')
    await expect(composer).toHaveCSS('backdrop-filter', 'blur(20px)')
    await editor(page).fill('纯白切换后保留的草稿')
    await openAppearance(page)
    const white = page.getByRole('button', { name: '纯白', exact: true })
    await expect(white).toHaveAttribute('aria-pressed', 'true')
    await expect(white).toHaveCSS('background-color', 'rgb(238, 240, 243)')
    await expect(page.getByRole('dialog', { name: '设置', exact: true })).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    )
    await expect(page.getByRole('button', { name: '深色', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toBeDisabled()
    await page.mouse.move(-1, -1)
    await page.screenshot({ path: 'reports/p2/082-white-settings.png' })
    await page.getByRole('button', { name: '青绿', exact: true }).click()
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-ds-dark-theme', '')
    const before = (await host.runtime.ctx.settingsController.describe()).namespaces.find(
      (s) => s.ns === 'ui-theme',
    )
    await white.focus()
    await page.keyboard.press('Space')
    await expect(white).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('body')).not.toHaveAttribute('data-ds-dark-theme', '')
    await expect(white).toBeEnabled()
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      'rgb(255, 255, 255)',
    )
    const stored = JSON.parse(
      await readFile(
        join(host.runtime.ctx.tianzhiaiHost.paths.config, 'ui-theme-preferences.json'),
        'utf8',
      ),
    )
    expect(stored.revision).toBe(before.revision + 1)
    expect(stored.user).toMatchObject({ palette: 'white', preference: 'light' })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(editor(page)).toHaveText('纯白切换后保留的草稿')
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toHaveCSS(
      'background-color',
      'rgb(39, 43, 50)',
    )
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(
      page.getByText('已通过真实 Host 接收：纯白切换后保留的草稿。', { exact: true }),
    ).toBeVisible()
    await page.mouse.move(-1, -1)
    await page.screenshot({ path: 'reports/p2/082-white-chat.png' })
    await page.reload()
    await expect(editor(page)).toBeVisible()
    await expect(page.locator('body')).toHaveAttribute('data-tz-palette', 'white')
    await page.setViewportSize({ width: 390, height: 844 })
    await openAppearance(page)
    await expect(white).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.mouse.move(-1, -1)
    await page.screenshot({ path: 'reports/p2/082-white-narrow.png' })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.tz-cursor-glow')).toHaveCSS('display', 'none')
    expect(errors).toEqual([])
  } finally {
    await page.close()
    await host.dispose()
  }
})
