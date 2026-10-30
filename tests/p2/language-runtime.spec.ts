import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { LanguageRuntime } from '../../apps/web/src/model/language'

describe('language preference', () => {
  function setup() {
    let active = 'zh'
    let value: { preference?: string } = {}
    let writable = true
    const listeners = new Set<() => void>()
    const notify = () => {
      for (const listener of listeners) listener()
    }
    const form = {
      getSnapshot: () => ({ status: 'ready', value, writable }),
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      set: vi.fn(async (_field: string, preference: string) => {
        value = { preference }
        notify()
        return true
      }),
    }
    const locale = {
      getSnapshot: () => ({ active }),
      setLocale: (next: string) => {
        active = next
      },
    }
    const ctx = { configForms: { get: () => form }, locale } as unknown as Context
    const runtime = new LanguageRuntime(ctx)
    return {
      form,
      locale,
      runtime,
      update: (next: typeof value) => {
        value = next
        notify()
      },
      lock: () => {
        writable = false
        notify()
      },
    }
  }

  it('adopts accepted changes and later Host updates', async () => {
    const { runtime, locale, update } = setup()
    await runtime.setLanguage('it')
    expect(locale.getSnapshot().active).toBe('it')
    update({ preference: 'en' })
    expect(locale.getSnapshot().active).toBe('en')
    runtime.dispose()
    update({ preference: 'zh' })
    expect(locale.getSnapshot().active).toBe('en')
  })

  it('keeps the accepted language on refusal and transport failure', async () => {
    const { runtime, locale, form } = setup()
    form.set.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline'))
    await runtime.setLanguage('en')
    expect(locale.getSnapshot().active).toBe('zh')
    expect(runtime.state.getSnapshot().error).toBe(true)
    await runtime.setLanguage('it')
    expect(locale.getSnapshot().active).toBe('zh')
    expect(runtime.state.getSnapshot().error).toBe(true)
    runtime.dispose()
  })

  it('does not write when the Host form is read only', async () => {
    const { runtime, form, lock } = setup()
    lock()
    await runtime.setLanguage('en')
    expect(form.set).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('does not publish after disposal while a write is pending', async () => {
    const { runtime, form, locale } = setup()
    let finish!: (accepted: boolean) => void
    form.set.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = runtime.setLanguage('it')
    runtime.dispose()
    finish(true)
    await pending
    expect(locale.getSnapshot().active).toBe('zh')
  })
})
