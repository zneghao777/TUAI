import type { ReactNode } from 'react'
import { Button, Label, ListBox, Select as HeroSelect } from '@heroui/react'
export interface SelectOption {
  value: string
  label: string
  detail?: string
}
/** One React Aria focus/overlay owner, including inside settings. */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = '请选择',
  onManage,
  icon,
  compact = false,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange(value: string): void
  disabled?: boolean
  placeholder?: string
  onManage?: () => void
  icon?: ReactNode
  compact?: boolean
}) {
  return (
    <HeroSelect
      aria-label={label}
      value={value || null}
      onChange={(key) => {
        if (key !== null) onChange(String(key))
      }}
      isDisabled={disabled}
      placeholder={placeholder}
      className={compact ? 'tz-select tz-select-compact' : 'tz-select'}
    >
      <HeroSelect.Trigger>
        {icon}
        <HeroSelect.Value />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover className="tz-select-popover">
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
              <Label>{option.label}</Label>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
        {onManage ? (
          <Button variant="ghost" onPress={onManage}>
            管理模型
          </Button>
        ) : null}
      </HeroSelect.Popover>
    </HeroSelect>
  )
}
