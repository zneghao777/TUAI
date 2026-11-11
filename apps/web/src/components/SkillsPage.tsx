import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  ActionButton,
  Modal,
  IconSkillOutlineRegular,
  IconCloseOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconFolderCloseRegular,
  IconDownloadOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SkillItem,
  SkillDetail,
  SkillFileValue,
  SkillPreview,
  SkillFileChange,
} from '@tuai/web-host/types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { unwrap, describe, type AppClient } from '../model/client'
import { useSkill } from '../model/skills'
import { useSource } from '../bindings'
import './SkillsPage.css'
import { useProductLanguage } from '../model/product-language'
import { localizeHostError } from '../model/host-errors'

const skillCopy: Record<string, readonly [string, string]> = {
  技能管理: ['Skills', 'Gestione competenze'],
  技能: ['Skills', 'Competenze'],
  导入技能: ['Import skill', 'Importa competenza'],
  刷新: ['Refresh', 'Aggiorna'],
  技能列表: ['Skills', 'Competenze'],
  搜索技能: ['Search skills', 'Cerca competenze'],
  技能状态: ['Skill status', 'Stato della competenza'],
  '正在读取技能…': ['Loading skills…', 'Caricamento competenze…'],
  没有匹配的技能: ['No matching skills', 'Nessuna competenza corrispondente'],
  还没有技能: ['No skills yet', 'Nessuna competenza'],
  返回列表: ['Back to list', 'Torna all’elenco'],
  选择技能查看内容: [
    'Select a skill to view its content',
    'Seleziona una competenza per visualizzarla',
  ],
  '正在读取详情…': ['Loading details…', 'Caricamento dettagli…'],
  在新聊天中使用: ['Use in a new chat', 'Usa in una nuova chat'],
  '个人 · 所有聊天': ['Personal · All chats', 'Personale · Tutte le chat'],
  尚未启用: ['Not enabled', 'Non attiva'],
  查看版本: ['View version', 'Mostra versione'],
  检查: ['Check', 'Verifica'],
  停用: ['Disable', 'Disattiva'],
  回滚到此版本: ['Roll back to this version', 'Ripristina questa versione'],
  启用此版本: ['Enable this version', 'Attiva questa versione'],
  尚未检查: ['Not checked', 'Non verificata'],
  '结构检查通过；业务效果尚未验证': [
    'Structure check passed; behavior not verified',
    'Verifica della struttura superata; comportamento non verificato',
  ],
  技能详情: ['Skill details', 'Dettagli della competenza'],
  编辑新版本: ['Edit new version', 'Modifica nuova versione'],
  '正在读取内容…': ['Loading content…', 'Caricamento contenuto…'],
  图片资源: ['Image', 'Immagine'],
  无法预览此文件: ['Cannot preview this file', 'Impossibile visualizzare l’anteprima del file'],
  下载文件: ['Download file', 'Scarica file'],
  '二进制文件，可下载查看': [
    'Binary file; download to view',
    'File binario; scaricalo per visualizzarlo',
  ],
  '正在读取…': ['Loading…', 'Caricamento…'],
  查看: ['View', 'Visualizza'],
  未声明额外工具依赖: [
    'No additional tool dependencies declared',
    'Nessuna dipendenza aggiuntiva dagli strumenti dichiarata',
  ],
  尚未在聊天中加载: ['Not loaded in a chat yet', 'Non ancora caricata in una chat'],
  关闭导入: ['Close import', 'Chiudi importazione'],
  取消: ['Cancel', 'Annulla'],
  '正在导入…': ['Importing…', 'Importazione…'],
  导入为草稿: ['Import as draft', 'Importa come bozza'],
  '选择 SKILL.md': ['Choose SKILL.md', 'Seleziona SKILL.md'],
  选择技能目录: ['Choose skill directory', 'Seleziona cartella della competenza'],
  '包含配套资源时请选择完整目录，最多 2 MB。': [
    'Select the complete directory when including resources; maximum 2 MB.',
    'Se includi risorse, seleziona la cartella completa; massimo 2 MB.',
  ],
  关闭编辑: ['Close editor', 'Chiudi editor'],
  保存新版本: ['Save new version', 'Salva nuova versione'],
  'SKILL.md 内容': ['SKILL.md content', 'Contenuto di SKILL.md'],
  全部: ['All', 'Tutte'],
  已启用: ['Enabled', 'Attiva'],
  已停用: ['Disabled', 'Disattivata'],
  草稿: ['Draft', 'Bozza'],
  内容: ['Content', 'Contenuto'],
  文件: ['Files', 'File'],
  版本: ['Versions', 'Versioni'],
  使用记录: ['Usage', 'Utilizzo'],
  概览: ['Overview', 'Panoramica'],
  加载记录: ['Load history', 'Cronologia caricamenti'],
  关闭详情: ['Close details', 'Chiudi dettagli'],
  导入新版本: ['Import new version', 'Importa nuova versione'],
  创建新版本草稿: ['Create version draft', 'Crea bozza versione'],
  技能文件: ['Skill files', 'File della competenza'],
  展开查看: ['Expand view', 'Espandi vista'],
  关闭文件查看: ['Close file viewer', 'Chiudi visualizzazione file'],
  正在查看: ['Viewing', 'Visualizzazione'],
  生效版本: ['Active version', 'Versione attiva'],
  非生效版本: ['Inactive version', 'Versione non attiva'],
  待检查: ['Not checked', 'Da verificare'],
  已检查: ['Checked', 'Verificata'],
  当前生效: ['Active', 'Attiva'],
  查看差异: ['View changes', 'Mostra differenze'],
  收起差异: ['Hide changes', 'Nascondi differenze'],
  新增: ['Added', 'Aggiunto'],
  修改: ['Modified', 'Modificato'],
  删除: ['Removed', 'Rimosso'],
  未变: ['Unchanged', 'Invariato'],
  查看聊天: ['View chat', 'Apri chat'],
  会话不可用: ['Chat unavailable', 'Chat non disponibile'],
  原始技能说明: ['Skill instructions', 'Istruzioni della competenza'],
  技能说明: ['Description', 'Descrizione'],
  文件清单: ['Files', 'File'],
  同名技能已存在: [
    'A skill with this name already exists',
    'Esiste già una competenza con questo nome',
  ],
  与当前版本的文件差异: ['Changes from current version', 'Differenze dalla versione corrente'],
  '导入后创建草稿；不会执行脚本。': [
    'Import creates a draft; scripts are not run.',
    'L’importazione crea una bozza; gli script non vengono eseguiti.',
  ],
  确认切换: ['Confirm switch', 'Conferma cambio'],
  切换版本: ['Switch version', 'Cambia versione'],
  将生效版本切换为: ['Switch active version to', 'Cambia versione attiva in'],
  已停用版本: ['Last active version', 'Ultima versione attiva'],
  当前技能允许模型调用: ['Available for model invocation', 'Disponibile per il modello'],
  当前技能仅支持手动调用: ['Manual invocation only', 'Solo invocazione manuale'],
  未开放手动调用: ['Manual invocation unavailable', 'Invocazione manuale non disponibile'],
  无法打开已不存在的会话: ['This chat no longer exists', 'Questa chat non esiste più'],
}

const encode = (text: string) => {
  let value = ''
  for (const byte of new TextEncoder().encode(text)) value += String.fromCharCode(byte)
  return btoa(value)
}
const status = (skill: SkillItem) =>
  skill.enabled ? '已启用' : skill.activeVersion === null ? '草稿' : '已停用'
const visibleVersion = (skill: SkillItem) =>
  skill.versions.find((v) => v.version === skill.activeVersion) ?? skill.versions[0]
type Tab = '概览' | '文件' | '版本' | '加载记录'
type Bundle = { path: string; data: string }[]
type Tree = { [key: string]: Tree | string }

function FileTree({
  files,
  path,
  select,
}: {
  files: { path: string; bytes: number }[]
  path: string
  select: (path: string) => void
}) {
  const tree: Tree = Object.create(null)
  for (const file of files) {
    const parts = file.path.split('/')
    let node = tree
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) node[part] = file.path
      else {
        const child = node[part]
        if (!child || typeof child === 'string') node[part] = Object.create(null)
        node = node[part] as Tree
      }
    }
  }
  const render = (node: Tree): React.ReactNode =>
    Object.entries(node)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) =>
        typeof child === 'string' ? (
          <ActionButton
            key={child}
            className="tz-skill-tree-file"
            aria-pressed={path === child}
            onClick={() => select(child)}
          >
            {name}
          </ActionButton>
        ) : (
          <details key={name} open>
            <summary>
              <IconFolderCloseRegular size={15} /> {name}
            </summary>
            <div>{render(child)}</div>
          </details>
        ),
      )
  return <div className="tz-skill-tree">{render(tree)}</div>
}

export function SkillsPage({ client }: { client: AppClient }) {
  const language = useProductLanguage(client)
  const tr = (text: string) =>
    language === 'zh' ? text : (skillCopy[text]?.[language === 'en' ? 0 : 1] ?? text)
  const sessions = useSource(client.ctx.sessions.list)
  const api = useMemo(() => client.ctx.remote.skillLibrary, [client])
  const [items, setItems] = useState<SkillItem[]>([]),
    [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<SkillDetail>()
  const [version, setVersion] = useState(0),
    [tab, setTab] = useState<Tab>('概览')
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('全部')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [file, setFile] = useState<SkillFileValue>(),
    [path, setPath] = useState('SKILL.md')
  const [editor, setEditor] = useState<string>(),
    [importOpen, setImportOpen] = useState(false)
  const [bundle, setBundle] = useState<Bundle>([]),
    [source, setSource] = useState('')
  const [preview, setPreview] = useState<SkillPreview>(),
    [updateTarget, setUpdateTarget] = useState('')
  const [fileExpanded, setFileExpanded] = useState(false),
    [confirmActivation, setConfirmActivation] = useState(false)
  const [changes, setChanges] = useState<SkillFileChange[]>(),
    [compareOpen, setCompareOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null),
    directoryInput = useRef<HTMLInputElement>(null)
  const pending = useRef(false),
    mounted = useRef(true),
    request = useRef(new AbortController()),
    postImport = useRef<string | undefined>(undefined)
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const next = unwrap(await api.list(signal))
      if (signal?.aborted || !mounted.current) return
      setItems(next)
      setLoaded(true)
    },
    [api],
  )
  useEffect(() => {
    mounted.current = true
    request.current = new AbortController()
    const controller = new AbortController()
    const refresh = () =>
      void reload(controller.signal).catch((reason) => {
        if (!controller.signal.aborted) setError(describe(reason))
      })
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      mounted.current = false
      controller.abort()
      request.current.abort()
      window.removeEventListener('focus', refresh)
    }
  }, [reload])
  useEffect(() => {
    setDetail(undefined)
    setFile(undefined)
    setCompareOpen(false)
    if (!selected) return
    const controller = new AbortController()
    void api
      .get(selected, controller.signal)
      .then(unwrap)
      .then((value) => {
        if (controller.signal.aborted) return
        setDetail(value)
        const imported = postImport.current === value.skill.id
        postImport.current = undefined
        setVersion(
          imported
            ? (value.skill.versions[0]?.version ?? 0)
            : (value.skill.activeVersion ?? value.skill.versions[0]?.version ?? 0),
        )
        setPath('SKILL.md')
        setTab(imported ? '版本' : '概览')
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(describe(reason))
      })
    return () => controller.abort()
  }, [api, selected])
  useEffect(() => {
    setFile(undefined)
    if (!selected || !version) return
    const controller = new AbortController()
    void api
      .file({ id: selected, version, path }, controller.signal)
      .then(unwrap)
      .then((value) => {
        if (!controller.signal.aborted) setFile(value)
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(describe(reason))
      })
    return () => controller.abort()
  }, [api, selected, version, path])
  const run = async (work: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (reason) {
      if (mounted.current && !request.current.signal.aborted) setError(describe(reason))
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const update = (item: SkillItem) => {
    setItems((current) => current.map((s) => (s.id === item.id ? item : s)))
    setDetail((current) => (current?.skill.id === item.id ? { ...current, skill: item } : current))
  }
  const selectFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBundle([])
    setPreview(undefined)
    setSource('')
    await run(async () => {
      const values = Array.from(files)
      if (values.length > 128 || values.reduce((sum, f) => sum + f.size, 0) > 2 * 1024 * 1024)
        throw new Error(
          {
            zh: '技能包最多 128 个文件、2 MB',
            en: 'A skill can contain at most 128 files and 2 MB',
            it: 'Una competenza può contenere al massimo 128 file e 2 MB',
          }[language],
        )
      const entries = await Promise.all(
        values.map(async (f) => {
          const relative = f.webkitRelativePath
          const path = relative ? relative.slice(relative.indexOf('/') + 1) : f.name
          const bytes = new Uint8Array(await f.arrayBuffer())
          let binary = ''
          for (const byte of bytes) binary += String.fromCharCode(byte)
          return { path, data: btoa(binary) }
        }),
      )
      const origin = values[0]!.webkitRelativePath.split('/')[0] || values[0]!.name
      const inspected = unwrap(
        await api.preview({ files: entries, source: origin }, request.current.signal),
      )
      if (updateTarget && inspected.existingId !== updateTarget)
        throw new Error(
          {
            zh: '所选技能包名称与当前技能不一致',
            en: 'The package name does not match this skill',
            it: 'Il nome del pacchetto non corrisponde alla competenza',
          }[language],
        )
      setBundle(entries)
      setSource(origin)
      setPreview(inspected)
    })
  }
  const current = detail?.skill,
    meta = current?.versions.find((v) => v.version === version)
  const active = current?.versions.find((v) => v.version === current.activeVersion)
  const shown = items.filter(
    (s) =>
      (filter === '全部' || status(s) === filter) &&
      `${s.name} ${visibleVersion(s)?.description ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const mutation = current ? { id: current.id, revision: current.revision, version } : undefined
  const openImport = (id = '') => {
    setBundle([])
    setPreview(undefined)
    setSource('')
    setUpdateTarget(id)
    setError('')
    setImportOpen(true)
  }
  const selectVersion = (n: number) => {
    setVersion(n)
    setPath('SKILL.md')
    setCompareOpen(false)
    setChanges(undefined)
  }
  const showChanges = () => {
    if (compareOpen) {
      setCompareOpen(false)
      return
    }
    if (!current?.activeVersion) return
    void run(async () => {
      const result = unwrap(
        await api.compare(
          { id: current.id, from: current.activeVersion!, to: version },
          request.current.signal,
        ),
      )
      setChanges(result)
      setCompareOpen(true)
    })
  }
  const download = () => {
    if (!file) return
    const blob = new Blob([Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0))])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.path.split('/').at(-1)!
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const changesView = (rows: SkillFileChange[]) => (
    <div className="tz-skill-diff">
      {rows.map((change) => (
        <div key={change.path}>
          <span data-kind={change.kind}>
            {tr(
              ({ added: '新增', modified: '修改', removed: '删除', unchanged: '未变' } as const)[
                change.kind
              ],
            )}
          </span>
          <code>{change.path}</code>
        </div>
      ))}
    </div>
  )
  const fileView = () => (
    <div className="tz-skills-files">
      <FileTree files={meta?.files ?? []} path={path} select={setPath} />
      <div className="tz-skills-file-preview">
        <div className="tz-skills-file-title">
          <code>{path}</code>
          <Button
            size="sm"
            variant="outline"
            icon={<IconDownloadOutlineRegular size={15} />}
            disabled={!file}
            onClick={download}
          >
            {tr('下载文件')}
          </Button>
        </div>
        {file ? (
          <pre>{file.text ?? tr('二进制文件，可下载查看')}</pre>
        ) : (
          <p role="status">{tr('正在读取…')}</p>
        )}
        {path === 'SKILL.md' && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !file?.text}
            onClick={() => {
              setFileExpanded(false)
              setEditor(file?.text ?? '')
            }}
          >
            {tr('编辑新版本')}
          </Button>
        )}
      </div>
    </div>
  )
  return (
    <section className="tz-skills" aria-label={tr('技能管理')} data-detail={!!selected}>
      <div className="tz-skills-library">
        <header className="tz-skills-header">
          <h1>{tr('技能')}</h1>
          <Button variant="primary" onClick={() => openImport()}>
            {tr('导入技能')}
          </Button>
        </header>
        {error && !importOpen && editor === undefined && (
          <div role="alert" className="tz-skills-error">
            {localizeHostError(error, language)}{' '}
            <Button size="sm" onClick={() => void run(() => reload())}>
              {tr('刷新')}
            </Button>
          </div>
        )}
        <div className="tz-skills-controls">
          <input
            aria-label={tr('搜索技能')}
            placeholder={tr('搜索技能')}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="tz-skills-filters" aria-label={tr('技能状态')}>
            {['全部', '已启用', '已停用', '草稿'].map((value) => (
              <Button
                key={value}
                size="sm"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {tr(value)}
              </Button>
            ))}
          </div>
        </div>
        {!loaded ? (
          <p role="status">{tr('正在读取技能…')}</p>
        ) : shown.length === 0 ? (
          <p className="tz-skills-empty">
            {items.length ? tr('没有匹配的技能') : tr('还没有技能')}
          </p>
        ) : (
          <div className="tz-skills-grid" aria-label={tr('技能列表')}>
            {shown.map((item) => (
              <ActionButton
                key={item.id}
                className="tz-skills-card"
                disabled={busy}
                aria-current={selected === item.id ? 'true' : undefined}
                onClick={() => {
                  setError('')
                  setSelected(item.id)
                }}
              >
                <span className="tz-skills-card-icon">
                  <IconSkillOutlineRegular size={23} />
                </span>
                <span className="tz-skills-card-content">
                  <span className="tz-skills-card-heading">
                    <strong>{item.name}</strong>
                    <span className="tz-skills-card-status" data-status={status(item)}>
                      {tr(status(item))}
                    </span>
                  </span>
                  <span className="tz-skills-card-description">
                    {visibleVersion(item)?.description}
                  </span>
                </span>
              </ActionButton>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <aside className="tz-skills-detail" aria-label={tr('技能详情')}>
          <div className="tz-skills-detail-head">
            <Button
              className="tz-skills-back"
              icon={<IconChevronLeftOutlineRegular size={16} />}
              onClick={() => setSelected('')}
            >
              {tr('返回列表')}
            </Button>
            <Button
              className="tz-skills-close"
              aria-label={tr('关闭详情')}
              icon={<IconCloseOutlineRegular size={16} />}
              onClick={() => setSelected('')}
            />
            {!current ? (
              <p role="status">{tr('正在读取详情…')}</p>
            ) : (
              <>
                <div className="tz-skills-identity">
                  <span className="tz-skills-detail-icon">
                    <IconSkillOutlineRegular size={30} />
                  </span>
                  <div className="tz-skills-identity-text">
                    <h2>{current.name}</h2>
                    <div className="tz-skills-meta">
                      <span>{tr(status(current))}</span>
                      <span>
                        {current.activeVersion
                          ? `${tr(current.enabled ? '生效版本' : '已停用版本')} v${current.activeVersion}`
                          : tr('尚未启用')}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="tz-skills-description">
                  <span>{active?.description ?? meta?.description}</span>
                </p>
                <Button
                  variant="primary"
                  className="tz-skills-use"
                  disabled={busy || !current.enabled || !active?.userInvocable}
                  onClick={() => void run(() => useSkill(client, current.name))}
                >
                  {tr('在新聊天中使用')}
                </Button>
                {current.enabled && !active?.userInvocable && (
                  <p className="tz-skills-note">{tr('未开放手动调用')}</p>
                )}
              </>
            )}
          </div>
          {current && (
            <div className="tz-skills-detail-body">
              {current.activeVersion !== version && (
                <p className="tz-skills-note">
                  {tr('正在查看')} v{version} · {tr('非生效版本')}
                </p>
              )}
              <nav className="tz-skills-tabs" aria-label={tr('技能详情')}>
                {(['概览', '文件', '版本', '加载记录'] as Tab[]).map((t) => (
                  <Button
                    key={t}
                    aria-pressed={tab === t}
                    onClick={() => {
                      setTab(t)
                      if (t === '概览') setPath('SKILL.md')
                    }}
                  >
                    {tr(t)}
                  </Button>
                ))}
              </nav>
              {tab === '概览' && (
                <div className="tz-skills-overview">
                  <div className="tz-skills-section-title">
                    <h3>{tr('技能说明')}</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !file?.text}
                      onClick={() => setEditor(file?.text ?? '')}
                    >
                      {tr('编辑新版本')}
                    </Button>
                  </div>
                  <p>{meta?.description}</p>
                  <details>
                    <summary>{tr('原始技能说明')}</summary>
                    {!file ? (
                      <p role="status">{tr('正在读取内容…')}</p>
                    ) : (
                      <article className="tz-skills-markdown">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{ img: ({ alt }) => <span>{alt || tr('图片资源')}</span> }}
                        >
                          {file.text?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') ??
                            tr('无法预览此文件')}
                        </Markdown>
                      </article>
                    )}
                  </details>
                </div>
              )}
              {tab === '文件' && (
                <>
                  <div className="tz-skills-section-title">
                    <h3>{tr('技能文件')}</h3>
                    <Button variant="outline" size="sm" onClick={() => setFileExpanded(true)}>
                      {tr('展开查看')}
                    </Button>
                  </div>
                  <p className="tz-skills-note">
                    {tr('正在查看')} v{version} ·{' '}
                    {tr(
                      current.activeVersion === version && current.enabled
                        ? '当前生效'
                        : '非生效版本',
                    )}
                  </p>
                  {fileView()}
                </>
              )}
              {tab === '版本' && (
                <>
                  <div className="tz-skills-section-title">
                    <h3>{tr('版本')}</h3>
                    <Button variant="outline" size="sm" onClick={() => openImport(current.id)}>
                      {tr('导入新版本')}
                    </Button>
                  </div>
                  <div className="tz-skills-version-list">
                    {current.versions.map((v) => (
                      <ActionButton
                        key={v.version}
                        className="tz-skills-version"
                        aria-pressed={version === v.version}
                        onClick={() => selectVersion(v.version)}
                      >
                        <span>
                          <strong>v{v.version}</strong>{' '}
                          <small>
                            {tr(
                              current.activeVersion === v.version && current.enabled
                                ? '当前生效'
                                : !v.checked
                                  ? '待检查'
                                  : '已检查',
                            )}
                          </small>
                        </span>
                        <small>
                          {v.source} ·{' '}
                          {new Date(v.createdAt).toLocaleString(
                            language === 'zh' ? 'zh-CN' : language,
                          )}
                        </small>
                      </ActionButton>
                    ))}
                  </div>
                  <div className="tz-skills-version-detail">
                    <div className="tz-skills-section-title">
                      <strong>
                        {tr('正在查看')} v{version}
                      </strong>
                      {current.activeVersion && current.activeVersion !== version ? (
                        <Button variant="outline" size="sm" onClick={showChanges}>
                          {tr(compareOpen ? '收起差异' : '查看差异')}
                        </Button>
                      ) : null}
                    </div>
                    <p>
                      {current.activeVersion
                        ? `${tr(current.enabled ? '生效版本' : '已停用版本')} v${current.activeVersion}`
                        : tr('尚未启用')}
                    </p>
                    <p>
                      {!meta?.checked
                        ? tr('尚未检查')
                        : meta.issues.length
                          ? meta.issues
                              .map((issue) => localizeHostError(issue, language))
                              .join('；')
                          : tr('结构检查通过；业务效果尚未验证')}
                    </p>
                    {compareOpen && changes && changesView(changes)}
                    <div className="tz-skills-version-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !mutation}
                        onClick={() =>
                          void run(async () => update(unwrap(await api.check(mutation!))))
                        }
                      >
                        {tr('检查')}
                      </Button>
                      {current.enabled && current.activeVersion === version ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(async () =>
                              update(unwrap(await api.disable(current.id, current.revision))),
                            )
                          }
                        >
                          {tr('停用')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy || !meta?.checked || !!meta.issues.length}
                          onClick={() => setConfirmActivation(true)}
                        >
                          {tr(
                            current.activeVersion && version < current.activeVersion
                              ? '回滚到此版本'
                              : '启用此版本',
                          )}
                        </Button>
                      )}
                    </div>
                    <details>
                      <summary>{tr('版本')}</summary>
                      <p>{meta?.source}</p>
                      <code title={meta?.digest}>SHA256 {meta?.digest}</code>
                      <p>
                        {meta?.requiredTools.length
                          ? meta.requiredTools.join('、')
                          : tr('未声明额外工具依赖')}
                      </p>
                    </details>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPath('SKILL.md')
                      setTab('文件')
                    }}
                  >
                    {tr('技能文件')}
                  </Button>
                </>
              )}
              {tab === '加载记录' && (
                <div className="tz-skills-uses">
                  {detail.uses.length ? (
                    detail.uses.map((u) => {
                      const id = brandString<SessionId>(u.sessionId)
                      const session = sessions.byId[id]
                      return (
                        <article key={`${u.sessionId}/${u.turn}/${u.version}`}>
                          <div>
                            <strong>{session?.title || u.sessionId}</strong>
                            <span>
                              v{u.version} ·{' '}
                              {new Date(u.loadedAt).toLocaleString(
                                language === 'zh' ? 'zh-CN' : language,
                              )}
                            </span>
                          </div>
                          {session ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => client.ctx.uiWorkspace.openSession(id)}
                            >
                              {tr('查看聊天')}
                            </Button>
                          ) : (
                            <span>{tr('会话不可用')}</span>
                          )}
                        </article>
                      )
                    })
                  ) : (
                    <p>{tr('尚未在聊天中加载')}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      )}
      <Modal
        open={importOpen}
        title={tr(updateTarget ? '导入新版本' : '导入技能')}
        closeLabel={tr('关闭导入')}
        onClose={() => {
          if (!busy) setImportOpen(false)
        }}
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setImportOpen(false)}>
              {tr('取消')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || !preview || !bundle.length}
              onClick={() =>
                void run(async () => {
                  if (!preview) return
                  const item =
                    preview.existingId && preview.revision !== undefined
                      ? unwrap(
                          await api.createVersion({
                            id: preview.existingId,
                            revision: preview.revision,
                            files: bundle,
                            source,
                          }),
                        )
                      : unwrap(await api.import({ files: bundle, source }))
                  await reload()
                  setImportOpen(false)
                  setError('')
                  if (selected === item.id) {
                    update(item)
                    setVersion(item.versions[0]?.version ?? 0)
                    setTab('版本')
                    setPath('SKILL.md')
                  } else {
                    postImport.current = item.id
                    setSelected(item.id)
                  }
                })
              }
            >
              {busy ? tr('正在导入…') : tr(preview?.existingId ? '创建新版本草稿' : '导入为草稿')}
            </Button>
          </>
        }
      >
        <div className="tz-skills-import">
          <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            {tr('选择 SKILL.md')}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => directoryInput.current?.click()}>
            {tr('选择技能目录')}
          </Button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".md"
            onChange={(e) => {
              void selectFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={directoryInput}
            hidden
            type="file"
            {...{ webkitdirectory: '' }}
            onChange={(e) => {
              void selectFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        {!preview ? (
          <p>{tr('包含配套资源时请选择完整目录，最多 2 MB。')}</p>
        ) : (
          <div className="tz-skills-import-preview">
            <strong>{preview.name}</strong>
            <p>{preview.description}</p>
            <small>
              {source} · {preview.files.length}{' '}
              {
                { zh: '个文件', en: preview.files.length === 1 ? 'file' : 'files', it: 'file' }[
                  language
                ]
              }
            </small>
            {preview.existingId && (
              <p>
                {tr('同名技能已存在')} · {tr('创建新版本草稿')}
              </p>
            )}
            <details>
              <summary>{tr('文件清单')}</summary>
              {preview.files.map((f) => (
                <code key={f.path}>
                  {f.path} · {f.bytes} B
                </code>
              ))}
            </details>
            {preview.existingId && (
              <>
                <p>
                  {tr('与当前版本的文件差异')}
                  {preview.baseVersion ? ` · v${preview.baseVersion}` : ''}
                </p>
                {changesView(preview.changes)}
              </>
            )}
            <p>{tr('导入后创建草稿；不会执行脚本。')}</p>
          </div>
        )}
        {error && <p role="alert">{localizeHostError(error, language)}</p>}
      </Modal>
      <Modal
        open={editor !== undefined}
        title={tr('编辑新版本')}
        closeLabel={tr('关闭编辑')}
        className="tz-skills-editor-modal"
        onClose={() => {
          if (!busy) setEditor(undefined)
        }}
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setEditor(undefined)}>
              {tr('取消')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || !editor?.trim()}
              onClick={() =>
                void run(async () => {
                  if (!current || !meta || editor === undefined) return
                  const files = await Promise.all(
                    meta.files.map(async (f) =>
                      f.path === 'SKILL.md'
                        ? { path: f.path, data: encode(editor) }
                        : unwrap(
                            await api.file(
                              { id: current.id, version, path: f.path },
                              request.current.signal,
                            ),
                          ),
                    ),
                  )
                  const item = unwrap(
                    await api.createVersion({
                      id: current.id,
                      revision: current.revision,
                      source: '用户编辑',
                      files: files.map((f) => ({ path: f.path, data: f.data })),
                    }),
                  )
                  update(item)
                  setVersion(item.versions[0]!.version)
                  setPath('SKILL.md')
                  setTab('版本')
                  setEditor(undefined)
                })
              }
            >
              {tr('保存新版本')}
            </Button>
          </>
        }
      >
        <textarea
          aria-label={tr('SKILL.md 内容')}
          data-modal-autofocus
          value={editor ?? ''}
          onChange={(e) => setEditor(e.target.value)}
        />
        {error && <p role="alert">{localizeHostError(error, language)}</p>}
      </Modal>
      <Modal
        open={confirmActivation}
        title={tr('切换版本')}
        closeLabel={tr('关闭编辑')}
        onClose={() => {
          if (!busy) setConfirmActivation(false)
        }}
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmActivation(false)}>
              {tr('取消')}
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!mutation) return
                  update(unwrap(await api.activate(mutation)))
                  setConfirmActivation(false)
                })
              }
            >
              {tr('确认切换')}
            </Button>
          </>
        }
      >
        <p>
          {tr('将生效版本切换为')} v{version}
        </p>
        {error && <p role="alert">{localizeHostError(error, language)}</p>}
      </Modal>
      <Modal
        open={fileExpanded}
        title={tr('技能文件')}
        closeLabel={tr('关闭文件查看')}
        className="tz-skills-viewer-modal"
        onClose={() => setFileExpanded(false)}
      >
        {fileView()}
      </Modal>
    </section>
  )
}
