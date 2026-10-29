// @vitest-environment jsdom
/** The shared checkbox keeps native label activation and controlled state. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Checkbox } from '../src/Checkbox.tsx'

afterEach(cleanup)

function clickLabel(label: HTMLElement): void {
  fireEvent.pointerDown(label, { pointerId: 1, pointerType: 'mouse', button: 0 })
  fireEvent.pointerUp(label, { pointerId: 1, pointerType: 'mouse', button: 0 })
  fireEvent.click(label)
}

it('requests a checked state through its visible label and follows the owner', () => {
  const onChange = vi.fn()
  const { rerender } = render(<Checkbox label="Images" checked={false} onChange={onChange} />)
  clickLabel(screen.getByText('Images'))
  expect(onChange).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Images' }).checked).toBe(false)
  rerender(<Checkbox label="Images" checked onChange={onChange} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(onChange).toHaveBeenLastCalledWith(false)
})

it('refuses label activation while disabled', () => {
  const onChange = vi.fn()
  render(<Checkbox label="Images" checked disabled onChange={onChange} />)
  clickLabel(screen.getByText('Images'))
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(true)
})

it('preserves caller hover text', () => {
  const onChange = vi.fn()
  render(<Checkbox label="Office" checked={false} onChange={onChange} title="Office tools" />)
  expect(screen.getByText('Office')).toBeTruthy()
  const input = screen.getByRole('checkbox', { name: 'Office' })
  expect(input.closest<HTMLElement>('[data-slot=checkbox]')?.title).toBe('Office tools')
  fireEvent.click(input)
  expect(onChange).toHaveBeenLastCalledWith(true)
})
