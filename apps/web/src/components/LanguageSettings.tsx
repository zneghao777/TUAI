import { useSource } from '../bindings'
import { useState } from 'react'
import {
  ActionButton,
  IconChevronDownOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { isLanguage, type LanguageRuntime } from '../model/language'
import type { AppClient } from '../model/client'

const labels = {
  zh: {
    language: '语言',
    failed: '语言设置未保存，请重试',
    unavailable: '当前 Host 不支持语言设置，请更新并重启 Host',
    readOnly: '当前语言设置不可修改',
  },
  en: {
    language: 'Language',
    failed: 'Language could not be saved. Try again.',
    unavailable: 'This Host does not support language settings. Update and restart the Host.',
    readOnly: 'Language settings are read-only.',
  },
  it: {
    language: 'Lingua',
    failed: 'Impossibile salvare la lingua. Riprova.',
    unavailable:
      'Questo Host non supporta le impostazioni della lingua. Aggiorna e riavvia l’Host.',
    readOnly: 'Le impostazioni della lingua sono di sola lettura.',
  },
}
const options = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
]

export function LanguageSettings({
  client,
  language,
}: {
  client: AppClient
  language: LanguageRuntime
}) {
  const state = useSource(language.state)
  const locale = useSource(client.ctx.locale)
  const [open, setOpen] = useState(false)
  const active = locale.active === 'en' || locale.active === 'it' ? locale.active : 'zh'
  const copy = labels[active]
  const activeLabel = options.find((option) => option.id === active)?.label ?? active
  return (
    <div className="tz-language-settings" aria-busy={state.saving}>
      <div className="tz-language-text">
        <div className="tz-language-title">{copy.language}</div>
        {state.error || state.unavailable || state.readOnly ? (
          <div role="alert" className="tz-language-error">
            {state.error ? copy.failed : state.unavailable ? copy.unavailable : copy.readOnly}
          </div>
        ) : null}
      </div>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={options}
        selectedId={active}
        align="end"
        portal
        onSelect={(value) => {
          setOpen(false)
          if (isLanguage(value) && value !== active) void language.setLanguage(value)
        }}
        anchor={
          <ActionButton
            type="button"
            className="tz-language-selector"
            aria-label={`${copy.language}: ${activeLabel}`}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={!state.ready || state.saving}
            onClick={() => setOpen((value) => !value)}
          >
            {activeLabel}
            <IconChevronDownOutlineRegular />
          </ActionButton>
        }
      />
    </div>
  )
}
