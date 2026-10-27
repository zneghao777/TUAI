import { useEffect, useRef, useState } from 'react'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  PromptContentPart,
  SessionRequestId,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type { FileUploadReceiptId } from '@deepseek-ai/dsh-client-file-upload/client'
import { brandString } from '@deepseek-ai/dsh-brand'
import { useSource } from '../bindings'
import { AppClient, describe, unwrap } from '../model/client'
import { Button, Icon } from './kit'
import s from '../App.module.css'
import { queuedItems } from './Interactions'
interface Attachment {
  id: string
  name: string
  file?: File
  receipt?: FileUploadReceiptId
  status: 'uploading' | 'ready' | 'error'
  error?: string
  progress?: number
  abort: AbortController
}
interface Pending {
  id: SessionRequestId
  text: string
  mode: 'queue' | 'steer'
  receipts: FileUploadReceiptId[]
}
function restore(key: string): { text: string; pending?: Pending } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!raw || typeof raw !== 'object' || !('text' in raw) || typeof raw.text !== 'string')
      return { text: '' }
    if ('pending' in raw) {
      const p = raw.pending
      if (
        p &&
        typeof p === 'object' &&
        'id' in p &&
        typeof p.id === 'string' &&
        'text' in p &&
        typeof p.text === 'string' &&
        'mode' in p &&
        (p.mode === 'queue' || p.mode === 'steer') &&
        'receipts' in p &&
        Array.isArray(p.receipts) &&
        p.receipts.every((r) => typeof r === 'string')
      )
        return {
          text: raw.text,
          pending: {
            id: brandString<SessionRequestId>(p.id),
            text: p.text,
            mode: p.mode,
            receipts: p.receipts.map((r) => brandString<FileUploadReceiptId>(r)),
          },
        }
    }
    return { text: raw.text }
  } catch {
    return { text: '' }
  }
}
function restoreAttachments(key: string): Attachment[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(`${key}:uploads`) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item: unknown) => {
      if (
        !item ||
        typeof item !== 'object' ||
        !('name' in item) ||
        typeof item.name !== 'string' ||
        !('id' in item) ||
        typeof item.id !== 'string'
      )
        return []
      return [
        {
          id: item.id,
          name: item.name,
          abort: new AbortController(),
          ...('receipt' in item && typeof item.receipt === 'string'
            ? { receipt: brandString<FileUploadReceiptId>(item.receipt), status: 'ready' as const }
            : { status: 'error' as const, error: '上传未完成，请移除此项并重新选择文件' }),
        },
      ]
    })
  } catch {
    return []
  }
}
export function Composer({ client, binding }: { client: AppClient; binding: SessionBinding }) {
  const facts = useSource(client.facts),
    state = useSource(binding.session),
    connection = useSource(client.connection.state)
  const key = `tianzhiai:draft:v1:${facts.host?.id}:${binding.sessionId}`
  const [draft, setDraft] = useState(() => restore(key))
  const [files, setFiles] = useState<Attachment[]>(() => restoreAttachments(key))
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const input = useRef<HTMLTextAreaElement>(null),
    picker = useRef<HTMLInputElement>(null),
    filesRef = useRef(files)
  filesRef.current = files
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft))
    } catch {
      setMessage('浏览器无法保存草稿，请勿关闭此页')
    }
  }, [key, draft])
  useEffect(() => {
    try {
      localStorage.setItem(
        `${key}:uploads`,
        JSON.stringify(files.map(({ id, name, receipt }) => ({ id, name, receipt }))),
      )
    } catch {
      setMessage('无法保存附件草稿，请保持此页面打开')
    }
  }, [files, key])
  useEffect(
    () => () => {
      for (const file of filesRef.current) file.abort.abort()
    },
    [],
  )
  useEffect(() => {
    if (!draft.pending) return
    const pending = draft.pending
    const reconcile = () => {
      const durable = binding.eventSource
        .getSnapshot()
        .entries.some(
          ({ event }) =>
            event.type === 'user/message' &&
            'rpcId' in event.data.source &&
            event.data.source.rpcId === pending.id,
        )
      const inbox = binding.session.projections.faceOf('inbox').getSnapshot()
      const queued = [...queuedItems(inbox), ...queuedItems(inbox, 'next-step')].some(
        (item) => item.requestId === pending.id,
      )
      if (durable || queued) {
        setFiles([])
        setDraft((d) =>
          d.pending?.id === pending.id ? { text: d.text === pending.text ? '' : d.text } : d,
        )
        setMessage('输入已接受；执行结果以会话记录为准')
      }
    }
    reconcile()
    const a = binding.eventSource.subscribe(reconcile),
      b = binding.session.projections.faceOf('inbox').subscribe(reconcile)
    return () => {
      a()
      b()
    }
  }, [binding, draft.pending])
  const upload = async (item: Attachment) => {
    if (!item.file) return
    setFiles((all) =>
      all.map((f) => (f.id === item.id ? { ...f, status: 'uploading', error: undefined } : f)),
    )
    try {
      const media = item.file.type
      const result =
        media === 'image/png' ||
        media === 'image/jpeg' ||
        media === 'image/webp' ||
        media === 'image/gif'
          ? await client.ctx.fileUpload.uploadImage(
              binding.sessionId,
              item.file,
              media,
              item.name,
              item.abort.signal,
              (p) =>
                setFiles((all) =>
                  all.map((f) =>
                    f.id === item.id
                      ? { ...f, progress: p.total ? p.loaded / p.total : undefined }
                      : f,
                  ),
                ),
            )
          : await client.ctx.fileUpload.upload(
              binding.sessionId,
              item.file,
              item.name,
              item.abort.signal,
            )
      if (!result.ok) throw new Error(result.error.message)
      const value = result.value
      setFiles((all) =>
        all.map((f) =>
          f.id === item.id ? { ...f, receipt: value.receiptId, status: 'ready' } : f,
        ),
      )
    } catch (error) {
      if (!item.abort.signal.aborted)
        setFiles((all) =>
          all.map((f) =>
            f.id === item.id ? { ...f, status: 'error', error: describe(error) } : f,
          ),
        )
    }
  }
  const attach = (selection: FileList | null) => {
    if (!selection) return
    const added = Array.from(selection).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      file,
      status: 'uploading' as const,
      abort: new AbortController(),
    }))
    setFiles((all) => [...all, ...added])
    for (const file of added) void upload(file)
  }
  const send = async (mode: 'queue' | 'steer') => {
    if (
      busy ||
      connection !== 'connected' ||
      files.some((f) => f.status !== 'ready') ||
      (!draft.text.trim() && !files.length && !draft.pending)
    )
      return
    setBusy(true)
    setMessage('正在提交输入…')
    const submission = draft.pending
      ? undefined
      : binding.session.beginSubmission({ mode, text: draft.text, attachments: [] })
    const pending = draft.pending ?? {
      id: submission!.requestId,
      text: draft.text,
      mode,
      receipts: files.flatMap((f) => (f.receipt ? [f.receipt] : [])),
    }
    setDraft((d) => ({ ...d, pending }))
    try {
      localStorage.setItem(key, JSON.stringify({ ...draft, pending }))
    } catch {
      submission?.abandon()
      setBusy(false)
      setMessage('无法持久化本次输入，请启用浏览器存储后重试')
      return
    }
    const content: PromptContentPart[] = [
      ...(pending.text.trim() ? [{ type: 'text' as const, text: pending.text }] : []),
      ...pending.receipts.map((receiptId) => ({ type: 'file' as const, receiptId })),
    ]
    try {
      const result = await binding.session.prompt(
        content,
        pending.mode,
        AbortSignal.timeout(30000),
        pending.id,
      )
      if (!result.ok) {
        if (
          ['session/attachment-invalid', 'session/agent-busy', 'gateway/bad-request'].includes(
            result.error.code,
          )
        ) {
          setDraft({ text: pending.text })
          setMessage(`${describe(result.error)}。Host 已拒绝，请编辑后重新提交。`)
          return
        }
        throw result.error
      }
      setDraft((d) => ({ text: d.text === pending.text ? '' : d.text }))
      setFiles([])
      setMessage(
        pending.mode === 'steer'
          ? '下一步插话已接受；处理结果以会话记录为准'
          : '输入已接受；执行结果以会话记录为准',
      )
      input.current?.focus()
    } catch (error) {
      setMessage(`${describe(error)}。已保留本次请求身份，重试不会创建另一条输入。`)
    } finally {
      setBusy(false)
    }
  }
  const stop = async () => {
    setBusy(true)
    try {
      unwrap(await binding.session.cancel())
      setMessage('停止请求已接受；当前状态以会话记录为准。队列仍保留，已发生的操作不会撤销。')
    } catch (error) {
      setMessage(describe(error))
    } finally {
      setBusy(false)
    }
  }
  const catalog = facts.catalog,
    available =
      catalog?.groups.flatMap((g) => g.models.map((m) => ({ provider: g.id, ...m }))) ?? []
  const model = useSource(binding.session.projections.faceOf('modelSelection'))
  const selected =
    typeof model === 'object' &&
    model &&
    'next' in model &&
    model.next &&
    typeof model.next === 'object' &&
    'provider' in model.next &&
    'model' in model.next
      ? `${model.next.provider}/${model.next.model}`
      : catalog
        ? `${catalog.default.provider}/${catalog.default.model}`
        : ''
  const reasoning = available.find((m) => `${m.provider}/${m.id}` === selected)?.reasoning
  const effort =
    typeof model === 'object' &&
    model &&
    'next' in model &&
    model.next &&
    typeof model.next === 'object' &&
    'reasoningEffort' in model.next &&
    typeof model.next.reasoningEffort === 'string'
      ? model.next.reasoningEffort
      : ''
  return (
    <div className={s.composerArea}>
      <div className={s.composer}>
        {files.length ? (
          <ul className={s.attachments}>
            {files.map((file) => (
              <li key={file.id}>
                <Icon name="paperclip" />
                <span>
                  {file.name} ·{' '}
                  {file.status === 'ready'
                    ? '已上传，尚未发送'
                    : file.status === 'error'
                      ? '上传失败'
                      : '上传中'}
                  {file.error ? <small>{file.error}</small> : null}
                </span>
                {file.status === 'error' && file.file ? (
                  <Button onClick={() => void upload(file)}>重试上传</Button>
                ) : null}
                <Button
                  aria-label={`移除 ${file.name}`}
                  onClick={() => {
                    file.abort.abort()
                    setFiles((all) => all.filter((f) => f.id !== file.id))
                  }}
                >
                  <Icon name="close" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={input}
          aria-label="消息"
          placeholder={
            state.blank ? '描述你的目标，或把资料交给我…' : '输入后续问题，或补充新的要求…'
          }
          value={draft.text}
          readOnly={Boolean(draft.pending)}
          onChange={(e) => setDraft({ text: e.target.value })}
          rows={3}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              attach(e.clipboardData.files)
            }
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(e.metaKey || e.ctrlKey ? 'steer' : 'queue')
            }
          }}
        />
        <div className={s.composerTools}>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              attach(e.target.files)
              e.target.value = ''
            }}
          />
          <Button
            title="从当前设备上传文件或图片"
            aria-label="添加附件"
            disabled={busy || Boolean(draft.pending)}
            onClick={() => picker.current?.click()}
          >
            <Icon name="paperclip" />
          </Button>
          <label className={s.selectWrap}>
            <span className={s.srOnly}>模型</span>
            <select
              aria-label="模型"
              value={selected}
              disabled={connection !== 'connected' || busy}
              onChange={(e) => {
                const [provider, ...rest] = e.target.value.split('/')
                void client.ctx.remote.session
                  .selectModel({ sessionId: binding.sessionId, provider, model: rest.join('/') })
                  .then(unwrap)
                  .catch((error) => setMessage(describe(error)))
              }}
            >
              {!available.length ? (
                <option value={selected}>暂无可用模型</option>
              ) : (
                available.map((m) => (
                  <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                    {m.name}
                  </option>
                ))
              )}
            </select>
          </label>
          {reasoning ? (
            <select
              aria-label="推理强度"
              value={effort}
              disabled={connection !== 'connected'}
              onChange={(e) => {
                const [provider, ...rest] = selected.split('/')
                void client.ctx.remote.session
                  .selectModel({
                    sessionId: binding.sessionId,
                    provider,
                    model: rest.join('/'),
                    ...(e.target.value ? { reasoningEffort: e.target.value } : {}),
                  })
                  .then(unwrap)
                  .catch((error) => setMessage(describe(error)))
              }}
            >
              <option value="">默认推理</option>
              {reasoning.efforts.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : null}
          <span className={s.permission} title={facts.permissions?.options[0]?.description}>
            {facts.permissions?.options.find((p) => p.value === facts.permissions?.defaultPreset)
              ?.name ?? '读取权限中'}
          </span>
          <div className={s.sendGroup}>
            {state.running ? (
              <>
                <Button onClick={() => void stop()} busy={busy} aria-label="停止当前执行">
                  <Icon name="stop" />
                  停止
                </Button>
                <Button
                  disabled={busy || connection !== 'connected'}
                  onClick={() => void send('steer')}
                >
                  插话到下一步
                </Button>
              </>
            ) : null}
            <Button
              className={s.primary}
              busy={busy}
              disabled={
                connection !== 'connected' ||
                !available.length ||
                (!draft.text.trim() && !files.length) ||
                files.some((f) => f.status !== 'ready')
              }
              onClick={() => void send('queue')}
              aria-label={draft.pending ? '重试本次输入' : state.running ? '排队发送' : '发送消息'}
            >
              {state.running ? '排队发送' : draft.pending ? '重试' : '发送'}
              <Icon name="send" />
            </Button>
          </div>
        </div>
      </div>
      <div className={s.composerHint} role="status">
        {message ||
          (draft.pending
            ? '上次提交结果待核对，可用同一请求重试'
            : connection !== 'connected'
              ? '连接恢复后将核对已接受输入，草稿已保留'
              : 'Enter 发送 · Shift+Enter 换行 · ⌘/Ctrl+Enter 插话')}
      </div>
    </div>
  )
}
