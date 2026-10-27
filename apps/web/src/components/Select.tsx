import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './kit'
import s from '../App.module.css'

export interface SelectOption {
  value: string
  label: string
  detail?: string
}
/** Shared selection surface: one focus owner, keyboard selection, viewport-aware placement. */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = '请选择',
  onManage,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange(value: string): void
  disabled?: boolean
  placeholder?: string
  onManage?: () => void
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280, maxHeight: 320 })
  const search = useRef({ text: '', time: 0 })
  const selected = options.find((o) => o.value === value)
  const show = () => {
    if (disabled) return
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    )
    setOpen(true)
  }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    menu.current.setAttribute('popover', 'manual')
    menu.current.showPopover()
    const rect = trigger.current.getBoundingClientRect()
    const width = Math.min(320, innerWidth - 24)
    const above = rect.top > innerHeight - rect.bottom
    const maxHeight = Math.min(
      360,
      Math.max(100, (above ? rect.top : innerHeight - rect.bottom) - 20),
    )
    const height = Math.min(menu.current.scrollHeight, maxHeight)
    setPosition({
      left: Math.min(Math.max(12, rect.left), innerWidth - width - 12),
      top: above ? rect.top - height - 8 : rect.bottom + 8,
      width,
      maxHeight,
    })
  }, [open, options.length])
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (
        e.target instanceof Node &&
        (trigger.current?.contains(e.target) || menu.current?.contains(e.target))
      )
        return
      setOpen(false)
    }
    const resize = () => setOpen(false)
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', resize)
    }
  }, [open])
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])
  const choose = (next: string) => {
    setOpen(false)
    onChange(next)
    trigger.current?.focus()
  }
  return (
    <div className={s.selectRoot}>
      <button
        type="button"
        ref={trigger}
        className={s.selectTrigger}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        onBlur={(e) => {
          if (!menu.current?.contains(e.relatedTarget)) setOpen(false)
        }}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            return
          }
          if (e.key === 'Tab') {
            if (!onManage || e.shiftKey) setOpen(false)
            return
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault()
            if (!open) {
              show()
              return
            }
            setActive((n) =>
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? options.length - 1
                  : Math.max(0, Math.min(options.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))),
            )
          } else if ((e.key === 'Enter' || e.key === ' ') && open) {
            e.preventDefault()
            if (options[active]) choose(options[active].value)
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const now = Date.now()
            search.current = {
              text:
                (now - search.current.time < 700 ? search.current.text : '') +
                e.key.toLocaleLowerCase(),
              time: now,
            }
            const index = options.findIndex((o) =>
              o.label.toLocaleLowerCase().startsWith(search.current.text),
            )
            if (index >= 0) {
              e.preventDefault()
              if (!open) show()
              setActive(index)
            }
          }
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        <Icon name="chevron" />
      </button>
      {open ? (
        <div
          ref={menu}
          className={s.selectMenu}
          style={position}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== trigger.current)
              setOpen(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              trigger.current?.focus()
            }
          }}
        >
          <div id={id} role="listbox" aria-label={label}>
            {options.map((o, index) => (
              <div
                id={`${id}-${index}`}
                role="option"
                aria-selected={value === o.value}
                key={o.value}
                className={`${s.selectOption} ${active === index ? s.optionActive : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
              >
                <span>
                  {o.label}
                  {o.detail ? <small>{o.detail}</small> : null}
                </span>
                {value === o.value ? <Icon name="check" /> : null}
              </div>
            ))}
            {!options.length ? <div className={s.selectEmpty}>暂无可用模型</div> : null}
          </div>
          {onManage ? (
            <button
              type="button"
              className={s.selectManage}
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <Icon name="settings" />
              管理模型
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
