import { useEffect, useRef, useState } from 'react'
import type {
  ModelProviderDraft,
  ModelProviderInfo,
  ModelProvidersState,
} from '@tianzhiai/web-host/types'
import { AppClient, describe, unwrap } from '../model/client'
import { Button, Icon, Modal } from './kit'
import { Select } from './Select'
import s from '../App.module.css'

const emptyProvider = (): ModelProviderDraft => ({
  id: '',
  name: '',
  baseURL: '',
  models: [{ id: '', name: '' }],
})
/** DSH provider-list/add/edit interaction, rendered with Tianzhi's own UI kit. */
export function ModelSettings({
  client,
  onClose,
  onDisplay,
}: {
  client: AppClient
  onClose(): void
  onDisplay(): void
}) {
  const [data, setData] = useState<ModelProvidersState>(),
    [error, setError] = useState('')
  const [draft, setDraft] = useState<ModelProviderDraft>(),
    [editing, setEditing] = useState<ModelProviderInfo>()
  const [adding, setAdding] = useState(false),
    [key, setKey] = useState(''),
    [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false),
    [testMessage, setTestMessage] = useState(''),
    [testOk, setTestOk] = useState(false)
  const [deleting, setDeleting] = useState<ModelProviderInfo>()
  const firstInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let alive = true
    void client.ctx.remote.platform
      .modelProviders()
      .then(unwrap)
      .then((value) => {
        if (alive) setData(value)
      })
      .catch((e) => {
        if (alive) setError(describe(e))
      })
    return () => {
      alive = false
    }
  }, [client])
  useEffect(() => {
    if (draft) firstInput.current?.focus()
  }, [Boolean(draft), draft?.id === 'deepseek-official'])
  const clear = () => {
    setDraft(undefined)
    setEditing(undefined)
    setAdding(false)
    setKey('')
    setVisible(false)
    setTestMessage('')
    setError('')
    setDeleting(undefined)
  }
  const edit = (provider: ModelProviderInfo) => {
    clear()
    setEditing(provider)
    setDraft({
      id: provider.id,
      name: provider.name,
      baseURL: provider.baseURL,
      models: provider.models.map((m) => ({ ...m })),
    })
  }
  const official = data?.providers.find((p) => p.builtin)
  const builtin = draft?.id === 'deepseek-official'
  const ready =
    draft &&
    draft.name.trim() &&
    draft.id.trim() &&
    draft.baseURL.trim() &&
    draft.models.length &&
    draft.models.every((m) => m.id.trim() && m.name.trim()) &&
    (key.trim() || editing?.configured)
  const update = (next: ModelProviderDraft) => {
    setDraft(next)
    setTestMessage('')
  }
  const run = async (action: 'save' | 'test') => {
    if (!draft || !data || busy) return
    setBusy(true)
    setError('')
    setTestMessage('')
    const request = { provider: draft, ...(key.trim() ? { apiKey: key.trim() } : {}) }
    try {
      if (action === 'test') {
        const result = unwrap(await client.ctx.remote.platform.testModelProvider(request))
        setTestOk(result.ok)
        setTestMessage(`${result.message} · ${(result.latencyMs / 1000).toFixed(1)} 秒`)
      } else {
        const next = unwrap(
          await client.ctx.remote.platform.saveModelProvider({
            ...request,
            revision: data.revision,
          }),
        )
        setData(next)
        clear()
        await client.load()
      }
    } catch (e) {
      setError(describe(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="设置" onClose={onClose} className={s.settingsModal} busy={busy}>
      <div className={s.settingsLayout}>
        <nav className={s.settingsNav} aria-label="设置分类">
          <Button className={s.settingsSelected} aria-current="page">
            <Icon name="model" />
            模型
          </Button>
          <Button onClick={onDisplay} disabled={busy}>
            <Icon name="settings" />
            对话显示
          </Button>
        </nav>
        <section className={s.settingsContent} aria-label="模型管理">
          <div className={s.settingsHeading}>
            <h3>模型</h3>
            {draft ? (
              <Button onClick={clear} disabled={busy}>
                返回列表
              </Button>
            ) : null}
          </div>
          {!data ? <p role="status">{error ? '模型配置暂不可用' : '正在读取模型配置…'}</p> : null}
          {!draft && data ? (
            <>
              <div className={s.providerList}>
                {data.providers.map((provider) => (
                  <div className={s.providerRow} key={provider.id}>
                    <div className={s.providerIdentity}>
                      <strong>{provider.name}</strong>
                      <span className={s.providerState}>
                        <i className={provider.configured ? s.doneDot : s.inactiveDot} />
                        {provider.configured ? '已配置' : '未配置'}
                      </span>
                    </div>
                    <div className={s.providerActions}>
                      <Button onClick={() => edit(provider)}>编辑</Button>
                      {provider.configured || !provider.builtin ? (
                        <Button
                          aria-label={`移除 ${provider.name}`}
                          onClick={() => {
                            setDeleting(provider)
                            setError('')
                          }}
                        >
                          <Icon name="close" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {deleting ? (
                <div className={s.removeProvider} role="alert">
                  <p>
                    移除 {deleting.name}{' '}
                    的配置和已保存密钥？已有会话会保留，下次发送前需选择可用模型。
                  </p>
                  <Button disabled={busy} onClick={() => setDeleting(undefined)}>
                    取消
                  </Button>
                  <Button
                    busy={busy}
                    className={s.danger}
                    onClick={() => {
                      setBusy(true)
                      setError('')
                      void client.ctx.remote.platform
                        .removeModelProvider({ id: deleting.id, revision: data.revision })
                        .then(unwrap)
                        .then(async (next) => {
                          setData(next)
                          setDeleting(undefined)
                          await client.load()
                        })
                        .catch((e) => setError(describe(e)))
                        .finally(() => setBusy(false))
                    }}
                  >
                    确认移除
                  </Button>
                </div>
              ) : null}
              <Button
                className={s.addProvider}
                onClick={() => {
                  clear()
                  setAdding(true)
                  if (official && !official.configured) {
                    setEditing(official)
                    setDraft({
                      id: official.id,
                      name: official.name,
                      baseURL: official.baseURL,
                      models: official.models,
                    })
                  } else setDraft(emptyProvider())
                }}
              >
                <Icon name="plus" />
                添加模型提供商
              </Button>
            </>
          ) : null}
          {draft && data ? (
            <form
              className={s.providerForm}
              onSubmit={(e) => {
                e.preventDefault()
                void run('save')
              }}
            >
              {adding ? (
                <div className={s.field}>
                  <span>提供商</span>
                  <Select
                    label="提供商类型"
                    value={builtin ? 'official' : 'custom'}
                    disabled={busy}
                    options={[
                      ...(official && !official.configured
                        ? [{ value: 'official', label: 'DeepSeek' }]
                        : []),
                      { value: 'custom', label: '自定义 API' },
                    ]}
                    onChange={(value) => {
                      setKey('')
                      setError('')
                      setVisible(false)
                      if (value === 'official' && official) {
                        setEditing(official)
                        update({
                          id: official.id,
                          name: official.name,
                          baseURL: official.baseURL,
                          models: official.models,
                        })
                      } else {
                        setEditing(undefined)
                        update(emptyProvider())
                      }
                    }}
                  />
                </div>
              ) : (
                <h4 className={s.editorTitle}>{draft.name}</h4>
              )}
              {!builtin ? (
                <div className={s.fieldGrid}>
                  <label className={s.field}>
                    提供商标识
                    <input
                      ref={firstInput}
                      value={draft.id}
                      disabled={busy || Boolean(editing)}
                      required
                      placeholder="my-deepseek"
                      pattern="[a-z][a-z0-9]*(-[a-z0-9]+)*"
                      maxLength={64}
                      onChange={(e) => update({ ...draft, id: e.target.value })}
                    />
                  </label>
                  <label className={s.field}>
                    显示名称
                    <input
                      value={draft.name}
                      disabled={busy}
                      required
                      maxLength={100}
                      placeholder="我的模型服务"
                      onChange={(e) => update({ ...draft, name: e.target.value })}
                    />
                  </label>
                </div>
              ) : null}
              <label className={s.field}>
                API 地址
                <input
                  value={draft.baseURL}
                  disabled={busy || builtin}
                  type="url"
                  required
                  placeholder="https://api.example.com/anthropic"
                  onChange={(e) => update({ ...draft, baseURL: e.target.value })}
                />
              </label>
              {!builtin ? <small>DeepSeek Messages 兼容协议</small> : null}
              <label className={s.field}>
                API Key
                <div className={s.keyField}>
                  <input
                    ref={builtin ? firstInput : undefined}
                    aria-label="API Key"
                    value={key}
                    disabled={busy}
                    type={visible ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={4096}
                    placeholder={editing?.configured ? '已保存；留空保留原密钥' : '输入 API Key'}
                    onChange={(e) => {
                      setKey(e.target.value)
                      setTestMessage('')
                    }}
                  />
                  <Button
                    aria-label={visible ? '隐藏 API Key' : '显示 API Key'}
                    onClick={() => setVisible((v) => !v)}
                    type="button"
                    disabled={busy}
                  >
                    {visible ? '隐藏' : '显示'}
                  </Button>
                </div>
              </label>
              <div className={s.modelsHead}>
                <h4>模型列表</h4>
                {!builtin ? (
                  <Button
                    disabled={busy || draft.models.length >= 100}
                    onClick={() =>
                      update({ ...draft, models: [...draft.models, { id: '', name: '' }] })
                    }
                    type="button"
                  >
                    <Icon name="plus" />
                    添加模型
                  </Button>
                ) : null}
              </div>
              {draft.models.map((model, i) => (
                <div className={s.modelEntry} key={i}>
                  {builtin ? (
                    <div className={s.builtinModel}>
                      <span>{model.name}</span>
                      <small>{model.id}</small>
                    </div>
                  ) : (
                    <>
                      <div className={s.modelFields}>
                        <label className={s.field}>
                          模型 ID
                          <input
                            aria-label={`模型 ID ${i + 1}`}
                            required
                            value={model.id}
                            disabled={busy}
                            placeholder="deepseek-flash"
                            onChange={(e) =>
                              update({
                                ...draft,
                                models: draft.models.map((m, at) =>
                                  at === i ? { ...m, id: e.target.value } : m,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className={s.field}>
                          模型名称
                          <input
                            aria-label={`模型名称 ${i + 1}`}
                            required
                            value={model.name}
                            disabled={busy}
                            placeholder="DeepSeek Flash"
                            onChange={(e) =>
                              update({
                                ...draft,
                                models: draft.models.map((m, at) =>
                                  at === i ? { ...m, name: e.target.value } : m,
                                ),
                              })
                            }
                          />
                        </label>
                        <Button
                          type="button"
                          aria-label={`移除模型 ${i + 1}`}
                          disabled={busy || draft.models.length === 1}
                          onClick={() =>
                            update({ ...draft, models: draft.models.filter((_, at) => at !== i) })
                          }
                        >
                          <Icon name="close" />
                        </Button>
                      </div>
                      <details className={s.modelAdvanced}>
                        <summary>上下文与输出上限</summary>
                        <div className={s.fieldGrid}>
                          {(['contextWindow', 'maxTokens'] as const).map((field) => (
                            <label className={s.field} key={field}>
                              {field === 'contextWindow' ? '上下文窗口' : '最大输出 Token'}
                              <input
                                type="number"
                                min={1}
                                max={field === 'contextWindow' ? 10000000 : 1000000}
                                step={1}
                                disabled={busy}
                                value={model[field] ?? ''}
                                placeholder="使用适配器默认值"
                                onChange={(e) =>
                                  update({
                                    ...draft,
                                    models: draft.models.map((m, at) =>
                                      at === i
                                        ? {
                                            ...m,
                                            [field]: e.target.value
                                              ? Number(e.target.value)
                                              : undefined,
                                          }
                                        : m,
                                    ),
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </details>
                    </>
                  )}
                </div>
              ))}
              {testMessage ? (
                <p role="status" className={testOk ? s.testSuccess : s.error}>
                  {testMessage}
                </p>
              ) : null}
              <div className={s.editorFooter}>
                <Button type="button" disabled={!ready || busy} onClick={() => void run('test')}>
                  {busy ? '处理中…' : '测试连接'}
                </Button>
                <div>
                  <Button type="button" onClick={clear} disabled={busy}>
                    取消
                  </Button>
                  <Button type="submit" disabled={!ready} busy={busy} className={s.primary}>
                    保存
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
          {error ? (
            <p role="alert" className={s.error}>
              {error}
              <Button
                disabled={busy}
                onClick={() => {
                  clear()
                  void client.ctx.remote.platform
                    .modelProviders()
                    .then(unwrap)
                    .then(setData)
                    .catch((e) => setError(describe(e)))
                }}
              >
                重新加载
              </Button>
            </p>
          ) : null}
        </section>
      </div>
    </Modal>
  )
}
