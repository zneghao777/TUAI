import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal, Tabs } from '@heroui/react'
import { closeTopModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AppClient } from '../model/client'
import { Button, Icon } from './kit'
import { ModelSettings } from './ModelSettings'
import { useProductLanguage } from '../model/product-language'
import s from '../App.module.css'

/** One focus owner; mounted tab panels preserve drafts and independent scroll. */
export function SettingsDialog({
  client,
  onClose,
  children,
}: {
  client: AppClient
  onClose(): void
  children: ReactNode
}) {
  const language = useProductLanguage(client)
  const copy = {
    zh: {
      settings: '设置',
      close: '关闭',
      categories: '设置分类',
      general: '通用',
      models: '模型',
    },
    en: {
      settings: 'Settings',
      close: 'Close',
      categories: 'Settings categories',
      general: 'General',
      models: 'Models',
    },
    it: {
      settings: 'Impostazioni',
      close: 'Chiudi',
      categories: 'Categorie delle impostazioni',
      general: 'Generale',
      models: 'Modelli',
    },
  }[language]
  const [category, setCategory] = useState('models')
  const [busy, setBusy] = useState(false)
  const [nestedMenu, setNestedMenu] = useState(false)
  const nestedEscape = useRef(false)
  useEffect(() => {
    // DSH command menus retain their own Escape handling above the HeroUI modal.
    const update = () => setNestedMenu(Boolean(document.querySelector('[data-menu-material]')))
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        nestedEscape.current = Boolean(
          document.querySelector(
            '[data-menu-material], .tz-settings-dialog [role="dialog"][aria-modal="true"]',
          ),
        )
        if (
          !event.isComposing &&
          !event.repeat &&
          !document.querySelector('[data-menu-material]') &&
          document.querySelector('.tz-settings-dialog [role="dialog"][aria-modal="true"]')
        ) {
          event.preventDefault()
          event.stopPropagation()
          closeTopModal(document)
        }
      }
    }
    const keyup = () => {
      nestedEscape.current = false
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('keyup', keyup, true)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('keyup', keyup, true)
    }
  }, [])
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!busy}
      shouldCloseOnInteractOutside={(element) => !element.closest('[data-menu-material]')}
      isKeyboardDismissDisabled={busy || nestedMenu}
      onOpenChange={(open) => {
        if (!open && !busy && !nestedEscape.current) onClose()
      }}
      className="tz-settings-backdrop"
    >
      <Modal.Container size="lg" placement="center" className="tz-settings-container">
        <Modal.Dialog
          data-shortcut-modal="settings"
          aria-label={copy.settings}
          className={`${s.settingsModal} tz-settings-dialog`}
        >
          <div className={s.settingsHeader}>
            <Modal.Heading>{copy.settings}</Modal.Heading>
            <Button aria-label={copy.close} disabled={busy} onClick={onClose}>
              <Icon name="close" />
            </Button>
          </div>
          <Tabs
            selectedKey={category}
            onSelectionChange={(key) => setCategory(String(key))}
            orientation="vertical"
            className={`${s.settingsLayout} tz-settings-tabs`}
          >
            <nav className={s.settingsNav} aria-label={copy.categories}>
              <Tabs.List aria-label={copy.categories} className="tz-settings-tablist">
                <Tabs.Tab id="display" isDisabled={busy}>
                  <Icon name="settings" />
                  {copy.general}
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="models" isDisabled={busy}>
                  <Icon name="model" />
                  {copy.models}
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </nav>
            <Tabs.Panel
              id="models"
              shouldForceMount
              hidden={category !== 'models'}
              className={s.settingsContent}
            >
              <ModelSettings client={client} busy={busy} onBusyChange={setBusy} />
            </Tabs.Panel>
            <Tabs.Panel
              id="display"
              shouldForceMount
              hidden={category !== 'display'}
              className={s.settingsContent}
            >
              <div className={s.settingsHeading}>
                <h3>{copy.general}</h3>
              </div>
              {children}
            </Tabs.Panel>
          </Tabs>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
