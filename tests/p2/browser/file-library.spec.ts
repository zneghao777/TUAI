import { expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureHost } from '../fixture-host.mjs'
import { clientFor } from '../client.mjs'
import { startWebHost } from '../../../apps/cli/lib/web.js'

test('TZ-083 opens, previews and permanently deletes a generated document', async ({ page }) => {
  const host = await fixtureHost({ defaultPreset: 'full-access', fileLibrary: true })
  let reboot: Awaited<ReturnType<typeof startWebHost>> | undefined
  let resumed: Awaited<ReturnType<typeof clientFor>> | undefined
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('TZ083 创建测试文档')
    await input.press('Enter')
    await expect(page.getByText('TZ083 文件已生成。')).toBeVisible({ timeout: 20000 })
    const current = page.locator('[data-session-id][aria-current=page]')
    const id = await current.getAttribute('data-session-id')
    const session = host.runtime.ctx.sessions.list().find((item) => item.id === id)
    const path = join(session.header.cwd, '测试文档.md')
    expect(await readFile(path, 'utf8')).toContain('文件页验收内容')
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.getByRole('heading', { name: '文件', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '搜索文件' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '选择', exact: true })).toHaveClass(
      /tz-library-glass/,
    )
    const card = page.locator('.tz-library-card').filter({ hasText: '测试文档.md' })
    await expect(card).toBeVisible()
    await page.screenshot({ path: 'reports/p2/tz083-files-desktop.png' })
    await card.click()
    await expect(page.getByRole('dialog', { name: '预览 测试文档.md' })).toContainText(
      '文件页验收内容',
    )
    await page.getByRole('button', { name: '关闭预览' }).click()
    await page.getByRole('button', { name: '排序', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '标题' })).toBeVisible()
    await page.screenshot({ path: 'reports/p2/tz083-files-sort.png' })
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: '图片' }).click()
    const image = page.getByRole('button', { name: /测试图片\.png/ })
    await expect(image).toBeVisible()
    await image.click()
    const previewImage = page.getByRole('dialog', { name: '预览 测试图片.png' }).getByRole('img')
    await expect(previewImage).toBeVisible()
    await expect
      .poll(() => previewImage.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0)
    await page.getByRole('button', { name: '关闭预览' }).click()
    await page.getByRole('tab', { name: '文档' }).click()
    await page.getByRole('button', { name: '选择', exact: true }).click()
    await expect(page.getByRole('button', { name: '全选', exact: true })).toHaveClass(
      /tz-library-glass/,
    )
    await page.screenshot({ path: 'reports/p2/tz083-files-selection.png' })
    await card.click()
    await expect(page.getByRole('heading', { name: '已选 1 项' })).toBeVisible()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.getByRole('alertdialog', { name: '删除文件' })).toContainText('无法恢复')
    await page.getByRole('button', { name: '永久删除' }).click()
    await expect(card).toHaveCount(0)
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    await writeFile(path, '另一个程序创建的新文件')
    await page.locator(`[data-session-id="${id}"]`).click()
    await expect(input).toBeVisible()
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.getByText('暂无已登记文档')).toBeVisible()
    await expect(card).toHaveCount(0)
    expect(await readFile(path, 'utf8')).toBe('另一个程序创建的新文件')
    await page.close()
    await host.runtime.dispose()
    reboot = await startWebHost({ port: 0 })
    resumed = await clientFor(reboot)
    const restored = await resumed.ctx.remote.platform.libraryFiles()
    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error(restored.error.message)
    expect(restored.value.some((file) => file.name === '测试文档.md')).toBe(false)
    expect(restored.value.some((file) => file.name === '未登记.md')).toBe(false)
    const restoredImage = restored.value.find((file) => file.name === '测试图片.png')
    expect(restoredImage).toBeDefined()
    const imageRequest = {
      sessionId: restoredImage!.sessionId,
      source: 'workspace' as const,
      path: restoredImage!.path,
      version: restoredImage!.version,
    }
    const stale = await resumed.ctx.remote.platform.deleteLibraryFile({
      ...imageRequest,
      version: 'stale',
    })
    expect(stale.ok).toBe(false)
    const imagePath = join(session.header.cwd, '测试图片.png')
    expect((await readFile(imagePath)).length).toBeGreaterThan(0)
    const deletedImage = await resumed.ctx.remote.platform.deleteLibraryFile(imageRequest)
    expect(deletedImage.ok).toBe(true)
    await expect(readFile(imagePath)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await page.close()
    await resumed?.dispose()
    await reboot?.dispose()
    await host.dispose()
  }
})

test('sent user images appear in the library and remain in chat after removal', async ({
  page,
}) => {
  const host = await fixtureHost()
  let reboot: Awaited<ReturnType<typeof startWebHost>> | undefined
  let resumed: Awaited<ReturnType<typeof clientFor>> | undefined
  try {
    await page.goto(host.login)
    await page.locator('input[type=file]').setInputFiles([
      {
        name: '用户图片.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC',
          'base64',
        ),
      },
      {
        name: '第二张.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP4z8AARAxg8j8AG/ID/fPnS7EAAAAASUVORK5CYII=',
          'base64',
        ),
      },
    ])
    await expect(page.locator('[data-upload-state=ready]')).toHaveCount(2)
    const draftClient = await clientFor(host.runtime)
    const drafts = await draftClient.ctx.remote.platform.libraryFiles()
    expect(drafts.ok && drafts.value.some((entry) => entry.name === '用户图片.png')).toBe(false)
    await draftClient.dispose()
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('请查看图片')
    await input.press('Enter')
    await expect(page.getByRole('img', { name: '用户图片.png' })).toBeVisible()
    const id = host.runtime.ctx.sessions.list()[0].id
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.getByRole('tab', { name: '图片' }).click()
    const card = page.getByRole('button', { name: /用户图片\.png/ })
    await expect(card).toBeVisible()
    await expect(card.locator('.tz-library-card-info')).toHaveCount(0)
    await card.click()
    const image = page.getByRole('dialog', { name: '预览 用户图片.png' }).getByRole('img')
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0)
    await page.screenshot({ path: 'reports/p2/tz083-image-preview-desktop.png' })
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: '预览 第二张.png' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('dialog', { name: '预览 用户图片.png' })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载图片' }).click()
    expect((await download).suggestedFilename()).toBe('用户图片.png')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'reports/p2/tz083-image-preview-mobile.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '预览 用户图片.png' })).toHaveCount(0)
    await page.setViewportSize({ width: 1440, height: 1000 })
    const client = await clientFor(host.runtime)
    const listed = await client.ctx.remote.platform.libraryFiles()
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error(listed.error.message)
    const item = listed.value.find((entry) => entry.name === '用户图片.png')
    expect(item).toMatchObject({ sessionId: id, source: 'attachment', kind: 'image' })
    if (!item?.artifactId) throw new Error('missing attachment identity')
    await client.dispose()
    await host.runtime.dispose()
    reboot = await startWebHost({ port: 0 })
    resumed = await clientFor(reboot)
    const historical = await resumed.ctx.remote.platform.libraryFiles()
    expect(historical.ok && historical.value.some((entry) => entry.name === '用户图片.png')).toBe(
      true,
    )
    await page.goto(
      reboot.ctx.connection.authenticatedUrl(`http://127.0.0.1:${reboot.ctx.webServer.port}/`),
    )
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.getByRole('tab', { name: '图片' }).click()
    await expect(card).toBeVisible()
    await card.click()
    await page.getByRole('button', { name: '删除图片', exact: true }).click()
    await expect(page.getByRole('alertdialog', { name: '删除文件' })).toContainText('附件会保留')
    await page.getByRole('button', { name: '移除', exact: true }).click()
    await expect(card).toHaveCount(0)
    await page.locator(`[data-session-id="${id}"]`).click()
    await expect(page.getByRole('img', { name: '用户图片.png' })).toBeVisible()
    await page.close()
    await resumed.dispose()
    await reboot.dispose()
    reboot = await startWebHost({ port: 0 })
    resumed = await clientFor(reboot)
    const restored = await resumed.ctx.remote.platform.libraryFiles()
    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error(restored.error.message)
    expect(restored.value.some((entry) => entry.name === '用户图片.png')).toBe(false)
    const artifacts = await resumed.ctx.remote.platform.artifacts(id)
    expect(artifacts.ok && artifacts.value.some((entry) => entry.id === item.artifactId)).toBe(true)
    using observation = await reboot.ctx.sessionQuery.observeSession(id, { projectionMode: 'none' })
    const message = observation.events.find((event) => event.type === 'user/message')!
    const ref = message.data.content.find((block) => block.type === 'image')!.attachment
    expect((await reboot.ctx.attachments.readImage(ref)).data.length).toBeGreaterThan(0)
  } finally {
    await page.close()
    await resumed?.dispose()
    await reboot?.dispose()
    await host.dispose()
  }
})

test('TZ-083 file page fits a narrow viewport', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { name: '文件', exact: true })).toBeVisible()
    await page.screenshot({ path: 'reports/p2/tz083-files-mobile.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await page.close()
    await host.dispose()
  }
})
