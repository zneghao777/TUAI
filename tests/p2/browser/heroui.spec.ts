import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { fixtureHost } from '../fixture-host.mjs'
const editor = (page) => page.locator('[contenteditable="true"][role="textbox"]')
const modelTrigger = (page) => page.getByRole('button', { name: /^选择模型/ })

test('HeroUI 紧凑模型列表、默认推理与会话隔离', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await page.goto(host.login)
    await editor(page).fill('保留模型选择的会话')
    await editor(page).press('Enter')
    await expect(
      page.getByText('已通过真实 Host 接收：保留模型选择的会话。', { exact: true }),
    ).toBeVisible()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    await modelTrigger(page).click()
    const slider = page.getByRole('slider', { name: '推理强度' })
    await slider.press('End')
    await expect(modelTrigger(page)).toContainText('Max')
    await page.getByRole('button', { name: '恢复默认推理强度' }).click()
    await expect(modelTrigger(page)).toContainText('High')
    await expect(page.getByRole('button', { name: '恢复默认推理强度' })).toBeDisabled()
    await page.getByRole('button', { name: '切换模型', exact: true }).click()
    await expect(page.getByRole('searchbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '管理模型', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '无推理验收模型' }).press('Enter')
    await expect(modelTrigger(page)).toContainText('无推理验收模型')
    await expect(page.getByRole('slider')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
    await expect(modelTrigger(page)).toContainText('High')
    await page.locator(`[data-session-id="${id}"]`).click()
    await expect(modelTrigger(page)).toContainText('无推理验收模型')
    expect(errors).toEqual([])
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('HeroUI 设置真实保存、连接失败、密钥保留和独立删除确认', async ({ page }) => {
  const host = await fixtureHost()
  let succeed = false
  let release: (() => void) | undefined
  const server = createServer(async (_request, response) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    response.writeHead(succeed ? 200 : 401, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify(
        succeed
          ? { content: [{ type: 'text', text: 'OK' }] }
          : { error: { message: 'controlled refusal' } },
      ),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await page.goto(host.login)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.getByRole('button', { name: '添加模型提供商' }).click()
    await dialog.getByRole('button', { name: /提供商类型/ }).click()
    await page.getByRole('option', { name: '自定义 API' }).click()
    await dialog.getByRole('textbox', { name: '提供商标识' }).fill('hero-test')
    await dialog.getByRole('textbox', { name: '显示名称' }).fill('HeroUI 受控连接')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no test endpoint')
    await dialog.getByRole('textbox', { name: 'API 地址' }).fill(`http://127.0.0.1:${address.port}`)
    await dialog.getByRole('textbox', { name: 'API Key', exact: true }).fill('test-only-hero-key')
    await dialog.getByRole('textbox', { name: '模型 ID 1', exact: true }).fill('hero-model')
    await dialog.getByRole('textbox', { name: '模型名称 1', exact: true }).fill('Hero Model')
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect.poll(() => Boolean(release)).toBe(true)
    release!()
    release = undefined
    await expect(dialog.getByRole('status')).toContainText('认证失败')
    succeed = true
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click()
    await expect.poll(() => Boolean(release)).toBe(true)
    release!()
    release = undefined
    await expect(dialog.getByRole('status')).toContainText('成功')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog.getByText('HeroUI 受控连接', { exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const row = dialog.locator('[class*=providerRow]').filter({ hasText: 'HeroUI 受控连接' })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'API Key', exact: true })).toHaveValue('')
    await expect(dialog.getByRole('textbox', { name: 'API Key', exact: true })).toHaveAttribute(
      'type',
      'password',
    )
    await dialog.getByRole('button', { name: '返回列表' }).click()
    await row.getByRole('button', { name: '移除 HeroUI 受控连接' }).click()
    const confirmation = page.getByRole('alertdialog', { name: '移除模型提供商' })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '移除 HeroUI 受控连接' }).click()
    await confirmation.getByRole('button', { name: '确认移除' }).click()
    await expect(row).toHaveCount(0)
  } finally {
    release?.()
    await page.close()
    await host.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('鼠标柔光不拦截输入，失焦、减少动态效果与触屏停用，深浅色和窄屏', async ({
  page,
  browser,
}) => {
  const host = await fixtureHost({ composerControls: true })
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    const glow = page.locator('.tz-cursor-glow')
    await page.mouse.move(700, 480)
    await expect(glow).toHaveCSS('opacity', '1')
    await expect(glow).toHaveCSS('pointer-events', 'none')
    await editor(page).click()
    await page.keyboard.type('light does not capture input')
    await expect(editor(page)).toContainText('light does not capture input')
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(glow).toHaveCSS('opacity', '0')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.mouse.move(720, 500)
    await expect(glow).toHaveCSS('display', 'none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    for (const dark of [false, true]) {
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.getByRole('tab', { name: '对话显示', exact: true }).click()
      await page.getByRole('button', { name: dark ? '深色' : '浅色', exact: true }).click()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await expect
        .poll(() => page.locator('body').getAttribute('data-ds-dark-theme'))
        .toBe(dark ? '' : null)
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await modelTrigger(page).click()
        const panel = page.getByRole('dialog', { name: '模型与推理强度' })
        await expect(panel).toBeInViewport()
        expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({ path: `reports/p2/hero-${dark ? 'dark' : 'light'}-${width}.png` })
        await page.keyboard.press('Escape')
      }
    }
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    try {
      const touchPage = await touch.newPage()
      await touchPage.goto(host.login)
      await expect(editor(touchPage)).toBeVisible()
      await expect(touchPage.locator('.tz-cursor-glow')).toHaveCSS('display', 'none')
    } finally {
      await touch.close()
    }
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('模型目录无默认等级时保留提供商默认，滑杆提交非等距语义 ID', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  const resolve = host.model.resolveModel.bind(host.model)
  host.model.resolveModel = async (provider, model) => ({
    ...(await resolve(provider, model)),
    reasoning: {
      efforts: [
        { id: 'budget-64', name: '轻量' },
        { id: 'budget-8192', name: '深入' },
      ],
    },
  })
  try {
    await page.goto(host.login)
    await expect(modelTrigger(page)).toContainText('提供商默认')
    await modelTrigger(page).click()
    await page.getByRole('slider', { name: '推理强度' }).press('End')
    await expect(modelTrigger(page)).toContainText('深入')
    await page.keyboard.press('Escape')
    await editor(page).fill('使用目录定义的推理等级')
    await editor(page).press('Enter')
    await expect.poll(() => host.model.calls.at(-1)?.reasoningEffort).toBe('budget-8192')
    await expect(
      page.getByText('已通过真实 Host 接收：使用目录定义的推理等级。', { exact: true }),
    ).toBeVisible()
    await modelTrigger(page).click()
    await page.getByRole('button', { name: '恢复默认推理强度' }).click()
    await expect(modelTrigger(page)).toContainText('提供商默认')
    await page.keyboard.press('Escape')
    await editor(page).fill('恢复提供商默认')
    await editor(page).press('Enter')
    await expect.poll(() => host.model.calls.length).toBe(2)
    expect(host.model.calls.at(-1)?.reasoningEffort).toBeUndefined()
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('目录为空或提供商失败时显示真实状态并支持恢复', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  const list = host.model.listModels.bind(host.model)
  host.model.listModels = async () => []
  try {
    await page.goto(host.login)
    await modelTrigger(page).click()
    await expect(page.getByText('暂无可用模型', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '管理模型', exact: true })).toHaveCount(0)
    host.model.listModels = async () => {
      throw new Error('受控目录暂不可用')
    }
    await page.reload()
    await modelTrigger(page).click()
    await expect(page.getByRole('alert')).toContainText('受控目录暂不可用')
    host.model.listModels = list
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(page.getByRole('button', { name: '切换模型', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('推理滑杆连续拖动，松手吸附后才提交；键盘仍逐档切换', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const selected = () =>
      host.runtime.ctx.sessions.list().find((session) => String(session.id) === id)
    const selections = () =>
      selected()
        ?.snapshotEvents()
        .filter((event) => event.type === 'model/selection').length ?? 0
    const before = selections()
    await modelTrigger(page).click()
    const slider = page.getByRole('slider', { name: '推理强度' })
    const track = await page.locator('[data-slot="slider-track"]').boundingBox()
    if (!track) throw new Error('slider track missing')
    const y = track.y + track.height / 2
    await page.mouse.move(track.x + (track.width * 2) / 3, y)
    await page.mouse.down()
    await page.mouse.move(track.x + track.width * 0.47, y, { steps: 12 })
    const during = Number(await slider.inputValue())
    expect(during).toBeGreaterThan(1.1)
    expect(during).toBeLessThan(1.8)
    expect(Number.isInteger(during)).toBe(false)
    expect(selections()).toBe(before)
    await page.mouse.up()
    await expect(slider).toHaveValue('1')
    await expect(modelTrigger(page)).toContainText('Low')
    await expect.poll(selections).toBe(before + 1)
    await slider.press('ArrowRight')
    await expect(slider).toHaveValue('2')
    await expect(modelTrigger(page)).toContainText('High')
    await page.keyboard.press('Escape')
    await expect(modelTrigger(page)).toBeFocused()
  } finally {
    await page.close()
    await host.dispose()
  }
})
