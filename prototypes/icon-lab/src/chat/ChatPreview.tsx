import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Input, Modal, Popover, TextArea } from '@heroui/react'
import { MotionConfig, useReducedMotion } from 'framer-motion'
import { AnimatedIcon, Playback } from '../AnimatedIcon'
import { iconById } from '../catalog'
import { palettes, type PaletteId } from '../palettes'
import brandLogo from './assets/tuai-logo.png'
import './chat-preview.css'

type Scene = 'empty' | 'files' | 'running'
type DemoFile = { name: string; icon: string; meta: string }
type DemoChat = { id: string; title: string; pinned?: boolean }
const sampleFiles: DemoFile[] = [
  { name: '季度摘要.pdf', icon: 'file-pdf', meta: 'PDF · 3 页' },
  { name: '经营数据.xlsx', icon: 'file-excel', meta: 'Excel · 2 张工作表' },
  { name: '汇报大纲.docx', icon: 'file-word', meta: 'Word · 可编辑' },
  { name: '季度汇报.pptx', icon: 'file-ppt', meta: 'PowerPoint · 8 页' },
]
const initialChats: DemoChat[] = [
  { id: 'report', title: '季度报告整理', pinned: true },
  { id: 'weekly', title: '整理本周工作安排' },
  { id: 'research', title: '产品方案资料检索' },
  { id: 'code', title: '检查项目中的代码' },
]
function Glyph({
  id,
  size = 18,
  active = false,
  loop = false,
}: {
  id: string
  size?: number
  active?: boolean
  loop?: boolean
}) {
  const base = useContext(Playback),
    icon = iconById.get(id)
  if (!icon) throw new Error(`Unknown chat preview icon: ${id}`)
  const node = <AnimatedIcon icon={icon} style="line" size={size} play={active} interactive />
  return loop ? (
    <Playback.Provider value={{ ...base, mode: base.mode === 'still' ? 'still' : 'loop' }}>
      {node}
    </Playback.Provider>
  ) : (
    node
  )
}
function IconButton({
  id,
  label,
  onPress,
  pressed,
  disabled = false,
  className = '',
}: {
  id: string
  label: string
  onPress?: () => void
  pressed?: boolean
  disabled?: boolean
  className?: string
}) {
  const [active, setActive] = useState(false)
  return (
    <Button
      isIconOnly
      variant="ghost"
      aria-label={label}
      aria-pressed={pressed}
      isDisabled={disabled}
      className={`chat-icon-button ${className}`}
      onHoverChange={setActive}
      onFocusChange={setActive}
      onPress={onPress}
    >
      <Glyph id={id} active={active} />
    </Button>
  )
}
function MenuButton({
  id,
  children,
  onPress,
  selected = false,
}: {
  id: string
  children: ReactNode
  onPress: () => void
  selected?: boolean
}) {
  const [active, setActive] = useState(false)
  return (
    <Button
      variant="ghost"
      className="chat-menu-item"
      aria-pressed={selected}
      onHoverChange={setActive}
      onFocusChange={setActive}
      onPress={onPress}
    >
      <Glyph id={id} active={active} />
      <span>{children}</span>
      {selected ? <Glyph id="check-outline" size={14} /> : null}
    </Button>
  )
}
function PaletteControls({
  palette,
  onChange,
}: {
  palette: PaletteId
  onChange: (palette: PaletteId) => void
}) {
  return (
    <div className="chat-palettes" aria-label="模拟主题">
      {palettes.map((p) => (
        <Button
          key={p.id}
          variant="ghost"
          aria-label={`${p.name}主题`}
          aria-pressed={palette === p.id}
          onPress={() => onChange(p.id)}
        >
          <span style={{ borderColor: p.light }} />
          {p.name}
        </Button>
      ))}
    </div>
  )
}
export default function ChatPreview() {
  const [palette, setPalette] = useState<PaletteId>('dawn'),
    [scene, setScene] = useState<Scene>('files')
  const [paused, setPaused] = useState(false),
    [visible, setVisible] = useState(!document.hidden)
  const [collapsed, setCollapsed] = useState(false),
    [mobileNav, setMobileNav] = useState(false)
  const [search, setSearch] = useState(''),
    [chats, setChats] = useState(initialChats),
    [selected, setSelected] = useState('report')
  const [draft, setDraft] = useState(''),
    [userText, setUserText] = useState('把这份季度材料整理成摘要，并把数据和汇报文件一起给我。')
  const [reply, setReply] = useState('已整理成四份文件，摘要、数据、文稿和演示稿可以分别查看。')
  const [attachments, setAttachments] = useState<DemoFile[]>([]),
    [toolsOpen, setToolsOpen] = useState(false)
  const [model, setModel] = useState('DeepSeek-V4.1-Flash'),
    [effort, setEffort] = useState('High'),
    [permission, setPermission] = useState('仅可查看')
  const [modelOpen, setModelOpen] = useState(false),
    [permissionOpen, setPermissionOpen] = useState(false),
    [addOpen, setAddOpen] = useState(false)
  const [file, setFile] = useState<DemoFile>(),
    [rightOpen, setRightOpen] = useState(false),
    [settings, setSettings] = useState(false)
  const [rename, setRename] = useState<DemoChat>(),
    [renameText, setRenameText] = useState(''),
    [toast, setToast] = useState(''),
    [vote, setVote] = useState<'up' | 'down' | null>(null)
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 680px)').matches)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    textarea = useRef<HTMLTextAreaElement>(null)
  const reduced = !!useReducedMotion()
  const playback = useMemo(
    () => ({
      mode: paused ? ('still' as const) : ('hover' as const),
      reduced,
      visible,
      speed: 1,
      dark: false,
    }),
    [paused, reduced, visible],
  )
  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.dataset.palette = palette
    document.documentElement.dataset.preview = 'chat'
    document.documentElement.classList.remove('dark')
    document.title = 'TUAI · 轻线聊天模拟'
    return () => {
      delete document.documentElement.dataset.preview
    }
  }, [palette])
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  useEffect(() => {
    const media = matchMedia('(max-width: 680px)')
    const change = () => {
      setMobile(media.matches)
      setMobileNav(false)
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(timeout)
  }, [toast])
  function switchScene(next: Scene) {
    clearTimeout(timer.current)
    timer.current = undefined
    setScene(next)
    setToolsOpen(next === 'running')
    setVote(null)
    setMobileNav(false)
    setDraft('')
    setAttachments([])
    setUserText('把这份季度材料整理成摘要，并把数据和汇报文件一起给我。')
    setReply('已整理成四份文件，摘要、数据、文稿和演示稿可以分别查看。')
  }
  function send() {
    if (scene === 'running' || (!draft.trim() && !attachments.length)) return
    setUserText(draft.trim() || '请帮我查看这些附件。')
    setDraft('')
    setAttachments([])
    setScene('running')
    setToolsOpen(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setScene('files')
      setToolsOpen(false)
      setReply('这是本地模拟回复，用于查看图标、消息操作与文件的排版效果。输入内容未发送到模型。')
      timer.current = undefined
    }, 1800)
  }
  function stop() {
    clearTimeout(timer.current)
    timer.current = undefined
    setScene('files')
    setToolsOpen(false)
    setReply('模拟运行已停止，可以继续查看文件图标或重新输入。')
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setToast('已复制示例文本')
    } catch {
      setToast('复制失败，可选择文本手动复制')
    }
  }
  function removeChat(id: string, action: string) {
    setChats((list) => list.filter((item) => item.id !== id))
    if (selected === id) {
      setSelected('')
      switchScene('empty')
    }
    setToast(`已从模拟列表${action}`)
  }
  const title =
    scene === 'empty'
      ? '新会话'
      : (chats.find((chat) => chat.id === selected)?.title ?? '季度报告整理')
  const filtered = chats
    .filter((chat) => chat.title.includes(search.trim()))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
  const sidebar = (compact: boolean) => (
    <>
      <div className="chat-brand-row">
        <div className="chat-brand">
          <span className="chat-logo">
            <img src={brandLogo} alt="" />
          </span>
          {!compact ? <strong>TUAI</strong> : null}
        </div>
        <IconButton
          id="panel-left-outline"
          label={mobile ? '关闭导航' : compact ? '展开侧栏' : '收起侧栏'}
          onPress={() => (mobile ? setMobileNav(false) : setCollapsed(!collapsed))}
        />
      </div>
      <Button
        variant="ghost"
        className="chat-new"
        aria-label="新建模拟会话"
        onPress={() => {
          setSelected('')
          switchScene('empty')
          textarea.current?.focus()
        }}
      >
        <Glyph id="new-chat-outline" size={18} />
        {!compact ? <span>新会话</span> : null}
      </Button>
      {!compact ? (
        <>
          <div className="chat-search">
            <Glyph id="search-outline" size={17} />
            <Input
              aria-label="搜索模拟聊天"
              placeholder="搜索聊天"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="chat-section-label">我的聊天</div>
          <nav className="chat-history" aria-label="模拟聊天记录">
            {filtered.map((chat) => (
              <div
                className={`chat-history-row ${selected === chat.id && scene !== 'empty' ? 'selected' : ''}`}
                key={chat.id}
              >
                <Button
                  variant="ghost"
                  className="chat-history-title"
                  aria-pressed={selected === chat.id && scene !== 'empty'}
                  onPress={() => {
                    setSelected(chat.id)
                    switchScene(chat.id === 'research' ? 'running' : 'files')
                  }}
                >
                  <span>{chat.title}</span>
                </Button>
                <div className="chat-history-actions">
                  {chat.pinned ? (
                    <span className="chat-pin">
                      <Glyph id="pin-outline" size={12} />
                    </span>
                  ) : null}
                  <IconButton
                    id="archive-outline"
                    label={`归档示例“${chat.title}”`}
                    onPress={() => removeChat(chat.id, '归档')}
                  />
                  <Popover>
                    <Button
                      isIconOnly
                      variant="ghost"
                      className="chat-icon-button"
                      aria-label={`示例“${chat.title}”的操作`}
                    >
                      <Glyph id="ellipsis-outline" size={16} />
                    </Button>
                    <Popover.Content placement="bottom start" className="chat-popover">
                      <Popover.Dialog aria-label="模拟会话操作">
                        <MenuButton
                          id="pin-outline"
                          onPress={() =>
                            setChats((list) =>
                              list.map((item) =>
                                item.id === chat.id ? { ...item, pinned: !item.pinned } : item,
                              ),
                            )
                          }
                        >
                          {chat.pinned ? '取消置顶' : '置顶'}
                        </MenuButton>
                        <MenuButton
                          id="edit-outline"
                          onPress={() => {
                            setRename(chat)
                            setRenameText(chat.title)
                          }}
                        >
                          重命名
                        </MenuButton>
                        <MenuButton
                          id="archive-outline"
                          onPress={() => removeChat(chat.id, '归档')}
                        >
                          归档
                        </MenuButton>
                        <MenuButton id="trash-outline" onPress={() => removeChat(chat.id, '移除')}>
                          移除示例
                        </MenuButton>
                      </Popover.Dialog>
                    </Popover.Content>
                  </Popover>
                </div>
              </div>
            ))}
            {!filtered.length ? <p className="chat-no-results">没有匹配的聊天</p> : null}
          </nav>
        </>
      ) : null}
      <Button
        variant="ghost"
        className="chat-settings"
        aria-label="预览设置"
        onPress={() => {
          setSettings(true)
          setMobileNav(false)
        }}
      >
        <Glyph id="settings-outline" size={18} />
        {!compact ? <span>设置</span> : null}
      </Button>
    </>
  )
  const artifactBody = (
    <>
      <div className="chat-file-heading">
        <Glyph id={file?.icon ?? 'folder-open-outline'} size={21} />
        <h3>{file?.name ?? '会话文件'}</h3>
        <IconButton
          id="close-outline"
          label="关闭文件预览"
          onPress={() => {
            setRightOpen(false)
            setFile(undefined)
          }}
        />
      </div>
      {file ? (
        <div className="chat-document">
          <span className="chat-document-caption">文件内容示例</span>
          <h2>{file.name.replace(/\.[^.]+$/, '')}</h2>
          {file.icon === 'file-excel' ? (
            <table>
              <thead>
                <tr>
                  <th>工作项</th>
                  <th>进度</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>需求整理</td>
                  <td>完成</td>
                </tr>
                <tr>
                  <td>方案设计</td>
                  <td>完成</td>
                </tr>
                <tr>
                  <td>界面评审</td>
                  <td>待确认</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <>
              <p>本示例展示文档预览中的图标与排版。</p>
              <h4>工作摘要</h4>
              <p>完成材料整理、数据核对与汇报准备。</p>
              <h4>后续安排</h4>
              <p>确认摘要内容，并完善对应的汇报文件。</p>
            </>
          )}
          <Button
            variant="ghost"
            className="chat-file-download"
            onPress={() => setToast('下载图标演示：本预览未连接文件服务')}
          >
            <Glyph id="download-outline" size={16} />
            下载示例
          </Button>
        </div>
      ) : (
        <div className="chat-panel-files">
          {sampleFiles.map((item) => (
            <Button key={item.name} variant="ghost" onPress={() => setFile(item)}>
              <Glyph id={item.icon} size={27} />
              <span>{item.name}</span>
              <Glyph id="chevron-right-outline" size={13} />
            </Button>
          ))}
        </div>
      )}
    </>
  )
  return (
    <MotionConfig reducedMotion="user">
      <Playback.Provider value={playback}>
        <div className="chat-preview">
          <header className="chat-demo-bar">
            <a href="/" className="chat-back">
              <Glyph id="chevron-left-outline" size={15} />
              <span>图标库</span>
            </a>
            <div className="chat-demo-identity">
              <strong>聊天模拟</strong>
              <span>轻线 · 细线版</span>
            </div>
            <div className="chat-scene-tabs" aria-label="示例场景">
              {(
                [
                  ['empty', '空白会话'],
                  ['files', '文件回复'],
                  ['running', '工具运行'],
                ] as const
              ).map(([key, name]) => (
                <Button
                  key={key}
                  variant="ghost"
                  aria-pressed={scene === key}
                  onPress={() => switchScene(key)}
                >
                  {name}
                </Button>
              ))}
            </div>
            <div className="chat-demo-right">
              <PaletteControls palette={palette} onChange={setPalette} />
              <IconButton
                id={paused ? 'play-outline' : 'pause-outline'}
                label={paused ? '开启动效' : '暂停动效'}
                pressed={paused}
                onPress={() => setPaused(!paused)}
              />
            </div>
          </header>
          <div
            className={`chat-shell ${collapsed ? 'is-collapsed' : ''} ${rightOpen && !mobile ? 'has-file-pane' : ''}`}
          >
            <aside className="chat-sidebar" aria-label="聊天导航">
              {sidebar(collapsed)}
            </aside>
            <main className={`chat-main ${scene === 'empty' ? 'is-empty' : ''}`}>
              <header className="chat-conversation-header">
                <div>
                  <IconButton
                    id="panel-left-outline"
                    label="打开导航"
                    className="chat-mobile-toggle"
                    onPress={() => setMobileNav(true)}
                  />
                  {scene !== 'empty' ? <span>{title}</span> : null}
                </div>
                <div>
                  {scene !== 'empty' ? (
                    <Popover>
                      <Button
                        isIconOnly
                        variant="ghost"
                        className="chat-icon-button"
                        aria-label="会话更多操作"
                      >
                        <Glyph id="ellipsis-outline" />
                      </Button>
                      <Popover.Content placement="bottom end" className="chat-popover">
                        <Popover.Dialog aria-label="模拟会话设置">
                          <MenuButton id="new-chat-outline" onPress={() => switchScene('empty')}>
                            查看空白会话
                          </MenuButton>
                          <MenuButton id="refresh-outline" onPress={() => switchScene('running')}>
                            重播执行状态
                          </MenuButton>
                        </Popover.Dialog>
                      </Popover.Content>
                    </Popover>
                  ) : null}
                  <IconButton
                    id="panel-left-outline"
                    label={rightOpen ? '关闭文件栏' : '打开文件栏'}
                    pressed={rightOpen}
                    onPress={() => setRightOpen(!rightOpen)}
                  />
                </div>
              </header>
              {scene !== 'empty' ? (
                <div className="chat-scroll">
                  <div className="chat-transcript">
                    <div className="chat-user-message">
                      <div className="chat-user-bubble">{userText}</div>
                      <div className="chat-user-attachment">
                        <Glyph id="file-pdf" size={19} />
                        <span>季度经营报告.pdf</span>
                      </div>
                      <div className="chat-user-meta">
                        <span>14:30</span>
                        <IconButton
                          id="copy-outline"
                          label="复制用户示例消息"
                          onPress={() => void copy(userText)}
                        />
                      </div>
                    </div>
                    <div className="chat-assistant-message">
                      <Button
                        variant="ghost"
                        className="chat-process"
                        aria-expanded={toolsOpen}
                        onPress={() => setToolsOpen(!toolsOpen)}
                      >
                        <Glyph
                          id={scene === 'running' ? 'loading-outline' : 'check-circle-outline'}
                          size={16}
                          loop={scene === 'running'}
                        />
                        <span>{scene === 'running' ? '正在整理文件…' : '已完成，用时 8秒'}</span>
                        <Glyph
                          id={toolsOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
                          size={13}
                        />
                      </Button>
                      {toolsOpen ? (
                        <div className="chat-tools">
                          <div>
                            <Glyph id="file-pdf" size={18} />
                            <span>读取季度经营报告.pdf</span>
                            <Glyph id="check-outline" size={15} />
                          </div>
                          <div>
                            <Glyph id="code-outline" size={18} />
                            <span>整理数据与文档结构</span>
                            <Glyph
                              id={scene === 'running' ? 'loading-outline' : 'check-outline'}
                              size={15}
                              loop={scene === 'running'}
                            />
                          </div>
                          <details>
                            <summary>
                              <Glyph id="inspect-outline" size={17} />
                              <span>查看示例执行记录</span>
                              <Glyph id="chevron-down-outline" size={13} />
                            </summary>
                            <pre>
                              读取材料 → 整理摘要 → 生成文件列表{'\n'}
                              此处为本地演示，没有运行真实工具。
                            </pre>
                          </details>
                        </div>
                      ) : null}
                      {scene === 'running' ? (
                        <p className="chat-running-copy">正在核对材料并整理输出文件。</p>
                      ) : (
                        <>
                          <p className="chat-answer">{reply}</p>
                          <div className="chat-file-grid">
                            {sampleFiles.map((item) => (
                              <Button
                                key={item.name}
                                variant="ghost"
                                className="chat-file-card"
                                aria-label={`预览示例文件 ${item.name}`}
                                onPress={() => {
                                  setFile(item)
                                  setRightOpen(true)
                                }}
                              >
                                <Glyph id={item.icon} size={30} />
                                <span>
                                  <strong>{item.name}</strong>
                                  <small>{item.meta}</small>
                                </span>
                                <Glyph id="chevron-right-outline" size={14} />
                              </Button>
                            ))}
                          </div>
                          <div className="chat-message-actions">
                            <IconButton
                              id="copy-outline"
                              label="复制示例回复"
                              onPress={() => void copy(reply)}
                            />
                            <IconButton
                              id="like-outline"
                              label="喜欢这条示例回复"
                              pressed={vote === 'up'}
                              onPress={() => setVote((v) => (v === 'up' ? null : 'up'))}
                            />
                            <IconButton
                              id="dislike-outline"
                              label="不喜欢这条示例回复"
                              pressed={vote === 'down'}
                              onPress={() => setVote((v) => (v === 'down' ? null : 'down'))}
                            />
                            <IconButton
                              id="refresh-outline"
                              label="重新演示生成"
                              onPress={() => switchScene('running')}
                            />
                            <span>14:30</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="chat-compose-area">
                {scene === 'empty' ? (
                  <h1 className="chat-greeting">今天，想一起完成什么？</h1>
                ) : null}
                <form
                  className="chat-composer"
                  onSubmit={(event) => {
                    event.preventDefault()
                    send()
                  }}
                >
                  {attachments.length ? (
                    <div className="chat-attachment-row">
                      {attachments.map((item) => (
                        <div key={item.name}>
                          <Glyph id={item.icon} size={23} />
                          <span>{item.name}</span>
                          <IconButton
                            id="close-outline"
                            label={`移除附件 ${item.name}`}
                            onPress={() =>
                              setAttachments((list) => list.filter((f) => f.name !== item.name))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <TextArea
                    ref={textarea}
                    aria-label="模拟消息输入"
                    placeholder="与 TUAI 对话"
                    className="chat-textarea"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing &&
                        event.keyCode !== 229
                      ) {
                        event.preventDefault()
                        send()
                      }
                    }}
                  />
                  <div className="chat-compose-toolbar">
                    <div className="chat-compose-leading">
                      <Popover isOpen={addOpen} onOpenChange={setAddOpen}>
                        <Button
                          isIconOnly
                          variant="ghost"
                          className="chat-icon-button chat-add"
                          aria-label="添加示例文件或指令"
                        >
                          <Glyph id="plus-outline" />
                        </Button>
                        <Popover.Content placement="top start" className="chat-popover">
                          <Popover.Dialog aria-label="添加示例附件">
                            <MenuButton
                              id="file-pdf"
                              onPress={() => {
                                setAttachments((list) =>
                                  list.some((i) => i.name === sampleFiles[0].name)
                                    ? list
                                    : [...list, sampleFiles[0]],
                                )
                                setAddOpen(false)
                              }}
                            >
                              添加示例 PDF
                            </MenuButton>
                            <MenuButton
                              id="file-excel"
                              onPress={() => {
                                setAttachments((list) =>
                                  list.some((i) => i.name === sampleFiles[1].name)
                                    ? list
                                    : [...list, sampleFiles[1]],
                                )
                                setAddOpen(false)
                              }}
                            >
                              添加示例表格
                            </MenuButton>
                            <MenuButton
                              id="code-outline"
                              onPress={() => {
                                setDraft('/compact')
                                setAddOpen(false)
                                textarea.current?.focus()
                              }}
                            >
                              插入 /compact 指令
                            </MenuButton>
                          </Popover.Dialog>
                        </Popover.Content>
                      </Popover>
                      <Popover isOpen={permissionOpen} onOpenChange={setPermissionOpen}>
                        <Button
                          variant="ghost"
                          className="chat-permission"
                          aria-label={`模拟访问模式，当前：${permission}`}
                        >
                          <Glyph
                            id={permission === '仅可查看' ? 'permission-read' : 'permission-full'}
                            size={14}
                          />
                          <span>{permission}</span>
                          <Glyph id="chevron-down-outline" size={12} />
                        </Button>
                        <Popover.Content placement="top start" className="chat-popover">
                          <Popover.Dialog aria-label="模拟访问模式">
                            <p className="chat-popover-label">仅改变预览状态</p>
                            {['仅可查看', '完全权限'].map((value) => (
                              <MenuButton
                                key={value}
                                id={value === '仅可查看' ? 'permission-read' : 'permission-full'}
                                selected={permission === value}
                                onPress={() => {
                                  setPermission(value)
                                  setPermissionOpen(false)
                                }}
                              >
                                {value}
                              </MenuButton>
                            ))}
                          </Popover.Dialog>
                        </Popover.Content>
                      </Popover>
                    </div>
                    <div className="chat-compose-trailing">
                      <Popover isOpen={modelOpen} onOpenChange={setModelOpen}>
                        <Button
                          variant="ghost"
                          className="chat-model"
                          aria-label={`模拟模型，当前：${model}，${effort}`}
                        >
                          <span>{model}</span>
                          <em>{effort}</em>
                          <Glyph id="chevron-down-outline" size={12} />
                        </Button>
                        <Popover.Content
                          placement="top end"
                          className="chat-popover chat-model-popover"
                        >
                          <Popover.Dialog aria-label="模拟模型与推理强度">
                            <h3>模型</h3>
                            {['DeepSeek-V4.1-Flash', 'DeepSeek-V4.1'].map((value) => (
                              <MenuButton
                                key={value}
                                id="agent-preset-outline"
                                selected={model === value}
                                onPress={() => setModel(value)}
                              >
                                {value}
                              </MenuButton>
                            ))}
                            <h3>推理强度</h3>
                            <div className="chat-effort">
                              {['Low', 'High', 'Max'].map((value) => (
                                <Button
                                  key={value}
                                  variant="ghost"
                                  aria-pressed={effort === value}
                                  onPress={() => {
                                    setEffort(value)
                                    setModelOpen(false)
                                  }}
                                >
                                  {value}
                                </Button>
                              ))}
                            </div>
                          </Popover.Dialog>
                        </Popover.Content>
                      </Popover>
                      <Button
                        type={scene === 'running' ? 'button' : 'submit'}
                        isIconOnly
                        variant="ghost"
                        className="chat-send"
                        aria-label={scene === 'running' ? '停止模拟运行' : '发送模拟消息'}
                        isDisabled={scene !== 'running' && !draft.trim() && !attachments.length}
                        onPress={scene === 'running' ? stop : undefined}
                      >
                        <Glyph id={scene === 'running' ? 'stop-fill' : 'send-outline'} size={20} />
                      </Button>
                    </div>
                  </div>
                </form>
                {scene !== 'empty' ? (
                  <div className="chat-context">
                    <Glyph id="context-meter" size={13} />
                    <span>12%</span>
                  </div>
                ) : null}
              </div>
            </main>
            {rightOpen && !mobile ? (
              <aside className="chat-file-pane" aria-label="文件模拟预览">
                {artifactBody}
              </aside>
            ) : null}
          </div>
          {toast ? (
            <div className="chat-toast" role="status">
              {toast}
            </div>
          ) : null}
          <Modal.Backdrop
            isOpen={mobileNav && mobile}
            onOpenChange={setMobileNav}
            isDismissable
            className="chat-modal-backdrop"
          >
            <Modal.Container className="chat-mobile-container">
              <Modal.Dialog aria-label="模拟聊天导航" className="chat-mobile-sidebar">
                {sidebar(false)}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
          <Modal.Backdrop
            isOpen={rightOpen && mobile}
            onOpenChange={(open) => {
              setRightOpen(open)
              if (!open) setFile(undefined)
            }}
            isDismissable
            className="chat-modal-backdrop"
          >
            <Modal.Container>
              <Modal.Dialog aria-label="文件模拟预览" className="chat-file-modal">
                {artifactBody}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
          <Modal.Backdrop
            isOpen={settings}
            onOpenChange={setSettings}
            isDismissable
            className="chat-modal-backdrop"
          >
            <Modal.Container>
              <Modal.Dialog aria-label="模拟预览设置" className="chat-settings-dialog">
                <div className="chat-modal-heading">
                  <Modal.Heading>预览设置</Modal.Heading>
                  <IconButton
                    id="close-outline"
                    label="关闭预览设置"
                    onPress={() => setSettings(false)}
                  />
                </div>
                <h3>配色</h3>
                <PaletteControls palette={palette} onChange={setPalette} />
                <h3>动态图标</h3>
                <Button
                  variant="ghost"
                  className="chat-setting-motion"
                  aria-pressed={!paused}
                  onPress={() => setPaused(!paused)}
                >
                  <Glyph id={paused ? 'play-outline' : 'pause-outline'} />
                  {paused ? '开启动效' : '暂停动效'}
                </Button>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
          <Modal.Backdrop
            isOpen={!!rename}
            onOpenChange={(open) => {
              if (!open) setRename(undefined)
            }}
            isDismissable
            className="chat-modal-backdrop"
          >
            <Modal.Container>
              <Modal.Dialog aria-label="重命名模拟会话" className="chat-settings-dialog">
                <Modal.Heading>重命名模拟会话</Modal.Heading>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!renameText.trim()) return
                    setChats((list) =>
                      list.map((item) =>
                        item.id === rename?.id ? { ...item, title: renameText.trim() } : item,
                      ),
                    )
                    setRename(undefined)
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="模拟会话名称"
                    value={renameText}
                    onChange={(event) => setRenameText(event.target.value)}
                  />
                  <div className="chat-modal-actions">
                    <Button variant="ghost" onPress={() => setRename(undefined)}>
                      取消
                    </Button>
                    <Button type="submit" isDisabled={!renameText.trim()}>
                      保存
                    </Button>
                  </div>
                </form>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </div>
      </Playback.Provider>
    </MotionConfig>
  )
}
