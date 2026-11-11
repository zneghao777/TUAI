import { useEffect, useRef, useState } from 'react'
import { Input, Form, Spinner, AlertDialog } from '@heroui/react'
import type {
  ModelProviderDraft,
  ModelProviderInfo,
  ModelProvidersState,
} from '@tuai/web-host/types'
import { AppClient, describe, unwrap } from '../model/client'
import { Button, Icon } from './kit'
import { Select } from './Select'
import s from '../App.module.css'
import { useProductLanguage } from '../model/product-language'
import { localizeHostError } from '../model/host-errors'

const modelCopy = {
  模型: {
    zh: '模型',
    en: 'Models',
    it: 'Modelli',
  },
  返回列表: {
    zh: '返回列表',
    en: 'Back to list',
    it: 'Torna all’elenco',
  },
  模型配置暂不可用: {
    zh: '模型配置暂不可用',
    en: 'Model settings unavailable',
    it: 'Impostazioni dei modelli non disponibili',
  },
  '正在读取模型配置…': {
    zh: '正在读取模型配置…',
    en: 'Loading model settings…',
    it: 'Caricamento impostazioni dei modelli…',
  },
  已配置: {
    zh: '已配置',
    en: 'Configured',
    it: 'Configurato',
  },
  未配置: {
    zh: '未配置',
    en: 'Not configured',
    it: 'Non configurato',
  },
  编辑: {
    zh: '编辑',
    en: 'Edit',
    it: 'Modifica',
  },
  移除模型提供商: {
    zh: '移除模型提供商',
    en: 'Remove model provider',
    it: 'Rimuovi fornitore di modelli',
  },
  取消: {
    zh: '取消',
    en: 'Cancel',
    it: 'Annulla',
  },
  确认移除: {
    zh: '确认移除',
    en: 'Remove',
    it: 'Rimuovi',
  },
  添加模型提供商: {
    zh: '添加模型提供商',
    en: 'Add model provider',
    it: 'Aggiungi fornitore di modelli',
  },
  提供商: {
    zh: '提供商',
    en: 'Provider',
    it: 'Fornitore',
  },
  提供商类型: {
    zh: '提供商类型',
    en: 'Provider type',
    it: 'Tipo di fornitore',
  },
  '自定义 API': {
    zh: '自定义 API',
    en: 'Custom API',
    it: 'API personalizzata',
  },
  提供商标识: {
    zh: '提供商标识',
    en: 'Provider ID',
    it: 'ID del fornitore',
  },
  显示名称: {
    zh: '显示名称',
    en: 'Display name',
    it: 'Nome visualizzato',
  },
  我的模型服务: {
    zh: '我的模型服务',
    en: 'My model provider',
    it: 'Il mio fornitore di modelli',
  },
  'API 地址': {
    zh: 'API 地址',
    en: 'API address',
    it: 'Indirizzo API',
  },
  'DeepSeek Messages 兼容协议': {
    zh: 'DeepSeek Messages 兼容协议',
    en: 'DeepSeek Messages compatible protocol',
    it: 'Protocollo compatibile con DeepSeek Messages',
  },
  '已保存；留空保留原密钥': {
    zh: '已保存；留空保留原密钥',
    en: 'Saved; leave blank to keep the key',
    it: 'Salvata; lascia vuoto per mantenere la chiave',
  },
  '输入 API Key': {
    zh: '输入 API Key',
    en: 'Enter API key',
    it: 'Inserisci la chiave API',
  },
  '隐藏 API Key': {
    zh: '隐藏 API Key',
    en: 'Hide API key',
    it: 'Nascondi chiave API',
  },
  '显示 API Key': {
    zh: '显示 API Key',
    en: 'Show API key',
    it: 'Mostra chiave API',
  },
  隐藏: {
    zh: '隐藏',
    en: 'Hide',
    it: 'Nascondi',
  },
  显示: {
    zh: '显示',
    en: 'Show',
    it: 'Mostra',
  },
  模型列表: {
    zh: '模型列表',
    en: 'Models',
    it: 'Modelli',
  },
  添加模型: {
    zh: '添加模型',
    en: 'Add model',
    it: 'Aggiungi modello',
  },
  '模型 ID': {
    zh: '模型 ID',
    en: 'Model ID',
    it: 'ID modello',
  },
  模型名称: {
    zh: '模型名称',
    en: 'Model name',
    it: 'Nome modello',
  },
  上下文与输出上限: {
    zh: '上下文与输出上限',
    en: 'Context and output limits',
    it: 'Limiti di contesto e output',
  },
  上下文窗口: {
    zh: '上下文窗口',
    en: 'Context window',
    it: 'Finestra di contesto',
  },
  '最大输出 Token': {
    zh: '最大输出 Token',
    en: 'Maximum output tokens',
    it: 'Token di output massimi',
  },
  使用适配器默认值: {
    zh: '使用适配器默认值',
    en: 'Use adapter default',
    it: 'Usa il valore predefinito dell’adattatore',
  },
  '处理中…': {
    zh: '处理中…',
    en: 'Working…',
    it: 'Operazione in corso…',
  },
  测试连接: {
    zh: '测试连接',
    en: 'Test connection',
    it: 'Verifica connessione',
  },
  保存: {
    zh: '保存',
    en: 'Save',
    it: 'Salva',
  },
  重新加载: {
    zh: '重新加载',
    en: 'Reload',
    it: 'Ricarica',
  },
} as const

const emptyProvider = (): ModelProviderDraft => ({
  id: '',
  name: '',
  baseURL: '',
  models: [{ id: '', name: '' }],
})
/** DSH provider-list/add/edit interaction, rendered with the TUAI UI kit. */
export function ModelSettings({
  client,
  busy,
  onBusyChange: setBusy,
}: {
  client: AppClient
  busy: boolean
  onBusyChange(busy: boolean): void
}) {
  const language = useProductLanguage(client)
  const t = (key: keyof typeof modelCopy) => modelCopy[key][language]
  const remove = (name: string) =>
    ({ zh: `移除 ${name}`, en: `Remove ${name}`, it: `Rimuovi ${name}` })[language]
  const modelField = (name: string, index: number) => `${name} ${index + 1}`
  const [data, setData] = useState<ModelProvidersState>(),
    [error, setError] = useState('')
  const [draft, setDraft] = useState<ModelProviderDraft>(),
    [editing, setEditing] = useState<ModelProviderInfo>()
  const [adding, setAdding] = useState(false),
    [key, setKey] = useState(''),
    [visible, setVisible] = useState(false)
  const [testMessage, setTestMessage] = useState(''),
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
        setTestMessage(
          `${localizeHostError(result.message, language)} · ${(result.latencyMs / 1000).toFixed(1)} ${language === 'zh' ? '秒' : 's'}`,
        )
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
    <>
      <div className={s.settingsHeading}>
        <h3>{t('模型')}</h3>
        {draft ? (
          <Button onClick={clear} disabled={busy}>
            {t('返回列表')}
          </Button>
        ) : null}
      </div>
      {!data ? (
        <p role="status">
          {!error ? <Spinner size="sm" /> : null}
          {error ? t('模型配置暂不可用') : t('正在读取模型配置…')}
        </p>
      ) : null}
      {!draft && data ? (
        <>
          <div className={s.providerList}>
            {data.providers.map((provider) => (
              <div className={s.providerRow} key={provider.id}>
                <div className={s.providerIdentity}>
                  <strong>{provider.name}</strong>
                  <span className={s.providerState}>
                    <i className={provider.configured ? s.doneDot : s.inactiveDot} />
                    {provider.configured ? t('已配置') : t('未配置')}
                  </span>
                </div>
                <div className={s.providerActions}>
                  <Button onClick={() => edit(provider)}>{t('编辑')}</Button>
                  {provider.configured || !provider.builtin ? (
                    <Button
                      aria-label={remove(provider.name)}
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
            <AlertDialog.Backdrop
              isOpen
              isDismissable={!busy}
              isKeyboardDismissDisabled={busy}
              onOpenChange={(open) => {
                if (!open && !busy) setDeleting(undefined)
              }}
            >
              <AlertDialog.Container>
                <AlertDialog.Dialog
                  data-shortcut-modal="model-delete"
                  aria-label={t('移除模型提供商')}
                  className="tz-confirm-dialog"
                >
                  <AlertDialog.Heading>{remove(deleting.name)}</AlertDialog.Heading>
                  <p>
                    {
                      {
                        zh: `移除 ${deleting.name} 的配置和已保存密钥？已有会话会保留，下次发送前需选择可用模型。`,
                        en: `Remove ${deleting.name} settings and its saved key? Existing chats will be kept. Select an available model before sending again.`,
                        it: `Rimuovere le impostazioni e la chiave salvata di ${deleting.name}? Le chat esistenti saranno conservate. Seleziona un modello disponibile prima di inviare di nuovo.`,
                      }[language]
                    }
                  </p>
                  <Button disabled={busy} onClick={() => setDeleting(undefined)}>
                    {t('取消')}
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
                    {t('确认移除')}
                  </Button>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
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
            {t('添加模型提供商')}
          </Button>
        </>
      ) : null}
      {draft && data ? (
        <Form
          className={s.providerForm}
          onSubmit={(e) => {
            e.preventDefault()
            void run('save')
          }}
        >
          {adding ? (
            <div className={s.field}>
              <span>{t('提供商')}</span>
              <Select
                label={t('提供商类型')}
                value={builtin ? 'official' : 'custom'}
                disabled={busy}
                options={[
                  ...(official && !official.configured
                    ? [{ value: 'official', label: 'DeepSeek' }]
                    : []),
                  { value: 'custom', label: t('自定义 API') },
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
                {t('提供商标识')}
                <Input
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
                {t('显示名称')}
                <Input
                  value={draft.name}
                  disabled={busy}
                  required
                  maxLength={100}
                  placeholder={t('我的模型服务')}
                  onChange={(e) => update({ ...draft, name: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          <label className={s.field}>
            {t('API 地址')}
            <Input
              value={draft.baseURL}
              disabled={busy || builtin}
              type="url"
              required
              placeholder="https://api.example.com/anthropic"
              onChange={(e) => update({ ...draft, baseURL: e.target.value })}
            />
          </label>
          {!builtin ? <small>{t('DeepSeek Messages 兼容协议')}</small> : null}
          <label className={s.field}>
            API Key
            <div className={s.keyField}>
              <Input
                ref={builtin ? firstInput : undefined}
                aria-label="API Key"
                value={key}
                disabled={busy}
                type={visible ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                maxLength={4096}
                placeholder={editing?.configured ? t('已保存；留空保留原密钥') : t('输入 API Key')}
                onChange={(e) => {
                  setKey(e.target.value)
                  setTestMessage('')
                }}
              />
              <Button
                aria-label={visible ? t('隐藏 API Key') : t('显示 API Key')}
                onClick={() => setVisible((v) => !v)}
                type="button"
                disabled={busy}
              >
                {visible ? t('隐藏') : t('显示')}
              </Button>
            </div>
          </label>
          <div className={s.modelsHead}>
            <h4>{t('模型列表')}</h4>
            {!builtin ? (
              <Button
                disabled={busy || draft.models.length >= 100}
                onClick={() =>
                  update({ ...draft, models: [...draft.models, { id: '', name: '' }] })
                }
                type="button"
              >
                <Icon name="plus" />
                {t('添加模型')}
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
                      {t('模型 ID')}
                      <Input
                        aria-label={modelField(t('模型 ID'), i)}
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
                      {t('模型名称')}
                      <Input
                        aria-label={modelField(t('模型名称'), i)}
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
                      aria-label={remove(modelField(t('模型'), i))}
                      disabled={busy || draft.models.length === 1}
                      onClick={() =>
                        update({ ...draft, models: draft.models.filter((_, at) => at !== i) })
                      }
                    >
                      <Icon name="close" />
                    </Button>
                  </div>
                  <details className={s.modelAdvanced}>
                    <summary>{t('上下文与输出上限')}</summary>
                    <div className={s.fieldGrid}>
                      {(['contextWindow', 'maxTokens'] as const).map((field) => (
                        <label className={s.field} key={field}>
                          {field === 'contextWindow' ? t('上下文窗口') : t('最大输出 Token')}
                          <Input
                            type="number"
                            min={1}
                            max={field === 'contextWindow' ? 10000000 : 1000000}
                            step={1}
                            disabled={busy}
                            value={model[field] ?? ''}
                            placeholder={t('使用适配器默认值')}
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
              {busy ? t('处理中…') : t('测试连接')}
            </Button>
            <div>
              <Button type="button" onClick={clear} disabled={busy}>
                {t('取消')}
              </Button>
              <Button type="submit" disabled={!ready} busy={busy} className={s.primary}>
                {t('保存')}
              </Button>
            </div>
          </div>
        </Form>
      ) : null}
      {error ? (
        <p role="alert" className={s.error}>
          {localizeHostError(error, language)}
          <Button
            disabled={busy}
            onClick={() => {
              setError('')
              void client.ctx.remote.platform
                .modelProviders()
                .then(unwrap)
                .then(setData)
                .catch((e) => setError(describe(e)))
            }}
          >
            {t('重新加载')}
          </Button>
        </p>
      ) : null}
    </>
  )
}
