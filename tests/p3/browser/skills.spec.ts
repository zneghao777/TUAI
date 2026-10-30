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
    await expect(page.getByRole('button', { name: '停用', exact: true })).toBeVisible()
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
    await page.getByRole('button', { name: /document-review 已启用/ }).click()
    await page.getByRole('button', { name: '编辑新版本' }).click()
    await page
      .getByRole('textbox', { name: 'SKILL.md 内容' })
      .fill(content + '\n\n记录每处引用的来源。')
    await page.getByRole('button', { name: '保存新版本' }).click()
    await expect(page.getByRole('combobox', { name: '查看版本' })).toHaveValue('2')
    await page.getByRole('button', { name: '检查', exact: true }).click()
    await page.getByRole('button', { name: '启用此版本' }).click()
    await page.getByRole('combobox', { name: '查看版本' }).selectOption('1')
    await page.getByRole('button', { name: '回滚到此版本' }).click()
    await expect(page.getByText('生效版本 v1', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '停用', exact: true }).click()
    await expect(page.getByRole('button', { name: '在新聊天中使用' })).toBeDisabled()
    await page.reload()
    await page.getByRole('button', { name: '技能', exact: true }).click()
    await expect(page.getByRole('button', { name: /document-review 已停用/ })).toBeVisible()
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
      await page.getByRole('button', { name: /document-review 草稿/ }).click()
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
