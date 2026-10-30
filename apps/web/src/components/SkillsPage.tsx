import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  ActionButton,
  Modal,
  IconChevronLeftOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SkillItem, SkillDetail, SkillFileValue } from '@tianzhiai/web-host/types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { unwrap, describe, type AppClient } from '../model/client'
import { useSkill } from '../model/skills'
import './SkillsPage.css'

const encode = (text: string) => {
  let value = ''
  for (const byte of new TextEncoder().encode(text)) value += String.fromCharCode(byte)
  return btoa(value)
}
const status = (skill: SkillItem) =>
  skill.enabled ? '已启用' : skill.activeVersion === null ? '草稿' : '已停用'
type Tab = '内容' | '文件' | '版本' | '使用记录'

export function SkillsPage({ client }: { client: AppClient }) {
  const api = useMemo(() => client.ctx.remote.skillLibrary, [client])
  const [items, setItems] = useState<SkillItem[]>([]),
    [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<SkillDetail>()
  const [version, setVersion] = useState(0),
    [tab, setTab] = useState<Tab>('内容')
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('全部')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [file, setFile] = useState<SkillFileValue>(),
    [path, setPath] = useState('SKILL.md')
  const [editor, setEditor] = useState<string>(),
    [importOpen, setImportOpen] = useState(false)
  const [bundle, setBundle] = useState<{ path: string; data: string }[]>([]),
    [source, setSource] = useState('')
  const fileInput = useRef<HTMLInputElement>(null),
    directoryInput = useRef<HTMLInputElement>(null)
  const pending = useRef(false),
    mounted = useRef(true)
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
    const controller = new AbortController()
    const refresh = () => {
      void reload(controller.signal).catch((reason) => {
        if (!controller.signal.aborted) setError(describe(reason))
      })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      mounted.current = false
      controller.abort()
      window.removeEventListener('focus', refresh)
    }
  }, [reload])
  useEffect(() => {
    setDetail(undefined)
    setFile(undefined)
    if (!selected) return
    const controller = new AbortController()
    void api
      .get(selected, controller.signal)
      .then(unwrap)
      .then((value) => {
        if (controller.signal.aborted) return
        setDetail(value)
        setVersion(value.skill.versions[0]?.version ?? 0)
        setPath('SKILL.md')
        setTab('内容')
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
      if (mounted.current) setError(describe(reason))
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
    await run(async () => {
      const values = Array.from(files)
      if (values.length > 128 || values.reduce((sum, f) => sum + f.size, 0) > 2 * 1024 * 1024)
        throw new Error('技能包最多 128 个文件、2 MB')
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
      if (!entries.some((f) => f.path === 'SKILL.md')) throw new Error('所选目录根部需要 SKILL.md')
      setBundle(entries)
      setSource(values[0]!.webkitRelativePath.split('/')[0] || values[0]!.name)
    })
  }
  const current = detail?.skill,
    meta = current?.versions.find((v) => v.version === version)
  const shown = items.filter(
    (s) =>
      (filter === '全部' || status(s) === filter) &&
      `${s.name} ${s.versions[0]?.description}`.toLowerCase().includes(query.toLowerCase()),
  )
  const mutation = current ? { id: current.id, revision: current.revision, version } : undefined
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
  return (
    <section className="tz-skills" aria-label="技能管理" data-detail={!!selected}>
      <header className="tz-skills-header">
        <h1>技能</h1>
        <Button
          variant="primary"
          onClick={() => {
            setBundle([])
            setSource('')
            setImportOpen(true)
          }}
        >
          导入技能
        </Button>
      </header>
      {error ? (
        <div role="alert" className="tz-skills-error">
          {error}
          <Button size="sm" onClick={() => void run(() => reload())}>
            刷新
          </Button>
        </div>
      ) : null}
      <div className="tz-skills-workspace">
        <aside className="tz-skills-list" aria-label="技能列表">
          <input
            aria-label="搜索技能"
            placeholder="搜索技能"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="tz-skills-filters" aria-label="技能状态">
            {['全部', '已启用', '已停用', '草稿'].map((value) => (
              <Button
                key={value}
                size="sm"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          {!loaded ? (
            <p role="status">正在读取技能…</p>
          ) : shown.length === 0 ? (
            <p className="tz-skills-empty">{items.length ? '没有匹配的技能' : '还没有技能'}</p>
          ) : (
            shown.map((item) => (
              <ActionButton
                key={item.id}
                className="tz-skills-row"
                disabled={busy}
                aria-current={selected === item.id ? 'true' : undefined}
                onClick={() => {
                  setError('')
                  setSelected(item.id)
                }}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{status(item)}</small>
                </span>
                <p>{item.versions[0]?.description}</p>
              </ActionButton>
            ))
          )}
        </aside>
        <main className="tz-skills-detail">
          {selected ? (
            <Button
              className="tz-skills-back"
              icon={<IconChevronLeftOutlineRegular size={16} />}
              onClick={() => setSelected('')}
            >
              返回列表
            </Button>
          ) : null}
          {!selected ? (
            <div className="tz-skills-empty">选择技能查看内容</div>
          ) : !current ? (
            <p role="status">正在读取详情…</p>
          ) : (
            <>
              <div className="tz-skills-title">
                <div>
                  <h2>{current.name}</h2>
                  <p>{meta?.description}</p>
                </div>
                <Button
                  disabled={busy || !current.enabled || !meta?.userInvocable}
                  onClick={() => void run(() => useSkill(client, current.name))}
                >
                  在新聊天中使用
                </Button>
              </div>
              <div className="tz-skills-meta">
                <span>{status(current)}</span>
                <span>个人 · 所有聊天</span>
                <span>
                  {current.activeVersion ? `生效版本 v${current.activeVersion}` : '尚未启用'}
                </span>
              </div>
              <div className="tz-skills-toolbar">
                <label>
                  查看版本{' '}
                  <select
                    aria-label="查看版本"
                    disabled={busy}
                    value={version}
                    onChange={(e) => {
                      setVersion(Number(e.target.value))
                      setPath('SKILL.md')
                    }}
                  >
                    {current.versions.map((v) => (
                      <option value={v.version} key={v.version}>
                        v{v.version}
                        {v.version === current.activeVersion ? ' · 生效' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <Button
                    size="sm"
                    disabled={busy || !mutation}
                    onClick={() => void run(async () => update(unwrap(await api.check(mutation!))))}
                  >
                    检查
                  </Button>
                  {current.enabled && current.activeVersion === version ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          update(unwrap(await api.disable(current.id, current.revision))),
                        )
                      }
                    >
                      停用
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy || !meta?.checked || !!meta.issues.length}
                      onClick={() =>
                        void run(async () => update(unwrap(await api.activate(mutation!))))
                      }
                    >
                      {current.activeVersion && version < current.activeVersion
                        ? '回滚到此版本'
                        : '启用此版本'}
                    </Button>
                  )}
                </div>
              </div>
              {meta ? (
                <p className="tz-skills-check">
                  {!meta.checked
                    ? '尚未检查'
                    : meta.issues.length
                      ? meta.issues.join('；')
                      : '结构检查通过；业务效果尚未验证'}
                </p>
              ) : null}
              <nav className="tz-skills-tabs" aria-label="技能详情">
                {(['内容', '文件', '版本', '使用记录'] as Tab[]).map((t) => (
                  <Button
                    key={t}
                    aria-pressed={tab === t}
                    onClick={() => {
                      setTab(t)
                      if (t === '内容') setPath('SKILL.md')
                    }}
                  >
                    {t}
                  </Button>
                ))}
              </nav>
              {tab === '内容' ? (
                <>
                  <div className="tz-skills-content-actions">
                    <Button
                      size="sm"
                      disabled={busy || !file?.text || path !== 'SKILL.md'}
                      onClick={() => setEditor(file!.text!)}
                    >
                      编辑新版本
                    </Button>
                  </div>
                  {!file ? (
                    <p role="status">正在读取内容…</p>
                  ) : (
                    <article className="tz-skills-markdown">
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{ img: ({ alt }) => <span>{alt || '图片资源'}</span> }}
                      >
                        {file.text?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') ??
                          '无法预览此文件'}
                      </Markdown>
                    </article>
                  )}
                </>
              ) : null}
              {tab === '文件' ? (
                <div className="tz-skills-files">
                  <div>
                    {meta?.files.map((f) => (
                      <Button
                        key={f.path}
                        aria-pressed={path === f.path}
                        onClick={() => setPath(f.path)}
                      >
                        {f.path}
                        <small>{f.bytes} B</small>
                      </Button>
                    ))}
                  </div>
                  <div>
                    <Button size="sm" disabled={!file} onClick={download}>
                      下载文件
                    </Button>
                    {file ? (
                      <pre>{file.text ?? '二进制文件，可下载查看'}</pre>
                    ) : (
                      <p role="status">正在读取…</p>
                    )}
                  </div>
                </div>
              ) : null}
              {tab === '版本' ? (
                <div className="tz-skills-versions">
                  {current.versions.map((v) => (
                    <article key={v.version}>
                      <div>
                        <strong>v{v.version}</strong>
                        <span>{new Date(v.createdAt).toLocaleString()}</span>
                        <Button
                          size="sm"
                          onClick={() => {
                            setVersion(v.version)
                            setPath('SKILL.md')
                            setTab('内容')
                          }}
                        >
                          查看
                        </Button>
                      </div>
                      <p>来源：{v.source}</p>
                      <code title={v.digest}>SHA256 {v.digest}</code>
                      <p>
                        {v.requiredTools.length
                          ? `依赖工具：${v.requiredTools.join('、')}`
                          : '未声明额外工具依赖'}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
              {tab === '使用记录' ? (
                <div className="tz-skills-uses">
                  {detail.uses.length ? (
                    detail.uses.map((u) => (
                      <article key={`${u.sessionId}/${u.turn}/${u.version}`}>
                        <strong>v{u.version}</strong>
                        <span>{new Date(u.loadedAt).toLocaleString()}</span>
                        <code>{u.sessionId}</code>
                      </article>
                    ))
                  ) : (
                    <p>尚未在聊天中加载</p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>
      <Modal
        open={importOpen}
        title="导入技能"
        closeLabel="关闭导入"
        onClose={() => {
          if (!busy) setImportOpen(false)
        }}
        footer={
          <>
            <Button disabled={busy} onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={busy || !bundle.length}
              onClick={() =>
                void run(async () => {
                  const item = unwrap(await api.import({ files: bundle, source }))
                  await reload()
                  setSelected(item.id)
                  setImportOpen(false)
                })
              }
            >
              {busy ? '正在导入…' : '导入为草稿'}
            </Button>
          </>
        }
      >
        <div className="tz-skills-import">
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            选择 SKILL.md
          </Button>
          <Button disabled={busy} onClick={() => directoryInput.current?.click()}>
            选择技能目录
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
        <p>
          {bundle.length
            ? `${source} · ${bundle.length} 个文件`
            : '包含配套资源时请选择完整目录，最多 2 MB。'}
        </p>
        {error ? <p role="alert">{error}</p> : null}
      </Modal>
      <Modal
        open={editor !== undefined}
        title="编辑新版本"
        closeLabel="关闭编辑"
        className="tz-skills-editor-modal"
        onClose={() => {
          if (!busy) setEditor(undefined)
        }}
        footer={
          <>
            <Button disabled={busy} onClick={() => setEditor(undefined)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!current || !meta || editor === undefined) return
                  const files = await Promise.all(
                    meta.files.map(async (f) =>
                      f.path === 'SKILL.md'
                        ? { path: f.path, data: encode(editor) }
                        : unwrap(await api.file({ id: current.id, version, path: f.path })),
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
                  setEditor(undefined)
                })
              }
            >
              保存新版本
            </Button>
          </>
        }
      >
        <textarea
          aria-label="SKILL.md 内容"
          data-modal-autofocus
          value={editor ?? ''}
          onChange={(e) => setEditor(e.target.value)}
        />
        {error ? <p role="alert">{error}</p> : null}
      </Modal>
    </section>
  )
}
