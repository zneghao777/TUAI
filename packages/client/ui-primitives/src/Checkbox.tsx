/** Controlled native checkbox with a caller-owned visible and accessible label. */

import { Checkbox as HeroCheckbox, Label } from '@heroui/react'

/**
 * Render a labeled checkbox with native keyboard and form semantics.
 * @param props.checked - current checked state.
 * @param props.onChange - receives the requested checked state.
 * @param props.label - localized visible and accessible label.
 * @param props.disabled - whether the control refuses changes.
 * @param props.title - optional localized hover text.
 * @param props.className - extra class for the label's placement.
 * @returns the label containing its checkbox.
 */
export function Checkbox({ checked, onChange, label, disabled = false, title, className }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string | undefined
  className?: string | undefined
}) {
  return (
    <HeroCheckbox isSelected={checked} onChange={(next) => { if (!disabled) onChange(next) }} isDisabled={disabled} render={(props) => <div {...props} title={title} />} className={className ?? ''}>
      <HeroCheckbox.Content><HeroCheckbox.Control><HeroCheckbox.Indicator /></HeroCheckbox.Control><Label>{label}</Label></HeroCheckbox.Content>
    </HeroCheckbox>
  )
}
