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
  zh: { language: '语言', failed: '语言设置未保存，请重试' },
  en: { language: 'Language', failed: 'Language could not be saved. Try again.' },
  it: { language: 'Lingua', failed: 'Impossibile salvare la lingua. Riprova.' },
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
        {state.error ? (
          <div role="alert" className="tz-language-error">
            {copy.failed}
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
