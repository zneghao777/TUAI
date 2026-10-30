import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { SessionId } from '../../../packages/core/session/lib/index.js'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pdfFixture } from '../../../packages/client/ui-sidebar-documentpreview/tests/pdf-fixture'

const editor = (page) => page.locator('[contenteditable="true"][role="textbox"]')
const current = (page) => page.locator('[data-session-id][aria-current="page"]')
async function send(page, text) {
  await editor(page).fill(text)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
}

test('TZ-065/066 original slash catalog, IME, commands, permission confirmation and export', async ({
  page,
}) => {
  const host = await fixtureHost({ composerControls: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    const id = await current(page).getAttribute('data-session-id')
    const agent = host.runtime.ctx.agents.get(SessionId(id!))
    await editor(page).fill('/')
    for (const name of ['file', 'compact', 'permission', 'model'])
      await expect(page.getByText(name, { exact: true })).toBeVisible()
    for (const name of ['goal', 'plan', 'feedback', 'export'])
      await expect(page.getByText(name, { exact: true })).toHaveCount(0)
    const fileOption = page.locator('[data-command-file]')
    await expect(fileOption).toBeVisible()
    expect(await fileOption.evaluate((element) => getComputedStyle(element).justifyContent)).toBe(
      'flex-start',
    )
    await editor(page).fill('/goal')
    await expect(page.getByText('goal', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await editor(page).fill('中文输入')
    await editor(page).dispatchEvent('compositionstart')
    await editor(page).dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
    expect(host.model.calls).toHaveLength(0)
    await editor(page).dispatchEvent('compositionend', { data: '中文输入' })
    await send(page, '/plan')
    await expect
      .poll(
        () =>
          agent.session
            .snapshotEvents()
            .filter((e) => e.type === 'plan/mode')
            .at(-1)?.data.active,
      )
      .toBe(true)
    await send(page, '/plan off')
    await expect
      .poll(
        () =>
          agent.session
            .snapshotEvents()
            .filter((e) => e.type === 'plan/mode')
            .at(-1)?.data.active,
      )
      .toBe(false)
    await send(page, '/permission')
    await page.getByRole('option', { name: /仅可查看/ }).click()
    await expect(page.getByRole('button', { name: '访问模式，当前：仅可查看' })).toBeVisible()
    expect(host.runtime.ctx.permissionPresets.current(agent.session)).toBe('readonly')
    await page.getByRole('button', { name: /访问模式/ }).click()
    await page.getByRole('menuitem', { name: '完全权限', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(host.runtime.ctx.permissionPresets.current(agent.session)).toBe('readonly')
    await page.getByRole('dialog').getByRole('checkbox').check()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '启用完全权限', exact: true })
      .click()
    await expect
      .poll(() => host.runtime.ctx.permissionPresets.current(agent.session))
      .toBe('full-access')
    await send(page, '/feedback 原组件交互验收')
    await expect
      .poll(() => agent.session.snapshotEvents().filter((e) => e.type === 'feedback/record').length)
      .toBe(1)
    const download = page.waitForEvent('download')
    await send(page, '/export')
    const zip = await download
    expect(zip.suggestedFilename()).toMatch(/\.zip$/)
    await send(page, '/compact')
    await expect
      .poll(
        () =>
          agent.session
            .snapshotEvents()
            .filter((e) => e.type === 'command/done')
            .at(-1)?.data.kind,
      )
      .toBe('success')
    await page.screenshot({ path: 'reports/p2/066-commands.png' })
    expect(errors).toEqual([])
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('CHAT-SIMPLE drafts, references, rename, archive hiding and settings', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    const id = await current(page).getAttribute('data-session-id')
    await editor(page).fill('原编辑器草稿')
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
    await expect(editor(page)).toHaveText('')
    await page.locator(`[data-session-id="${id}"]`).click()
    await expect(editor(page)).toHaveText('原编辑器草稿')
    await page.reload()
    await expect(editor(page)).toHaveText('原编辑器草稿')
    await editor(page).fill('@pack')
    await expect(page.getByText('package.json', { exact: true }).first()).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(editor(page)).toContainText('package.json')
    await send(page, '重命名和归档验收')
    await expect(
      page.getByText('已通过真实 Host 接收：重命名和归档验收。', { exact: true }),
    ).toBeVisible()
    await current(page).hover()
    await current(page)
      .getByRole('button', { name: /^会话.*的操作/ })
      .click()
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox').fill('DSH 会话树')
    await page.getByRole('dialog').getByRole('button', { name: '重命名', exact: true }).click()
    await expect(current(page)).toContainText('DSH 会话树')
    await current(page).hover()
    await current(page)
      .getByRole('button', { name: /^会话.*的操作/ })
      .click()
    await page.getByRole('menuitem', { name: '归档会话', exact: true }).click()
    await expect(page.locator(`[data-session-id="${id}"]`)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '视图选项' })).toHaveCount(0)
    await page.reload()
    await expect(page.locator(`[data-session-id="${id}"]`)).toHaveCount(0)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await expect(page.getByText('选择新会话的默认权限模式', { exact: false })).toBeVisible()
    await page.screenshot({ path: 'reports/p2/068-workspace-settings.png' })
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('TZ-069 original files, safe HTML and text preview through authenticated WorkspaceFiles', async ({
  page,
}) => {
  const host = await fixtureHost()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    const id = await current(page).getAttribute('data-session-id')
    const session = host.runtime.ctx.sessions.get(SessionId(id!))
    await writeFile(
      join(session.header.cwd, 'preview.html'),
      '<h1>预览内容</h1><script>parent.__untrustedExecuted=true</script><img src="https://example.invalid/tracker">',
    )
    await writeFile(join(session.header.cwd, 'notes.txt'), '文件预览与会话目录隔离验收')
    await mkdir(join(session.header.cwd, 'nested'))
    await writeFile(join(session.header.cwd, 'nested', 'child.txt'), '子目录文件')
    await writeFile(join(session.header.cwd, 'preview.pdf'), pdfFixture())
    await copyFile(
      'apps/web/tests/fixtures/office/preview.xls',
      join(session.header.cwd, 'preview.xls'),
    )
    await page.getByRole('button', { name: '打开右侧边栏' }).click()
    await page.getByRole('button', { name: /工作区文件/ }).click()
    const filesTabTitle = page.getByRole('tab', { name: '工作区文件 关闭', exact: true }).locator('[data-dockkit-tab-title]')
    await expect(filesTabTitle).not.toHaveAttribute('data-dockkit-tab-clipped', '')
    await expect(page.getByRole('button', { name: '会话产物' })).toHaveCount(0)
    const folder = page.getByRole('button', { name: 'nested', exact: true })
    await expect(folder).toHaveAttribute('aria-expanded', 'false')
    await folder.click()
    await expect(folder).toHaveAttribute('aria-expanded', 'true')
    const child = page.getByRole('button', { name: 'child.txt', exact: true })
    await expect(child).toBeVisible()
    expect(await folder.evaluate((node) => getComputedStyle(node).justifyContent)).toBe(
      'flex-start',
    )
    const folderBox = await folder.boundingBox()
    const childBox = await child.boundingBox()
    expect(childBox!.x).toBeGreaterThan(folderBox!.x)
    await page.screenshot({ path: 'reports/p2/tz084-tree-desktop.png' })
    await page.setViewportSize({ width: 390, height: 850 })
    await expect(child).toBeVisible()
    await page.screenshot({ path: 'reports/p2/tz084-tree-narrow.png' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '青绿', exact: true }).click()
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-ds-dark-theme', '')
    await expect(child).toBeVisible()
    await page.screenshot({ path: 'reports/p2/tz084-tree-dark.png' })
    await expect(page.getByText('notes.txt', { exact: true })).toBeVisible()
    await page.getByText('notes.txt', { exact: true }).click()
    await expect(page.getByText('文件预览与会话目录隔离验收', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '工作区文件 关闭', exact: true }).click()
    await page.getByText('preview.html', { exact: true }).click()
    await expect(
      page.frameLocator('[data-html-preview]').getByRole('heading', { name: '预览内容' }),
    ).toBeVisible()
    expect(await page.evaluate(() => Reflect.get(window, '__untrustedExecuted'))).toBeUndefined()
    expect(await page.locator('[data-html-preview]').getAttribute('sandbox')).toBe('')
    await page.screenshot({ path: 'reports/p2/069-file-preview.png' })
    await page.getByRole('tab', { name: '工作区文件 关闭', exact: true }).click()
    await page.getByText('preview.pdf', { exact: true }).click()
    await expect(page.locator('[data-pdf-text]').first()).toContainText('Selectable PDF text')
    await expect(page.locator('[data-pdf-page="1"] canvas')).toBeVisible()
    await expect(page.locator('[data-pdf-preview] [role=alert]')).toHaveCount(0)
    await page.screenshot({ path: 'reports/p2/069-pdf-preview.png' })
    await page.getByRole('tab', { name: '工作区文件 关闭', exact: true }).click()
    await page.getByText('preview.xls', { exact: true }).click()
    await expect(page.locator('[data-excel-preview] canvas').first()).toBeVisible()
    await page.screenshot({ path: 'reports/p2/069-excel-preview.png' })
    // FortuneSheet announces the selected cell through its accessibility alert region.
    await expect(page.locator('[data-excel-preview] [role=alert]').first()).toContainText(
      'Office preview 中文文档',
    )
    expect(errors).toEqual([])
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('TZ-066/067 original goal actions and plan review use real Host projections', async ({
  page,
}) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await expect(editor(page)).toBeVisible()
    const id = await current(page).getAttribute('data-session-id')
    const agent = host.runtime.ctx.agents.get(SessionId(id!))
    host.model.holdGoalRounds = true
    await send(page, '/goal 验证目标生命周期')
    await expect.poll(() => host.runtime.ctx.goals.get(agent)?.objective).toBe('验证目标生命周期')
    await expect(page.getByRole('button', { name: '编辑目标', exact: true })).toBeVisible()
    await send(page, '/goal pause')
    await expect.poll(() => host.runtime.ctx.goals.get(agent)?.phase).toBe('paused')
    host.model.holdGoalRounds = false
    await page.getByRole('button', { name: '编辑目标', exact: true }).click()
    await page.getByRole('textbox', { name: '目标内容', exact: true }).fill('修改后的验收目标')
    await page.getByRole('button', { name: '保存目标', exact: true }).click()
    await expect.poll(() => host.runtime.ctx.goals.get(agent)?.objective).toBe('修改后的验收目标')
    await send(page, '/goal clear')
    await expect.poll(() => host.runtime.ctx.goals.get(agent)).toBeUndefined()
    await send(page, '/plan')
    await expect
      .poll(
        () =>
          agent.session
            .snapshotEvents()
            .filter((e) => e.type === 'plan/mode')
            .at(-1)?.data.active,
      )
      .toBe(true)
    await send(page, 'P2 规划审阅')
    await expect(
      page.locator('[data-plan-review-key]').getByText('计划待审', { exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: 'reports/p2/067-plan-review.png' })
    await page.getByRole('button', { name: '同意执行', exact: true }).click()
    await expect(page.getByText('规划审阅已完成。', { exact: true })).toBeVisible()
    expect(
      agent.session
        .snapshotEvents()
        .filter((e) => e.type === 'plan/mode')
        .at(-1)?.data.active,
    ).toBe(false)
  } finally {
    await page.close()
    await host.dispose()
  }
})
