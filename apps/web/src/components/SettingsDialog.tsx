import { useId, useState, type ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AppClient } from '../model/client'
import { Button, Icon } from './kit'
import { ModelSettings } from './ModelSettings'
import s from '../App.module.css'

/** One modal and focus lifetime for every settings category. */
export function SettingsDialog({
  client,
  onClose,
  children,
}: {
  client: AppClient
  onClose(): void
  children: ReactNode
}) {
  const [category, setCategory] = useState<'models' | 'display'>('models')
  const [busy, setBusy] = useState(false)
  const id = useId()
  return (
    <Modal
      open
      headless
      title="设置"
      className={s.settingsModal}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className={s.settingsHeader}>
        <h2>设置</h2>
        <Button aria-label="关闭" disabled={busy} onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      <div className={s.settingsLayout}>
        <nav className={s.settingsNav} aria-label="设置分类">
          <Button
            id={`${id}-models-nav`}
            aria-controls={`${id}-models`}
            aria-current={category === 'models' ? 'page' : undefined}
            disabled={busy}
            onClick={() => setCategory('models')}
          >
            <Icon name="model" />
            模型
          </Button>
          <Button
            id={`${id}-display-nav`}
            aria-controls={`${id}-display`}
            aria-current={category === 'display' ? 'page' : undefined}
            disabled={busy}
            onClick={() => setCategory('display')}
          >
            <Icon name="settings" />
            对话显示
          </Button>
        </nav>
        {/* Hidden panels retain drafts and scroll positions, but leave the focus order. */}
        <section
          id={`${id}-models`}
          aria-labelledby={`${id}-models-nav`}
          className={s.settingsContent}
          hidden={category !== 'models'}
        >
          <ModelSettings client={client} busy={busy} onBusyChange={setBusy} />
        </section>
        <section
          id={`${id}-display`}
          aria-labelledby={`${id}-display-nav`}
          className={s.settingsContent}
          hidden={category !== 'display'}
        >
          <div className={s.settingsHeading}>
            <h3>对话显示</h3>
          </div>
          {children}
        </section>
      </div>
    </Modal>
  )
}
