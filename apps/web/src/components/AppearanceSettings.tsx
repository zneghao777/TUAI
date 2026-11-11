import { Button } from '@heroui/react'
import { useSource } from '../bindings'
import type { AppearanceRuntime } from '../model/appearance'
import type { AppClient } from '../model/client'
import { useProductLanguage } from '../model/product-language'
import type { ThemePreference } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemePalette } from '@tuai/web-host/types'

const palettes: readonly ThemePalette[] = ['white', 'forest', 'dawn']
const modes: readonly ThemePreference[] = ['light', 'dark', 'system']
const copy = {
  zh: {
    palette: '配色',
    appearance: '外观',
    white: '纯白',
    forest: '青绿',
    dawn: '晨曦',
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
    lightOnly: '目前仅支持浅色',
    error: '未确认保存，请重试',
  },
  en: {
    palette: 'Color palette',
    appearance: 'Appearance',
    white: 'White',
    forest: 'Forest',
    dawn: 'Dawn',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    lightOnly: 'currently supports light mode only',
    error: 'Could not confirm the save. Try again.',
  },
  it: {
    palette: 'Colori',
    appearance: 'Aspetto',
    white: 'Bianco',
    forest: 'Verde',
    dawn: 'Alba',
    light: 'Chiaro',
    dark: 'Scuro',
    system: 'Sistema',
    lightOnly: 'supporta solo la modalità chiara',
    error: 'Salvataggio non confermato. Riprova.',
  },
}

/** Semantic choices remain visible to keyboard users and browser agents; the Host owns selection. */
export function AppearanceSettings({
  appearance,
  client,
}: {
  appearance: AppearanceRuntime
  client: AppClient
}) {
  const text = copy[useProductLanguage(client)]
  const state = useSource(appearance.state)
  const disabled = !state.ready || state.saving
  return (
    <div className="tz-appearance" aria-busy={state.saving}>
      <fieldset>
        <legend>{text.palette}</legend>
        <div className="tz-palette-options">
          {palettes.map((id) => (
            <Button
              key={id}
              variant="ghost"
              className="tz-palette-choice"
              aria-pressed={state.palette === id}
              isDisabled={disabled}
              onPress={() => {
                void appearance.setPalette(id)
              }}
            >
              <span className="tz-palette-swatch" data-palette={id} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {text[id]}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{text.appearance}</legend>
        <div className="tz-appearance-modes">
          {modes.map((id) => (
            <Button
              key={id}
              variant="ghost"
              aria-pressed={state.preference === id}
              isDisabled={disabled || (state.palette !== 'forest' && id !== 'light')}
              onPress={() => {
                void appearance.setPreference(id)
              }}
            >
              {text[id]}
            </Button>
          ))}
        </div>
        {state.palette !== 'forest' ? (
          <p className="tz-appearance-note">
            {text[state.palette]} {text.lightOnly}
          </p>
        ) : null}
      </fieldset>
      {state.error ? (
        <p role="alert" className="tz-appearance-error">
          {text.error}
        </p>
      ) : null}
    </div>
  )
}
