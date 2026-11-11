import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { Select } from './Select'
import { ContextControl, ModelControl } from './ComposerControls'
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
const permissionDescriptions: Record<string, string> = {
  readonly: '查看文件，执行命令时询问',
  'workspace-write': '允许修改当前工作区',
  'full-access': '允许工作区外操作，不再逐项询问',
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
export function Composer({
  client,
  binding,
  onModels,
}: {
  client: AppClient
  binding: SessionBinding
  onModels(): void
}) {
  const facts = useSource(client.facts),
    state = useSource(binding.session),
    connection = useSource(client.connection.state)
  const key = `tianzhiai:draft:v1:${facts.host?.id}:${binding.sessionId}`
  const [draft, setDraft] = useState(() => restore(key))
  const [files, setFiles] = useState<Attachment[]>(() => restoreAttachments(key))
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const [configuring, setConfiguring] = useState(false)
  const configuringRef = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null),
    picker = useRef<HTMLInputElement>(null),
    filesRef = useRef(files)
  filesRef.current = files
  const fitInput = () => {
    const element = input.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }
  useLayoutEffect(fitInput, [draft.text])
  useEffect(() => {
    const element = input.current
    if (!element) return
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return
      width = element.clientWidth
      fitInput()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
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
        setMessage('')
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
      configuringRef.current ||
      !available.some((m) => `${m.provider}/${m.id}` === selected) ||
      connection !== 'connected' ||
      files.some((f) => f.status !== 'ready') ||
      (!draft.text.trim() && !files.length && !draft.pending)
    )
      return
    setBusy(true)
    setMessage('正在发送…')
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
      setMessage('')
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
      setMessage('已请求停止；队列保留，已执行的操作不会撤销。')
    } catch (error) {
      setMessage(describe(error))
    } finally {
      setBusy(false)
    }
  }
  const catalog = facts.catalog,
    available =
      catalog?.groups.flatMap((g) => g.models.map((m) => ({ provider: g.id, ...m }))) ?? []
  const permissions = useSource(binding.session.projections.faceOf('permissions'))
  const permissionValue =
    permissions && typeof permissions === 'object' && 'currentValue' in permissions
      ? permissions.currentValue
      : undefined
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
  const notice =
    message ||
    catalog?.failures.map((f) => `${f.name}：${f.message}`).join('；') ||
    (available.length && !available.some((m) => `${m.provider}/${m.id}` === selected)
      ? '当前模型不可用，请选择模型后发送'
      : '') ||
    (draft.pending
      ? '发送结果待确认，草稿已保留，可重试'
      : connection !== 'connected'
        ? '连接恢复后将核对已接受输入，草稿已保留'
        : '')
  const sendLabel = draft.pending ? '重试本次输入' : state.running ? '排队发送' : '发送消息'
  const configure = async (action: () => Promise<void>) => {
    if (configuringRef.current) return false
    configuringRef.current = true
    setConfiguring(true)
    try {
      await action()
      setMessage('')
      return true
    } catch (error) {
      setMessage(describe(error))
      return false
    } finally {
      configuringRef.current = false
      setConfiguring(false)
    }
  }
  return (
    <div className={s.composerArea} data-composer>
      {state.running ? (
        <div className={s.executionControls}>
          <Button
            onClick={() => void stop()}
            busy={busy}
            disabled={connection !== 'connected'}
            aria-label="停止当前执行"
            title="停止当前执行，保留排队消息"
          >
            <Icon name="stop" />
            停止
          </Button>
          <Button
            disabled={
              busy ||
              configuring ||
              connection !== 'connected' ||
              (!draft.text.trim() && !files.length)
            }
            onClick={() => void send('steer')}
            aria-label="插话到下一步"
            title="插话到下一步（⌘/Ctrl+Enter）"
          >
            插话
          </Button>
        </div>
      ) : null}
      <div className={s.composer} data-composer-surface>
        {files.length ? (
          <ul className={s.attachments}>
            {files.map((file) => (
              <li
                key={file.id}
                data-upload-state={file.status}
                aria-label={`${file.name} · ${file.status === 'ready' ? '已上传，尚未发送' : file.status === 'error' ? '上传失败' : '上传中'}`}
              >
                <Icon name="paperclip" />
                <span>
                  {file.name}
                  {file.status !== 'ready' ? (
                    <small role="status">{file.status === 'error' ? '上传失败' : '上传中…'}</small>
                  ) : null}
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
          placeholder="输入消息…"
          title="Enter 发送 · Shift+Enter 换行 · ⌘/Ctrl+Enter 插话"
          value={draft.text}
          readOnly={Boolean(draft.pending)}
          onChange={(e) => setDraft({ text: e.target.value })}
          rows={1}
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
          <div className={s.composerOptions}>
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
              className={s.composerIcon}
              title="从当前设备上传文件或图片"
              aria-label="添加附件"
              disabled={busy || Boolean(draft.pending)}
              onClick={() => picker.current?.click()}
            >
              <Icon name="paperclip" />
            </Button>
            {Boolean(permissions) && (
              <Select
                label="权限"
                compact
                icon={<Icon name="shield" />}
                value={typeof permissionValue === 'string' ? permissionValue : ''}
                disabled={
                  connection !== 'connected' ||
                  busy ||
                  configuring ||
                  !facts.permissions?.options.length
                }
                placeholder="权限"
                options={
                  facts.permissions?.options.map((option) => ({
                    value: option.value,
                    label: option.name,
                    detail: option.description ?? permissionDescriptions[option.value],
                  })) ?? []
                }
                onChange={(value) => {
                  if (
                    value === permissionValue ||
                    !facts.permissions?.options.some((option) => option.value === value)
                  )
                    return
                  void configure(async () => {
                    const result = unwrap(await binding.session.command(`/permission ${value}`))
                    if (!result.matched) throw new Error('当前 Host 不支持切换权限')
                  })
                }}
              />
            )}
          </div>
          <div className={s.sendGroup}>
            <ContextControl binding={binding} />
            <ModelControl
              catalog={catalog}
              selected={selected}
              effort={effort}
              disabled={connection !== 'connected' || busy}
              onManage={onModels}
              onChange={(value, reasoningEffort) =>
                configure(async () => {
                  const [provider, ...rest] = value.split('/')
                  unwrap(
                    await client.ctx.remote.session.selectModel({
                      sessionId: binding.sessionId,
                      provider,
                      model: rest.join('/'),
                      ...(reasoningEffort ? { reasoningEffort } : {}),
                    }),
                  )
                })
              }
            />
            <Button
              className={`${s.primary} ${s.composerIcon} ${s.sendButton}`}
              busy={busy}
              disabled={
                connection !== 'connected' ||
                configuring ||
                !available.some((m) => `${m.provider}/${m.id}` === selected) ||
                (!draft.text.trim() && !files.length) ||
                files.some((f) => f.status !== 'ready')
              }
              onClick={() => void send('queue')}
              aria-label={sendLabel}
              title={`${sendLabel}（Enter）`}
            >
              <Icon name="send" />
            </Button>
          </div>
        </div>
      </div>
      {notice ? (
        <div className={s.composerHint} role="status">
          {notice}
        </div>
      ) : null}
    </div>
  )
}
