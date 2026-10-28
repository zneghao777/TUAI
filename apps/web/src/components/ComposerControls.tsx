import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import { useSource } from '../bindings'
import { Icon } from './kit'
import c from './ComposerControls.module.css'

/** One anchored surface for composer controls, including keyboard and touch dismissal. */
function ControlPopover({
  label,
  trigger,
  className = '',
  panelClassName = '',
  disabled,
  viewKey,
  title,
  children,
}: {
  label: string
  trigger: ReactNode
  className?: string
  panelClassName?: string
  disabled?: boolean
  viewKey?: string
  title?: string
  children(close: () => void): ReactNode
}) {
  const id = useId(),
    anchor = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const position = useAnchoredPosition({
    open,
    anchorRef: anchor,
    panelRef: panel,
    side: 'top',
    align: 'end',
    gap: 10,
    margin: 12,
  })
  useDismissOnOutsidePointer(anchor, open, setOpen, panel)
  const close = () => {
    setOpen(false)
    anchor.current?.focus()
  }
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  const positioned = position !== null
  useLayoutEffect(() => {
    if (open && positioned) panel.current?.focus({ preventScroll: true })
  }, [open, positioned, viewKey])
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`${c.trigger} ${className}`}
        aria-label={label}
        title={title ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className={`${c.panel} ${panelClassName}`}
            style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
            onBlur={(event) => {
              if (
                event.relatedTarget &&
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== anchor.current
              )
                setOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                close()
              }
              if (event.key === 'Tab') {
                const controls = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),input:not(:disabled)',
                  ),
                )
                if (
                  (!event.shiftKey && document.activeElement === controls.at(-1)) ||
                  (event.shiftKey &&
                    (document.activeElement === controls[0] ||
                      document.activeElement === panel.current))
                ) {
                  event.preventDefault()
                  close()
                }
              }
            }}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  )
}

const effortNames: Record<string, string> = {
  off: '关闭',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '极高',
  ultra: '最高',
}

export function ModelControl({
  catalog,
  selected,
  effort,
  disabled,
  onChange,
  onManage,
}: {
  catalog?: ModelCatalog
  selected: string
  effort: string
  disabled: boolean
  onChange(model: string, effort?: string): Promise<boolean>
  onManage(): void
}) {
  const models =
    catalog?.groups.flatMap((group) =>
      group.models.map((model) => ({ ...model, provider: group.id, providerName: group.name })),
    ) ?? []
  const model = models.find((model) => `${model.provider}/${model.id}` === selected)
  const effectiveEffort = effort || model?.reasoning?.defaultEffort
  const options = model?.reasoning?.efforts ?? []
  const index = options.findIndex((option) => option.id === effectiveEffort)
  const [preview, setPreview] = useState<number>(),
    [choosing, setChoosing] = useState(false),
    [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  useEffect(() => {
    setPreview(undefined)
  }, [selected, effort])
  const current = options[preview ?? index]
  const name = current ? (effortNames[current.id] ?? current.name) : '默认'
  const choose = async (route: string, nextEffort?: string) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      if (await onChange(route, nextEffort)) setChoosing(false)
    } finally {
      savingRef.current = false
      setSaving(false)
      setPreview(undefined)
    }
  }
  const commit = (value: string) => {
    const option = options[Number(value)]
    if (option && option.id !== effectiveEffort) void choose(selected, option.id)
    else setPreview(undefined)
  }
  return (
    <ControlPopover
      label="模型与推理强度"
      className={c.modelTrigger}
      viewKey={choosing || !model ? 'models' : selected}
      disabled={disabled}
      title={`${model?.name ?? '选择模型'}${model?.reasoning ? ` · ${name}` : ''}`}
      trigger={
        <>
          <span className={c.modelLabel}>
            {model?.name ?? (models.length ? '选择模型' : '配置模型')}
          </span>
          {model?.reasoning && <span className={c.effortLabel}>{name}</span>}
          <Icon name="chevron" />
        </>
      }
    >
      {(close) =>
        choosing || !model ? (
          <>
            <div className={c.listHeader}>
              {model && (
                <button
                  type="button"
                  className={c.iconButton}
                  aria-label="返回推理强度"
                  onClick={() => setChoosing(false)}
                >
                  <Icon name="back" />
                </button>
              )}
              <strong>选择模型</strong>
            </div>
            <div
              className={c.modelList}
              role="listbox"
              aria-label="模型"
              onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const all = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[role=option]:not(:disabled)',
                  ),
                )
                const active = all.findIndex((button) => button === document.activeElement)
                all[
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? all.length - 1
                      : Math.max(
                          0,
                          Math.min(all.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)),
                        )
                ]?.focus()
              }}
            >
              {models.map((item) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === `${item.provider}/${item.id}`}
                  key={`${item.provider}/${item.id}`}
                  disabled={saving}
                  onClick={() => void choose(`${item.provider}/${item.id}`)}
                >
                  <span>
                    {item.name}
                    <small>{item.providerName}</small>
                  </span>
                  {selected === `${item.provider}/${item.id}` && <Icon name="check" />}
                </button>
              ))}
              {!models.length && <p className={c.empty}>暂无可用模型</p>}
            </div>
            <button
              type="button"
              className={c.manage}
              onClick={() => {
                close()
                onManage()
              }}
            >
              <Icon name="settings" />
              管理模型
            </button>
          </>
        ) : (
          <>
            <div className={c.reasoningHeader}>
              <div className={c.modelHeading}>
                {options.length > 0 && <strong aria-live="polite">{name}</strong>}
                <button
                  type="button"
                  className={c.modelName}
                  aria-label="切换模型"
                  title={model.name}
                  disabled={saving}
                  onClick={() => setChoosing(true)}
                >
                  <span>{model.name}</span>
                  <Icon name="right" />
                </button>
              </div>
              {options.length > 0 && (
                <button
                  type="button"
                  className={c.iconButton}
                  aria-label="恢复默认推理强度"
                  title="恢复默认推理强度"
                  disabled={!effort || saving || !options.length}
                  onClick={() => void choose(selected)}
                >
                  <Icon name="reset" />
                </button>
              )}
            </div>
            {options.length > 0 ? (
              <div className={c.slider}>
                <div className={c.sliderTrack} aria-hidden="true">
                  <div
                    className={c.sliderFill}
                    style={{
                      width: `${options.length > 1 ? ((preview ?? Math.max(0, index)) / (options.length - 1)) * 100 : 100}%`,
                    }}
                  />
                  <div className={c.sliderStops}>
                    {options.map((option) => (
                      <i key={option.id} />
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  aria-label="推理强度"
                  aria-valuetext={name}
                  min={0}
                  max={Math.max(0, options.length - 1)}
                  step={1}
                  value={preview ?? Math.max(0, index)}
                  disabled={saving || options.length < 2}
                  onChange={(event) => setPreview(Number(event.target.value))}
                  onPointerUp={(event) => commit(event.currentTarget.value)}
                  onKeyUp={(event) => {
                    if (
                      [
                        'ArrowLeft',
                        'ArrowRight',
                        'ArrowUp',
                        'ArrowDown',
                        'Home',
                        'End',
                        'PageUp',
                        'PageDown',
                      ].includes(event.key)
                    )
                      commit(event.currentTarget.value)
                  }}
                  onBlur={(event) => {
                    if (preview !== undefined) commit(event.currentTarget.value)
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className={c.manage}
                onClick={() => {
                  close()
                  onManage()
                }}
              >
                <Icon name="settings" />
                管理模型
              </button>
            )}
          </>
        )
      }
    </ControlPopover>
  )
}

const CONTEXT_PARTS = [
  { key: 'systemTokens', label: '系统提示词', color: c.colorSystem },
  { key: 'toolsTokens', label: '工具定义', color: c.colorTools },
  { key: 'messageTokens', label: '对话消息', color: c.colorMessages },
] as const

/** Match DSH's compact token notation; composition and occupancy are separate estimates. */
function formatTokens(value: number): string {
  const scaled = (count: number) =>
    String(count >= 100 ? Math.round(count) : Math.round(count * 10) / 10)
  if (value < 1000) return String(value)
  if (value < 1000000) return `${scaled(value / 1000)}K`
  return `${scaled(value / 1000000)}M`
}

export function ContextControl({ binding }: { binding: SessionBinding }) {
  const pressure = useSource(binding.session.projections.faceOf('contextPressure'))
  const breakdown = useSource(binding.session.projections.faceOf('contextBreakdown'))
  const parts = CONTEXT_PARTS.flatMap((part) => {
    const count: unknown =
      breakdown && typeof breakdown === 'object' ? Reflect.get(breakdown, part.key) : undefined
    return typeof count === 'number' && Number.isFinite(count) && count >= 0
      ? [{ ...part, tokens: count }]
      : []
  })
  const capacity =
    pressure &&
    typeof pressure === 'object' &&
    'contextWindow' in pressure &&
    typeof pressure.contextWindow === 'number'
      ? pressure.contextWindow
      : undefined
  const tokens =
    pressure && typeof pressure === 'object'
      ? 'projectedTokens' in pressure && typeof pressure.projectedTokens === 'number'
        ? pressure.projectedTokens
        : 'pressureTokens' in pressure && typeof pressure.pressureTokens === 'number'
          ? pressure.pressureTokens
          : undefined
      : undefined
  const percent =
    capacity && tokens !== undefined
      ? Math.min(100, Math.max(0, Math.round((tokens / capacity) * 100)))
      : undefined
  const total = parts.reduce((sum, part) => sum + part.tokens, 0)
  // Like DSH, color the occupied portion by composition without replacing the provider-anchored total.
  const segments =
    percent === undefined || percent === 0
      ? []
      : parts.length === 3 && total > 0
        ? parts
            .map((part) => ({ ...part, width: (percent * part.tokens) / total }))
            .filter((part) => part.width > 0)
        : [{ key: 'total', color: c.colorSystem, width: percent }]
  return (
    <ControlPopover
      label="上下文用量"
      className={c.contextTrigger}
      panelClassName={c.contextPanel}
      title={percent === undefined ? '上下文用量' : `上下文已用 ${percent}%`}
      trigger={
        <>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={c.contextRing}
          >
            <circle cx="10" cy="10" r="7" className={c.ringTrack} />
            {percent !== undefined && (
              <circle
                cx="10"
                cy="10"
                r="7"
                pathLength="100"
                strokeDasharray={`${percent} 100`}
                className={c.ringFill}
              />
            )}
          </svg>
          {percent !== undefined && <span>{percent}%</span>}
        </>
      }
    >
      {() => (
        <>
          <div className={c.contextHeader}>
            <span className={c.contextHeadline}>上下文已用</span>
            <span className={c.contextPercent}>{percent === undefined ? '—' : `${percent}%`}</span>
            {tokens !== undefined && capacity !== undefined && (
              <span
                className={c.contextFigures}
              >{`~${formatTokens(tokens)} / ${formatTokens(capacity)}`}</span>
            )}
          </div>
          {percent === undefined ? (
            <p className={c.empty}>暂未收到用量数据</p>
          ) : (
            <>
              <div className={c.contextBar} aria-hidden="true">
                {segments.map((segment) => (
                  <i
                    key={segment.key}
                    className={segment.color}
                    style={{ width: `${segment.width}%` }}
                  />
                ))}
              </div>
              {parts.length === 3 && (
                <dl className={c.contextRows}>
                  {parts.map((part) => (
                    <div key={part.key} className={c.contextRow} data-context-part={part.key}>
                      <dt>
                        <span className={`${c.swatch} ${part.color}`} aria-hidden="true" />
                        {part.label}
                      </dt>
                      <dd>{`~${formatTokens(part.tokens)}`}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </>
      )}
    </ControlPopover>
  )
}
