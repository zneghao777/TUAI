// Adapted from DSH ui-sidebar-documentpreview/tsdown.config.ts at the locked baseline.
// The product uses static ESM/Vite; keep the same worker/data/license closure.
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
const preview = 'packages/client/ui-sidebar-documentpreview'
const require = createRequire(new URL(`../${preview}/package.json`, import.meta.url))
export function buildPreviewAssets() {
  const root = dirname(require.resolve('pdfjs-dist/package.json'))
  const assets = Object.fromEntries(
    [
      ['cMapUrl', 'cmaps'],
      ['standardFontDataUrl', 'standard_fonts'],
      ['wasmUrl', 'wasm'],
    ].map(([key, directory]) => [
      key,
      Object.fromEntries(
        readdirSync(join(root, directory))
          .filter((name) => !name.startsWith('LICENSE'))
          .sort()
          .map((name) => [name, readFileSync(join(root, directory, name)).toString('base64')]),
      ),
    ]),
  )
  const file = `${preview}/lib/esm/client/pdf/assets.js`
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replaceAll('__DSH_PDFJS_ASSETS__', JSON.stringify(assets)),
  )
  const notices = [
    'LICENSE',
    ...['cmaps', 'standard_fonts', 'wasm'].flatMap((directory) =>
      readdirSync(join(root, directory))
        .filter((name) => name.startsWith('LICENSE'))
        .map((name) => `${directory}/${name}`),
    ),
  ].map((name) => `pdfjs-dist/${name}\n${readFileSync(join(root, name), 'utf8')}`)
  notices.push(readFileSync(`${preview}/licenses/FortuneSheet.txt`, 'utf8'))
  for (const name of ['exceljs', 'fast-xml-parser', 'papaparse', 'fflate', 'xlsx']) {
    let dir = dirname(require.resolve(name))
    while (!readdirSync(dir).includes('package.json')) dir = dirname(dir)
    for (const entry of readdirSync(dir).filter((name) => /^(LICENSE|NOTICE)(\.|$)/i.test(name)))
      notices.push(`${name}/${entry}\n${readFileSync(join(dir, entry), 'utf8')}`)
  }
  mkdirSync('apps/web/public', { recursive: true })
  writeFileSync('apps/web/public/document-preview-NOTICES.txt', notices.join('\n\n'))
}
