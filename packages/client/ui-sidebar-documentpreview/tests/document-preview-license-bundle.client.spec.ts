/** Product Vite artifact retains the upstream PDF/Excel data and license closure. */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect } from 'vitest'
it('ships PDF binary data and third-party notices with the static application', () => {
  const root = resolve('apps/web/dist')
  const notices = readFileSync(resolve(root, 'document-preview-NOTICES.txt'), 'utf8')
  for (const name of ['pdfjs-dist/LICENSE', 'cmaps/LICENSE', 'standard_fonts/LICENSE_FOXIT', 'wasm/LICENSE_OPENJPEG', 'Suzhou Ruilisi', 'exceljs/', 'xlsx/']) expect(notices).toContain(name)
  const files = readdirSync(resolve(root, 'assets'))
  const pdf = files.find(name => /^pdf-.*\.js$/.test(name))
  expect(pdf).toBeDefined()
  const code = readFileSync(resolve(root, 'assets', pdf!), 'utf8')
  expect(code).not.toContain('__DSH_PDFJS_ASSETS__')
  expect(code).toContain('Foxit')
})
