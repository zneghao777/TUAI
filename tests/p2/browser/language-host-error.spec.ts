import { expect, test } from '@playwright/test'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureHost } from '../fixture-host.mjs'

test('Italian displays a real Host stale-file error and keeps the original file', async ({
  page,
}) => {
  const host = await fixtureHost({ defaultPreset: 'full-access', fileLibrary: true })
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('TZ083 创建测试文档')
    await input.press('Enter')
    await expect(page.getByText('TZ083 文件已生成。')).toBeVisible({ timeout: 20000 })
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const session = host.runtime.ctx.sessions.list().find((item) => item.id === id)
    const file = join(session.header.cwd, '测试文档.md')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '语言: 中文' }).click()
    await page.getByRole('menuitem', { name: 'Italiano' }).click()
    await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
    await page.getByRole('button', { name: 'File', exact: true }).click()
    const card = page.locator('.tz-library-card').filter({ hasText: '测试文档.md' })
    await expect(card).toBeVisible()
    await page.getByRole('button', { name: 'Seleziona', exact: true }).click()
    await card.click()
    await writeFile(file, 'Contenuto cambiato dopo il caricamento')
    await page.getByRole('button', { name: 'Elimina', exact: true }).click()
    await page.getByRole('button', { name: 'Elimina definitivamente' }).click()
    await expect(page.getByRole('alert')).toContainText('Il file è cambiato. Aggiorna e riprova.')
    expect(await readFile(file, 'utf8')).toBe('Contenuto cambiato dopo il caricamento')
  } finally {
    await page.close().catch(() => {})
    await host.dispose()
  }
})

test('Italian translates a Host session error while preserving the draft', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const current = page.locator('[data-session-id][aria-current=page]')
    await current.hover()
    await current.getByRole('button', { name: /^归档会话/ }).click()
    await expect(current).toHaveCount(0)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '语言: 中文' }).click()
    await page.getByRole('menuitem', { name: 'Italiano' }).click()
    await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
    host.runtime.ctx.sessionController.prepareCreate = async () => {
      throw new Error('Host 会话服务尚未就绪，请检查认证与连接')
    }
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('Testo da conservare')
    const send = page.getByRole('button', { name: 'Invia messaggio', exact: true })
    await expect(send).toBeEnabled()
    await send.click()
    await expect(page.getByText(/Il servizio chat dell’Host non è pronto/)).toBeVisible()
    await expect(input).toHaveText('Testo da conservare')
  } finally {
    await page.close().catch(() => {})
    await host.dispose()
  }
})

test('Italian translates Host errors from the new-chat button', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '语言: 中文' }).click()
    await page.getByRole('menuitem', { name: 'Italiano' }).click()
    await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
    host.runtime.ctx.sessionController.prepareCreate = async () => {
      throw new Error('Host 会话服务尚未就绪，请检查认证与连接')
    }
    await page.getByRole('button', { name: 'Nuova chat', exact: true }).click()
    await expect(
      page.getByText(
        /Creazione della sessione non riuscita:.*Il servizio chat dell’Host non è pronto/,
      ),
    ).toBeVisible()
  } finally {
    await page.close().catch(() => {})
    await host.dispose()
  }
})

test('Italian translates Host errors in document preview', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const session = host.runtime.ctx.sessions.list().find((item) => item.id === id)
    await writeFile(join(session.header.cwd, 'failure.txt'), 'fixture')
    await page.getByRole('button', { name: '打开右侧边栏' }).click()
    await page.getByRole('button', { name: /工作区文件/ }).click()
    await expect(page.getByText('failure.txt', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '语言: 中文' }).click()
    await page.getByRole('menuitem', { name: 'Italiano' }).click()
    await page
      .getByRole('dialog', { name: 'Impostazioni' })
      .getByRole('button', { name: 'Chiudi', exact: true })
      .click()
    host.runtime.ctx.workspaceFiles.read = async () => {
      throw new Error('文件已变化，请刷新后重试')
    }
    await page.getByText('failure.txt', { exact: true }).click()
    await expect(page.getByText(/Il file è cambiato\. Aggiorna e riprova\./)).toBeVisible()
  } finally {
    await page.close().catch(() => {})
    await host.dispose()
  }
})
