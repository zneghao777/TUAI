import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Header, Label, ListBox, Popover, Slider, Spinner } from '@heroui/react'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import { Icon } from './kit'

/** Product presentation over the same Session directory used by /model. */
export function ModelPicker({
  available,
  directory,
  load,
  select,
  locked,
}: ModelSelectInjected & {
  locked: boolean
}) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const [open, setOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [preview, setPreview] = useState<number>()
  const [error, setError] = useState('')
  const sliderInput = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useDismissOnOutsidePointer(trigger, open, setOpen, panel)
  const openRef = useRef(open)
  openRef.current = open
  const pending = useRef(false)
  const mounted = useRef(true)
  const switchButton = useRef<HTMLButtonElement>(null)
  const current = state.groups
    .find((g) => g.id === state.current?.provider)
    ?.models.find((m) => m.id === state.current?.model)
  const reasoning = current?.reasoning
  const effort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const levels = reasoning
    ? [
        ...(reasoning.defaultEffort === undefined ? [{ id: undefined, name: '提供商默认' }] : []),
        ...reasoning.efforts,
      ]
    : []
  const index = levels.findIndex((level) => level.id === effort)
  const label = levels[Math.round(preview ?? index)]?.name ?? state.retainedEffort
  const busy = state.pending !== null
  const listVisible = choosing || !current
  const groups = state.groups
  // Keys are opaque tuples, so provider/model IDs containing separators stay distinct.
  const keyOf = (provider: string, model: string) => JSON.stringify([provider, model])

  useLayoutEffect(() => {
    // The public thumb input ref lets categorical levels announce their Host label.
    sliderInput.current?.setAttribute('aria-valuetext', label ?? '提供商默认')
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    setPreview(undefined)
  }, [state.current?.provider, state.current?.model, effort])
  useEffect(() => {
    if (locked) setOpen(false)
  }, [locked])
  useEffect(() => {
    if (!open) return
    // A pending control may briefly lose focus; Escape still belongs to this overlay.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setPreview(undefined)
      requestAnimationFrame(() => trigger.current?.focus())
    }
    document.addEventListener('keydown', escape, true)
    return () => document.removeEventListener('keydown', escape, true)
  }, [open])
  useEffect(() => {
    if (!open) return
    if (!listVisible) switchButton.current?.focus()
  }, [open, listVisible])

  const submit = async (selection: ModelSelection) => {
    if (pending.current || locked) return
    const focused = document.activeElement
    pending.current = true
    setError('')
    try {
      const result = await select(selection)
      if (!mounted.current) return
      if (result?.ok) setChoosing(false)
      else
        setError(result ? `${result.error.code}: ${result.error.message}` : '当前会话无法切换模型')
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '切换未完成，请重试')
    } finally {
      pending.current = false
      if (mounted.current) {
        setPreview(undefined)
        requestAnimationFrame(() => {
          if (!mounted.current || !openRef.current || document.activeElement !== document.body)
            return
          if (
            focused instanceof HTMLElement &&
            focused.isConnected &&
            !focused.matches(':disabled')
          )
            focused.focus()
          else switchButton.current?.focus()
        })
      }
    }
  }
  const chooseEffort = (next: number | number[]) => {
    const snapped = Math.round(Array.isArray(next) ? next[0]! : next)
    const level = levels[snapped]
    if (!level || !state.current || level.id === effort) {
      setPreview(undefined)
      return
    }
    setPreview(snapped)
    void submit({
      provider: state.current.provider,
      model: state.current.model,
      ...(level.id === undefined ? {} : { reasoningEffort: level.id }),
    })
  }
  if (!available) return null
  return (
    <Popover
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next)
        setPreview(undefined)
        if (next) {
          setChoosing(false)
          setError('')
          load()
        }
      }}
    >
      <Button
        ref={trigger}
        variant="ghost"
        size="sm"
        className="tz-model-trigger"
        data-composer-model-trigger
        isDisabled={locked}
        aria-label={`选择模型，当前：${current?.name ?? '未选择'}${label ? `，${label}` : ''}`}
      >
        <span>{current?.name ?? (state.status === 'loading' ? '读取模型…' : '选择模型')}</span>
        {reasoning && label ? <span className="tz-model-effort">{label}</span> : null}
        {busy ? <Spinner size="sm" aria-label="正在切换模型" /> : <Icon name="chevron" />}
      </Button>
      <Popover.Content placement="top end" offset={10} className="tz-model-popover" isNonModal>
        <Popover.Dialog
          ref={panel}
          data-shortcut-modal="model"
          aria-label="模型与推理强度"
          className="tz-model-dialog"
          aria-busy={busy}
        >
          {listVisible ? (
            <>
              <ListBox
                aria-label="模型"
                className="tz-model-list"
                selectionMode="single"
                autoFocus
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  if (keys === 'all') return
                  const key = [...keys][0]
                  for (const group of groups)
                    for (const model of group.models) {
                      if (keyOf(group.id, model.id) !== key) continue
                      void submit({
                        provider: group.id,
                        model: model.id,
                        ...(model.reasoning?.defaultEffort === undefined
                          ? {}
                          : { reasoningEffort: model.reasoning.defaultEffort }),
                      })
                    }
                }}
                selectedKeys={
                  state.current ? [keyOf(state.current.provider, state.current.model)] : []
                }
                disabledKeys={
                  busy ? groups.flatMap((g) => g.models.map((m) => keyOf(g.id, m.id))) : []
                }
                renderEmptyState={() =>
                  state.status === 'loading' ? '正在读取模型…' : '暂无可用模型'
                }
              >
                {groups.map((group) => (
                  <ListBox.Section key={group.id}>
                    <Header>{group.name}</Header>
                    {group.models.map((model) => (
                      <ListBox.Item
                        key={keyOf(group.id, model.id)}
                        id={keyOf(group.id, model.id)}
                        textValue={model.name}
                      >
                        <Label>{model.name}</Label>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox.Section>
                ))}
              </ListBox>
            </>
          ) : (
            <>
              <div className="tz-model-heading">
                <div className="tz-model-identity">
                  {reasoning ? <strong aria-live="polite">{label ?? '提供商默认'}</strong> : null}
                  <Button
                    ref={switchButton}
                    variant="ghost"
                    className="tz-model-name"
                    aria-label="切换模型"
                    isDisabled={busy}
                    onPress={() => setChoosing(true)}
                  >
                    <span>{current.name}</span>
                    <Icon name="right" />
                  </Button>
                </div>
                {reasoning ? (
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label="恢复默认推理强度"
                    isDisabled={busy || state.current?.reasoningEffort === undefined}
                    onPress={() => {
                      if (state.current)
                        void submit({
                          provider: state.current.provider,
                          model: state.current.model,
                        })
                    }}
                  >
                    <Icon name="reset" />
                  </Button>
                ) : null}
              </div>
              {levels.length > 1 ? (
                <div
                  onKeyDownCapture={(event) => {
                    if (
                      event.nativeEvent.isComposing ||
                      busy ||
                      event.altKey ||
                      event.metaKey ||
                      event.ctrlKey
                    )
                      return
                    const changes: Record<string, number> = {
                      ArrowLeft: -1,
                      ArrowDown: -1,
                      ArrowRight: 1,
                      ArrowUp: 1,
                      PageDown: -1,
                      PageUp: 1,
                    }
                    if (!(event.key in changes) && event.key !== 'Home' && event.key !== 'End')
                      return
                    event.preventDefault()
                    event.stopPropagation()
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? levels.length - 1
                          : Math.max(
                              0,
                              Math.min(
                                levels.length - 1,
                                Math.round(preview ?? index) + changes[event.key]!,
                              ),
                            )
                    chooseEffort(next)
                  }}
                >
                  <Slider
                    aria-label="推理强度"
                    className="tz-effort-slider"
                    minValue={0}
                    maxValue={levels.length - 1}
                    step={0.01}
                    value={preview ?? Math.max(0, index)}
                    isDisabled={busy}
                    onChange={(value) => setPreview(Array.isArray(value) ? value[0] : value)}
                    onChangeEnd={chooseEffort}
                  >
                    <Slider.Track>
                      <Slider.Fill />
                      <Slider.Thumb inputRef={sliderInput} />
                    </Slider.Track>
                    <div className="tz-effort-stops" aria-hidden="true">
                      {levels.map((level, at) => (
                        <span
                          key={level.id ?? 'default'}
                          data-active={at === Math.round(preview ?? index)}
                        >
                          {level.name}
                        </span>
                      ))}
                    </div>
                  </Slider>
                </div>
              ) : null}
            </>
          )}
          {state.status === 'loading' ? (
            <div role="status" className="tz-model-status">
              <Spinner size="sm" />
              正在刷新模型
            </div>
          ) : null}
          {error || state.error || state.failures.length ? (
            <div role="alert" className="tz-model-error">
              <span>
                {error ||
                  state.error ||
                  state.failures.map((f) => `${f.name}：${f.message}`).join('；')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setError('')
                  load()
                }}
              >
                重新加载
              </Button>
            </div>
          ) : null}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
