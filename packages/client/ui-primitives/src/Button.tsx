import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Button as HeroButton } from '@heroui/react'
import clsx from 'clsx'
import css from './Button.module.css'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'
type NativeProps = ButtonHTMLAttributes<HTMLButtonElement>
type ButtonProps = NativeProps & { variant?: ButtonVariant; size?: 'md' | 'sm'; icon?: ReactNode }

/** Compose the native handlers on the actual button, preserving the owner event contract. */
function chain<E>(first: ((event: E) => void) | undefined, second: ((event: E) => void) | undefined) {
  return (event: E) => { first?.(event); second?.(event) }
}
const NativeButton = forwardRef<HTMLButtonElement, NativeProps & { heroVariant?: 'primary' | 'ghost' | 'outline' | 'secondary'; size?: 'md' | 'sm' }>(function NativeButton({
  disabled, children, className, heroVariant = 'ghost', size = 'md', ...props
}, ref) {
  return <HeroButton ref={ref} type="button" variant={heroVariant} size={size} isDisabled={disabled ?? false} className={className ?? ''}
    render={domProps => <button {...domProps} {...props} className={domProps.className}
      onClick={props.onClick}
      onFocus={chain(domProps.onFocus, props.onFocus)}
      onBlur={chain(domProps.onBlur, props.onBlur)}
      onKeyDown={props.onKeyDown}
      onKeyUp={props.onKeyUp}
      onPointerDown={chain(props.onPointerDown, domProps.onPointerDown)}
      onPointerUp={chain(props.onPointerUp, domProps.onPointerUp)}
      onMouseDown={chain(props.onMouseDown, domProps.onMouseDown)}
      onMouseUp={chain(props.onMouseUp, domProps.onMouseUp)}
      onPointerEnter={chain(props.onPointerEnter, domProps.onPointerEnter)}
      onPointerLeave={chain(props.onPointerLeave, domProps.onPointerLeave)}
      onMouseEnter={chain(props.onMouseEnter, domProps.onMouseEnter)}
      onMouseLeave={chain(props.onMouseLeave, domProps.onMouseLeave)}
      onDragStart={chain(props.onDragStart, domProps.onDragStart)} />}
  >{children}</HeroButton>
})

/** Shared visual button contract for all migrated owners. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'ghost', size = 'md', icon, className, children, ...rest }, ref) {
  return <NativeButton ref={ref} heroVariant={variant === 'toolbar' ? 'secondary' : variant} size={size}
    className={clsx(css.button, css[variant], css[size], className)} {...rest}>
    {icon != null && <span className={css.icon}>{icon}</span>}{children}
  </NativeButton>
})

/** HeroUI interaction with caller-owned geometry for tree, editor and tool actions. */
export const ActionButton = forwardRef<HTMLButtonElement, NativeProps>(function ActionButton({ className, ...props }, ref) {
  return <NativeButton ref={ref} className={clsx('tz-action', className)} {...props} />
})
