import { Button } from '@heroui/react'
import { useSource } from '../bindings'
import type { AppearanceRuntime } from '../model/appearance'
import type { ThemePreference } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemePalette } from '@tianzhiai/web-host/types'

const palettes: readonly { id: ThemePalette; name: string }[] = [
  { id: 'white', name: '纯白' },
  { id: 'forest', name: '青绿' },
  { id: 'dawn', name: '晨曦' },
]
const modes: readonly { id: ThemePreference; name: string }[] = [
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' },
  { id: 'system', name: '跟随系统' },
]

/** Semantic choices remain visible to keyboard users and browser agents; the Host owns selection. */
export function AppearanceSettings({ appearance }: { appearance: AppearanceRuntime }) {
  const state = useSource(appearance.state)
  const disabled = !state.ready || state.saving
  return (
    <div className="tz-appearance" aria-busy={state.saving}>
      <fieldset>
        <legend>配色</legend>
        <div className="tz-palette-options">
          {palettes.map(({ id, name }) => (
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
              {name}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>外观</legend>
        <div className="tz-appearance-modes">
          {modes.map(({ id, name }) => (
            <Button
              key={id}
              variant="ghost"
              aria-pressed={state.preference === id}
              isDisabled={disabled || (state.palette !== 'forest' && id !== 'light')}
              onPress={() => {
                void appearance.setPreference(id)
              }}
            >
              {name}
            </Button>
          ))}
        </div>
        {state.palette !== 'forest' ? (
          <p className="tz-appearance-note">
            {state.palette === 'white' ? '纯白' : '晨曦'}目前仅支持浅色
          </p>
        ) : null}
      </fieldset>
      {state.error ? (
        <p role="alert" className="tz-appearance-error">
          {state.error}
        </p>
      ) : null}
    </div>
  )
}
