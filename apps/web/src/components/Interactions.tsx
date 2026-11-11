import { useId, useState } from 'react'
import type { AskUserQuestionAnswerItem } from '@deepseek-ai/dsh-user-questions/types'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import { brandString } from '@deepseek-ai/dsh-brand'
import { AppClient, describe, unwrap, type Interaction } from '../model/client'
import { useSource } from '../bindings'
import { Button, SafeMarkdown } from './kit'
import s from '../App.module.css'
export function Waiting({ client, binding }: { client: AppClient; binding: SessionBinding }) {
  const all = useSource(client.interactions)
  return (
    <>
      {all
        .filter((i) => i.sessionId === binding.sessionId)
        .map((item) => (
          <InteractionCard
            key={item.id}
            item={item}
            stop={async () => {
              unwrap(await binding.session.cancel())
            }}
          />
        ))}
    </>
  )
}
function InteractionCard({ item, stop }: { item: Interaction; stop: () => Promise<void> }) {
  const formId = useId()
  const [answers, setAnswers] = useState<Record<string, AskUserQuestionAnswerItem>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  return (
    <section
      className={s.interaction}
      aria-label={item.kind === 'approval' ? '操作审批' : '用户问题'}
    >
      <h3>{item.kind === 'approval' ? `确认执行 ${item.title}` : item.title}</h3>
      {item.detail ? <SafeMarkdown text={item.detail} /> : null}
      {item.kind === 'question' ? (
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault()
            const values =
              item.questions?.map((q) => answers[q.id] ?? { id: q.id, selected: [] }) ?? []
            if (values.some((v) => !v.selected.length && !v.custom?.trim())) {
              setError('请回答每个问题，或取消当前执行')
              return
            }
            item.answer({ answers: values })
          }}
        >
          {item.questions?.map((q) => (
            <fieldset key={q.id}>
              <legend>{q.question}</legend>
              {q.detail ? <SafeMarkdown text={q.detail} /> : null}
              {q.options?.map((o) => (
                <label key={o.label} className={s.option}>
                  <input
                    type={q.multiSelect ? 'checkbox' : 'radio'}
                    name={q.id}
                    checked={answers[q.id]?.selected.includes(o.label) ?? false}
                    onChange={(e) =>
                      setAnswers((a) => ({
                        ...a,
                        [q.id]: {
                          ...a[q.id],
                          id: q.id,
                          selected: q.multiSelect
                            ? e.target.checked
                              ? [...(a[q.id]?.selected ?? []), o.label]
                              : (a[q.id]?.selected ?? []).filter((v) => v !== o.label)
                            : [o.label],
                        },
                      }))
                    }
                  />
                  <span>
                    {o.label}
                    {o.description ? <small>{o.description}</small> : null}
                  </span>
                </label>
              ))}
              {q.intent?.kind !== 'approval' ? (
                <label className={s.freeAnswer}>
                  自由输入
                  <input
                    aria-label={`${q.question} 自由输入`}
                    value={answers[q.id]?.custom ?? ''}
                    onChange={(e) =>
                      setAnswers((a) => ({
                        ...a,
                        [q.id]: {
                          id: q.id,
                          selected: q.multiSelect ? (a[q.id]?.selected ?? []) : [],
                          custom: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ) : null}
            </fieldset>
          ))}
        </form>
      ) : null}
      <div className={s.interactionActions}>
        {item.kind === 'question' ? (
          <Button className={s.primary} type="submit" form={formId}>
            提交回答
          </Button>
        ) : (
          <>
            <Button className={s.primary} onClick={() => item.answer('allowed-once')}>
              仅允许本次
            </Button>
            <Button onClick={() => item.answer('rejected')}>拒绝</Button>
          </>
        )}
        <Button
          busy={busy}
          onClick={() => {
            setBusy(true)
            void stop()
              .catch((e) => setError(describe(e)))
              .finally(() => setBusy(false))
          }}
        >
          取消当前执行
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
export function queuedItems(
  value: unknown,
  target: 'next-turn' | 'next-step' = 'next-turn',
): { id: MessageId; text: string; requestId?: string }[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !(target in value) ||
    !Array.isArray(Reflect.get(value, target))
  )
    return []
  const messages: unknown[] = Reflect.get(value, target)
  return messages.flatMap((m: unknown) => {
    if (
      !m ||
      typeof m !== 'object' ||
      !('id' in m) ||
      typeof m.id !== 'string' ||
      !('content' in m) ||
      !Array.isArray(m.content)
    )
      return []
    return [
      {
        id: brandString<MessageId>(m.id),
        text: m.content
          .flatMap((b: unknown) =>
            b &&
            typeof b === 'object' &&
            'type' in b &&
            b.type === 'text' &&
            'text' in b &&
            typeof b.text === 'string'
              ? [b.text]
              : [],
          )
          .join('\n'),
        ...('source' in m &&
        m.source &&
        typeof m.source === 'object' &&
        'rpcId' in m.source &&
        typeof m.source.rpcId === 'string'
          ? { requestId: m.source.rpcId }
          : {}),
      },
    ]
  })
}
export function Queue({ binding }: { binding: SessionBinding }) {
  const inbox = useSource(binding.session.projections.faceOf('inbox'))
  const rows = queuedItems(inbox)
  const steering = queuedItems(inbox, 'next-step')
  const [editing, setEditing] = useState<string>(),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const act = async (id: MessageId, kind: 'edit' | 'remove' | 'steer') => {
    setBusy(true)
    try {
      unwrap(
        await binding.session.updateQueue(
          id,
          kind === 'edit' ? { kind, content: [{ type: 'text', text }] } : { kind },
        ),
      )
      setEditing(undefined)
    } catch (e) {
      setError(describe(e))
    } finally {
      setBusy(false)
    }
  }
  if (!rows.length && !steering.length && !error) return null
  return (
    <section className={s.queue} aria-label="待发送消息">
      {steering.map((row) => (
        <div className={s.queueRow} key={row.id}>
          <span>下一步插话 · {row.text || '附件消息'}</span>
          <Button disabled={busy} onClick={() => void act(row.id, 'remove')}>
            移除插话
          </Button>
        </div>
      ))}
      {rows.map((row) => (
        <div className={s.queueRow} key={row.id}>
          {editing === row.id ? (
            <>
              <input
                aria-label="编辑排队消息"
                title="保存会将此条消息替换为纯文本；原附件不会随新文本发送"
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Escape') setEditing(undefined)
                }}
              />
              <div className={s.queueActions}>
                <Button disabled={busy || !text.trim()} onClick={() => void act(row.id, 'edit')}>
                  保存纯文本
                </Button>
                <Button onClick={() => setEditing(undefined)}>取消</Button>
              </div>
            </>
          ) : (
            <>
              <span>排队中 · {row.text || '附件消息'}</span>
              <div className={s.queueActions}>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(row.id)
                    setText(row.text)
                  }}
                >
                  编辑
                </Button>
                <Button disabled={busy} onClick={() => void act(row.id, 'remove')}>
                  移除
                </Button>
                <Button disabled={busy} onClick={() => void act(row.id, 'steer')}>
                  插话
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
