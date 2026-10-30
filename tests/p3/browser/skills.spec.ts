import { test, expect } from '@playwright/test'
import { fixtureHost } from '../../p2/fixture-host.mjs'

const content =
  '---\nname: document-review\ndescription: 核对文档结构与内容，整理待修改项。\n---\n# 文档检查\n\n先阅读文档，再核对结构、事实和引用。\n\n## 输出\n\n列出问题及对应修改建议。'
test('skill import, activation, new conversation, versions, rollback and retained other navigation', async ({
  page,
}) => {
  const host = await fixtureHost()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable=true][role=textbox]')
    await expect(input).toBeVisible()
    await page.getByRole('button', { name: '技能', exact: true }).click()
    await expect(page.getByRole('heading', { name: '技能', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '导入技能', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '导入技能' })
    await dialog
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from(content) })
    await dialog.getByRole('button', { name: '导入为草稿' }).click()
    await expect(page.getByRole('heading', { name: 'document-review' })).toBeVisible()
    await expect(page.getByRole('button', { name: '启用此版本' })).toBeDisabled()
    await page.getByRole('button', { name: '检查', exact: true }).click()
    await expect(page.getByText('结构检查通过；业务效果尚未验证')).toBeVisible()
    await page.getByRole('button', { name: '启用此版本' }).click()
    await page.getByRole('button', { name: '确认切换' }).click()
    await expect(page.getByRole('button', { name: '停用', exact: true })).toBeVisible()
    const card = page.locator('.tz-skills-card').filter({ hasText: 'document-review' })
    const cardBounds = await card.boundingBox()
    const descriptionBounds = await card.locator('p').boundingBox()
    expect(descriptionBounds!.x + descriptionBounds!.width).toBeLessThanOrEqual(
      cardBounds!.x + cardBounds!.width,
    )
    await page.screenshot({ path: 'reports/p3/skills-desktop.png' })
    await page.getByRole('button', { name: '在新聊天中使用' }).click()
    await expect(input).toHaveText('/document-review ')
    await input.fill('/document-review 请检查这份文档')
    await input.press('Enter')
    await expect(
      page.getByText('已通过真实 Host 接收：/document-review 请检查这份文档。', { exact: true }),
    ).toBeVisible()
    expect(
      host.model.calls.some((options) =>
        options.messages.some((m) => m.source?.kind === 'skill-invocation'),
      ),
    ).toBe(true)
    await input.fill('/document')
    await expect(page.locator('[role=option]').filter({ hasText: 'document-review' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '技能', exact: true }).click()
    await page.locator('.tz-skills-card').filter({ hasText: 'document-review' }).click()
    await page.getByRole('button', { name: '加载记录', exact: true }).click()
    await expect(page.getByRole('button', { name: '查看聊天' }).first()).toBeVisible()
    await page.getByRole('button', { name: '查看聊天' }).first().click()
    await expect(
      page.getByText('已通过真实 Host 接收：/document-review 请检查这份文档。', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: '技能', exact: true }).click()
    await page.locator('.tz-skills-card').filter({ hasText: 'document-review' }).click()
    await page.getByRole('button', { name: '编辑新版本' }).click()
    await page
      .getByRole('textbox', { name: 'SKILL.md 内容' })
      .fill(content + '\n\n记录每处引用的来源。')
    await page.getByRole('button', { name: '保存新版本' }).click()
    await expect(page.getByText('正在查看 v2', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '检查', exact: true }).click()
    await page.getByRole('button', { name: '启用此版本' }).click()
    await page.getByRole('button', { name: '确认切换' }).click()
    await page.getByRole('button', { name: /v1/ }).click()
    await page.getByRole('button', { name: '回滚到此版本' }).click()
    await page.getByRole('button', { name: '确认切换' }).click()
    await expect(page.getByText('生效版本 v1', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: '停用', exact: true }).click()
    await expect(page.getByRole('button', { name: '在新聊天中使用' })).toBeDisabled()
    await page.reload()
    await page.getByRole('button', { name: '技能', exact: true }).click()
    await expect(
      page.locator('.tz-skills-card').filter({ hasText: 'document-review' }),
    ).toBeVisible()
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.getByRole('heading', { name: '文件', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '我的BOT', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: '该功能暂未开发' })).toBeVisible()
    expect(errors).toEqual([])
  } catch (error) {
    console.error(error)
    throw error
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('skills inherit existing themes, narrow layout and modal keyboard focus', async ({ page }) => {
  const host = await fixtureHost()
  try {
    const store = host.runtime.ctx.skillLibrary.store
    store.import({
      source: '本地验收',
      files: [{ path: 'SKILL.md', data: Buffer.from(content).toString('base64') }],
    })
    await page.goto(host.login)
    await expect(page.locator('[contenteditable=true][role=textbox]')).toBeVisible()
    for (const [label, key] of [
      ['青绿', 'forest'],
      ['晨曦', 'dawn'],
      ['纯白', 'white'],
    ]) {
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.getByRole('tab', { name: '通用', exact: true }).click()
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await page.getByRole('button', { name: '技能', exact: true }).click()
      await page.locator('.tz-skills-card').filter({ hasText: 'document-review' }).click()
      await expect(page.getByRole('heading', { name: 'document-review' })).toBeVisible()
      await page.screenshot({ path: `reports/p3/skills-${key}.png` })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: '返回列表' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'reports/p3/skills-narrow-detail.png' })
    await page.getByRole('button', { name: '返回列表' }).click()
    await expect(page.getByRole('searchbox', { name: '搜索技能' })).toBeVisible()
    await page.getByRole('button', { name: '导入技能', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '导入技能' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '导入技能' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '导入技能', exact: true })).toBeFocused()
  } catch (error) {
    console.error(error)
    throw error
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('skill management and package preview follow English and Italian settings', async ({
  page,
}) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '语言: 中文' }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await page
      .getByRole('dialog', { name: 'Settings' })
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    await page.getByRole('button', { name: 'Skills', exact: true }).click()
    await page.getByRole('button', { name: 'Import skill', exact: true }).click()
    const english = page.getByRole('dialog', { name: 'Import skill' })
    await english
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from(content) })
    await expect(english.getByText('1 file')).toBeVisible()
    await expect(english.getByRole('button', { name: 'Import as draft' })).toBeEnabled()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'General', exact: true }).click()
    await page.getByRole('button', { name: 'Language: English' }).click()
    await page.getByRole('menuitem', { name: 'Italiano' }).click()
    await page
      .getByRole('dialog', { name: 'Impostazioni' })
      .getByRole('button', { name: 'Chiudi', exact: true })
      .click()
    await page.getByRole('button', { name: 'Competenze', exact: true }).click()
    await page.getByRole('button', { name: 'Importa competenza', exact: true }).click()
    const italian = page.getByRole('dialog', { name: 'Importa competenza' })
    await italian
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from(content) })
    await expect(italian.getByText('1 file')).toBeVisible()
    await expect(italian.getByRole('button', { name: 'Importa come bozza' })).toBeEnabled()
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('same-name package preview, immutable update and file tree use real Host data', async ({
  page,
}) => {
  const host = await fixtureHost()
  const store = host.runtime.ctx.skillLibrary.store
  try {
    let item = store.import({
      source: '本地目录',
      files: [
        { path: 'SKILL.md', data: Buffer.from(content).toString('base64') },
        { path: 'scripts/helper.py', data: Buffer.from('print("version one")').toString('base64') },
      ],
    })
    item = store.check({ id: item.id, revision: item.revision, version: 1 }, [])
    store.activate({ id: item.id, revision: item.revision, version: 1 }, [])
    await page.goto(host.login)
    await expect(page.locator('[contenteditable=true][role=textbox]')).toBeVisible()
    await page.getByRole('button', { name: '技能', exact: true }).click()
    await page.locator('.tz-skills-card').filter({ hasText: 'document-review' }).click()
    await page
      .locator('.tz-skills-detail')
      .getByRole('button', { name: '文件', exact: true })
      .click()
    await page.getByRole('button', { name: 'helper.py' }).click()
    await expect(page.getByText('print("version one")')).toBeVisible()
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载文件' }).click()
    expect((await downloadEvent).suggestedFilename()).toBe('helper.py')
    await page.getByRole('button', { name: '展开查看' }).click()
    await expect(
      page.getByRole('dialog', { name: '技能文件' }).getByText('print("version one")'),
    ).toBeVisible()
    await page.getByRole('button', { name: '关闭文件查看' }).click()
    await page.getByRole('button', { name: '版本', exact: true }).click()
    await page.getByRole('button', { name: '导入新版本' }).click()
    const modal = page.getByRole('dialog', { name: '导入新版本' })
    await modal
      .locator('input[type=file]')
      .first()
      .setInputFiles({
        name: 'SKILL.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from(content + '\n\n第二版本'),
      })
    await expect(modal.getByText('同名技能已存在')).toBeVisible()
    await expect(modal.getByText('scripts/helper.py')).toBeVisible()
    await expect(modal.getByText('删除', { exact: true })).toBeVisible()
    await modal.getByRole('button', { name: '创建新版本草稿' }).click()
    await expect(page.getByText('正在查看 v2', { exact: true })).toBeVisible()
    await expect(page.getByText('生效版本 v1', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: '查看差异' }).click()
    await expect(page.locator('.tz-skill-diff').getByText('scripts/helper.py')).toBeVisible()
    await page.getByRole('button', { name: '检查', exact: true }).click()
    await page.getByRole('button', { name: '启用此版本' }).click()
    await page.getByRole('button', { name: '确认切换' }).click()
    await expect(page.getByText('生效版本 v2', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: /v1/ }).click()
    await page.getByRole('button', { name: '回滚到此版本' }).click()
    await page.getByRole('button', { name: '确认切换' }).click()
    await expect(page.getByText('生效版本 v1', { exact: true }).first()).toBeVisible()
    expect(store.package(item.id, 1).files.some((file) => file.path === 'scripts/helper.py')).toBe(
      true,
    )
    expect(store.package(item.id, 2).files.some((file) => file.path === 'scripts/helper.py')).toBe(
      false,
    )
  } finally {
    await page.close()
    await host.dispose()
  }
})
