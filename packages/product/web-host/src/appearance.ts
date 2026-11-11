import Schema from '@deepseek-ai/schemastery'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { bootThemeInjections } from '@deepseek-ai/dsh-client-ui-theme/src/boot-theme.ts'
import { ThemeSettingsSchema } from '@deepseek-ai/dsh-client-ui-theme/src/theme-settings.ts'
import type { ProductAppearanceSettings } from './types.ts'

/** Product extension of the existing namespace; shared DSH theme contracts stay intact. */
export const ProductAppearanceSchema: Schema<ProductAppearanceSettings> = Schema.intersect([
  ThemeSettingsSchema,
  Schema.object({ palette: Schema.union(['white', 'forest', 'dawn']).default('white') }),
])

/** Validate the cross-field constraint before a durable mutation is accepted. */
export function validateAppearance(value: unknown): ProductAppearanceSettings {
  const settings = Schema.resolve(value, ProductAppearanceSchema, {})[0]
  if (settings.palette !== 'forest' && settings.preference !== 'light')
    throw new Error(`${settings.palette === 'white' ? '纯白' : '晨曦'}主题目前仅支持浅色`)
  return settings
}

/** Restore the Host's last accepted appearance before the client and its first paint. */
export function appearanceBootInjections(settings: ProductAppearanceSettings): IndexInjection[] {
  const rows = bootThemeInjections(
    settings.preference,
    {
      text: settings.fontSize,
      code: settings.codeFontSize,
      terminal: settings.terminalFontSize,
    },
    {
      text: settings.textFontFamily,
      code: settings.codeFontFamily,
      terminal: settings.terminalFontFamily,
    },
  ).map(
    (row): IndexInjection =>
      row.kind === 'style'
        ? { ...row, text: row.text.replaceAll('body{', 'body:not([data-tz-appearance-ready]){') }
        : row,
  )
  rows.push(
    {
      kind: 'style',
      text:
        `body:not([data-tz-appearance-ready]){background-color:${settings.palette === 'white' ? '#ffffff' : settings.palette === 'dawn' ? '#f5f8fc' : settings.preference === 'dark' ? '#191f1d' : '#f4f6f3'}}` +
        (settings.palette === 'forest' && settings.preference === 'system'
          ? '@media(prefers-color-scheme:dark){body:not([data-tz-appearance-ready]){background-color:#191f1d}}'
          : ''),
    },
    {
      kind: 'script',
      placement: 'body',
      text: `document.body.dataset.tzPalette = ${JSON.stringify(settings.palette)}`,
    },
  )
  return rows
}
