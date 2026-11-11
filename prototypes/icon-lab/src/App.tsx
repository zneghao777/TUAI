import { useEffect, useState, useMemo, type CSSProperties } from 'react'
import { Button, Input, Label, TextField } from '@heroui/react'
import { MotionConfig, useReducedMotion } from 'framer-motion'
import { AnimatedIcon, Playback, svgMarkup, type PlayMode } from './AnimatedIcon'
import { palettes, exportColor, fileColor, type PaletteId } from './palettes'
import {
  icons,
  styles,
  categories,
  iconById,
  currentCount,
  futureCount,
  type StyleId,
  type IconSpec,
} from './catalog'

const icon = (id: string) => {
  const found = iconById.get(id)
  if (!found) throw new Error(`Unknown icon: ${id}`)
  return found
}
function Glyph({ id, size = 18 }: { id: string; size?: number }) {
  return <AnimatedIcon icon={icon(id)} size={size} />
}
function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function Tile({
  item,
  style,
  size,
  selected,
  onSelect,
}: {
  item: IconSpec
  style: StyleId
  size: number
  selected: boolean
  onSelect: () => void
}) {
  const [active, setActive] = useState(false),
    [replay, setReplay] = useState(0)
  return (
    <Button
      variant="ghost"
      className="icon-tile"
      aria-label={`${item.name}，${item.id}`}
      aria-pressed={selected}
      data-icon-id={item.id}
      onHoverChange={setActive}
      onFocusChange={setActive}
      onPress={() => {
        onSelect()
        setReplay((n) => n + 1)
        setActive(true)
      }}
    >
      <span className="tile-art">
        <AnimatedIcon icon={item} style={style} size={size} play={active} replay={replay} />
      </span>
      <span className="tile-name">{item.name}</span>
    </Button>
  )
}
export default function App() {
  const [style, setStyle] = useState<StyleId>('round'),
    [theme, setTheme] = useState('light')
  const [palette, setPalette] = useState<PaletteId>('forest')
  const [mode, setMode] = useState<PlayMode>('hover'),
    [speed, setSpeed] = useState(1),
    [size, setSize] = useState(32)
  const [category, setCategory] = useState('全部图标'),
    [scope, setScope] = useState('all'),
    [query, setQuery] = useState('')
  const [selected, setSelected] = useState('agent-preset-outline'),
    [replay, setReplay] = useState(0),
    [playing, setPlaying] = useState(false)
  const [visible, setVisible] = useState(!document.hidden),
    [feedback, setFeedback] = useState('')
  const reduced = !!useReducedMotion()
  const playback = useMemo(
    () => ({ mode, reduced, visible, speed, dark: theme === 'dark' }),
    [mode, reduced, visible, speed, theme],
  )
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.palette = palette
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme, palette])
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(''), 3500)
    return () => clearTimeout(timer)
  }, [feedback])
  const filtered = useMemo(
    () =>
      icons.filter(
        (i) =>
          (category === '全部图标' || i.category === category) &&
          (scope === 'all' || (scope === 'future' ? i.future : !i.future)) &&
          `${i.name} ${i.id} ${i.symbols.join(' ')}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [category, scope, query],
  )
  const selectedIcon = icon(selected)
  function select(id: string) {
    setSelected(id)
    setReplay((n) => n + 1)
    setPlaying(true)
  }
  async function copyId() {
    try {
      await navigator.clipboard.writeText(selected)
      setFeedback('已复制图标 ID')
    } catch {
      setFeedback('复制失败，可从下方选取图标 ID')
    }
  }
  const categoryCounts = useMemo(
    () =>
      new Map(
        categories.map((c) => [
          c,
          icons.filter((i) => c === '全部图标' || i.category === c).length,
        ]),
      ),
    [],
  )
  return (
    <MotionConfig reducedMotion="user">
      <Playback.Provider value={playback}>
        <div className="lab-app">
          <header className="topbar">
            <a className="brand" href="#main">
              <span className="brand-symbol">
                <Glyph id="apps-add-outline" size={22} />
              </span>
              <span>
                TUAI<span className="brand-divider">/</span>图标实验室
              </span>
            </a>
            <div className="top-actions">
              <a className="chat-preview-link" href="/chat">
                聊天模拟
              </a>
              <span className="preview-label">独立设计预览</span>
              <Button
                isIconOnly
                variant="ghost"
                className="theme-toggle"
                isDisabled={palette === 'dawn'}
                aria-description={palette === 'dawn' ? '晨曦沿用项目的浅色主题' : undefined}
                aria-label={theme === 'light' ? '切换深色' : '切换浅色'}
                onPress={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              >
                <Glyph id={theme === 'light' ? 'dark-outline' : 'light-outline'} size={19} />
              </Button>
            </div>
          </header>
          <main id="main">
            <section className="intro">
              <div>
                <h1>动态图标</h1>
                <p>
                  {currentCount} 个现有图标 · {futureCount} 个未来场景 · 五种纯线条风格
                </p>
              </div>
              <Button
                variant="secondary"
                className="export-button"
                onPress={() =>
                  download(
                    JSON.stringify(
                      icons.map(({ id, name, category, future, sources, symbols }) => ({
                        id,
                        name,
                        category,
                        future,
                        sources,
                        symbols,
                      })),
                      null,
                      2,
                    ),
                    'tianzhiai-icon-catalog.json',
                    'application/json',
                  )
                }
              >
                <Glyph id="download-outline" />
                下载图标清单
              </Button>
            </section>
            <div className="comparison-toolbar">
              <div className="palette-options" aria-label="主题配色">
                {palettes.map((p) => (
                  <Button
                    key={p.id}
                    variant="ghost"
                    aria-label={`${p.name}主题`}
                    aria-pressed={palette === p.id}
                    onPress={() => {
                      setPalette(p.id)
                      if (p.id === 'dawn') setTheme('light')
                    }}
                  >
                    <span
                      className="palette-dot"
                      style={{ '--swatch': p.light } as CSSProperties}
                    />
                    {p.name}
                  </Button>
                ))}
              </div>
              <div className="compare-actions">
                <span>{selectedIcon.name}</span>
                <Button
                  variant="ghost"
                  isDisabled={reduced || mode === 'still'}
                  onPress={() => {
                    setPlaying(true)
                    setReplay((n) => n + 1)
                  }}
                >
                  <Glyph id="refresh-outline" size={15} />
                  同步重播
                </Button>
              </div>
            </div>
            <section aria-label="选择图标风格" className="style-selector">
              {styles.map((s) => (
                <Button
                  key={s.id}
                  variant="ghost"
                  className={`style-option ${s.id}`}
                  aria-label={`${s.name}风格`}
                  aria-pressed={style === s.id}
                  onPress={() => {
                    setStyle(s.id)
                    setPlaying(true)
                    setReplay((n) => n + 1)
                  }}
                >
                  <span className="style-title">
                    <strong>{s.name}</strong>
                    <span>{s.english}</span>
                    <span className="style-radio" aria-hidden="true">
                      {style === s.id ? <Glyph id="check-outline" size={12} /> : null}
                    </span>
                  </span>
                  <span className="style-primary">
                    <AnimatedIcon
                      icon={selectedIcon}
                      style={s.id}
                      size={64}
                      play={playing}
                      replay={replay}
                      interactive
                    />
                  </span>
                  <span className="style-description">{s.description}</span>
                </Button>
              ))}
            </section>
            <div className="workbench">
              <aside className="category-nav" aria-label="图标分类">
                <h2>图标目录</h2>
                <nav>
                  {categories.map((c, i) => (
                    <Button
                      key={c}
                      variant="ghost"
                      className="category-button"
                      aria-pressed={category === c}
                      onPress={() => setCategory(c)}
                    >
                      <Glyph
                        id={
                          [
                            'apps-add-outline',
                            'new-chat-outline',
                            'edit-outline',
                            'folder-open-outline',
                            'loading-outline',
                            'panel-left-outline',
                            'shield-outline',
                            'agent-preset-outline',
                            'workflow',
                          ][i]
                        }
                        size={17}
                      />
                      <span>{c}</span>
                      <span className="category-count">{categoryCounts.get(c)}</span>
                    </Button>
                  ))}
                </nav>
                <div className="category-bottom">
                  <span>24 × 24</span>
                  <span>SVG 设计网格</span>
                </div>
              </aside>
              <section className="library" aria-label="图标库">
                <div className="library-tools">
                  <TextField
                    className="search-field"
                    aria-label="搜索图标"
                    value={query}
                    onChange={setQuery}
                  >
                    <Label className="sr-only">搜索图标</Label>
                    <Glyph id="search-outline" size={17} />
                    <Input placeholder="搜索图标或动作…" />
                    {query ? (
                      <Button
                        variant="ghost"
                        isIconOnly
                        className="clear-search"
                        aria-label="清空搜索"
                        onPress={() => setQuery('')}
                      >
                        <Glyph id="close-outline" size={14} />
                      </Button>
                    ) : null}
                  </TextField>
                  <div className="size-options" aria-label="图标大小">
                    {[20, 32, 48].map((n) => (
                      <Button
                        key={n}
                        variant="ghost"
                        aria-label={`${n} 像素`}
                        aria-pressed={size === n}
                        onPress={() => setSize(n)}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="library-meta">
                  <div className="scope-options" aria-label="图标范围">
                    {[
                      ['all', '全部'],
                      ['current', '现有'],
                      ['future', '未来'],
                    ].map(([key, label]) => (
                      <Button
                        key={key}
                        variant="ghost"
                        aria-pressed={scope === key}
                        onPress={() => setScope(key)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <span aria-live="polite">{filtered.length} 个图标</span>
                </div>
                {filtered.length ? (
                  <div
                    className="icon-grid"
                    style={{ '--preview-size': `${size}px` } as CSSProperties}
                  >
                    {filtered.map((item) => (
                      <Tile
                        key={item.id}
                        item={item}
                        style={style}
                        size={size}
                        selected={selected === item.id}
                        onSelect={() => select(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Glyph id="search-outline" size={36} />
                    <h3>没有匹配的图标</h3>
                    <p>换个关键词，或查看全部目录。</p>
                    <Button
                      variant="secondary"
                      onPress={() => {
                        setQuery('')
                        setScope('all')
                        setCategory('全部图标')
                      }}
                    >
                      清除筛选
                    </Button>
                  </div>
                )}
              </section>
              <aside className="inspector" aria-label="图标详情">
                <div className="inspector-heading">
                  <h2>{selectedIcon.name}</h2>
                  <span>{selectedIcon.future ? '未来场景' : '现有图标'}</span>
                </div>
                <div
                  className="preview-stage"
                  onPointerEnter={() => setPlaying(true)}
                  onPointerLeave={() => setPlaying(false)}
                >
                  <span className="stage-guide guide-left" />
                  <span className="stage-guide guide-right" />
                  <span className="stage-guide guide-top" />
                  <span className="stage-guide guide-bottom" />
                  <AnimatedIcon
                    icon={selectedIcon}
                    style={style}
                    size={112}
                    play={playing}
                    replay={replay}
                  />
                  <span className="stage-size">24 × 24</span>
                  <Button
                    variant="ghost"
                    isIconOnly
                    className="replay-button"
                    aria-label="重播所选图标"
                    isDisabled={reduced || mode === 'still'}
                    onPress={() => {
                      setPlaying(true)
                      setReplay((n) => n + 1)
                    }}
                  >
                    <Glyph id="refresh-outline" size={17} />
                  </Button>
                </div>
                <div className="comparison" aria-label="五种风格对照">
                  {styles.map((s) => (
                    <Button
                      key={s.id}
                      variant="ghost"
                      aria-label={`对照${s.name}`}
                      aria-pressed={style === s.id}
                      onPress={() => {
                        setStyle(s.id)
                        setPlaying(true)
                        setReplay((n) => n + 1)
                      }}
                    >
                      <AnimatedIcon
                        icon={selectedIcon}
                        style={s.id}
                        size={27}
                        play={playing}
                        replay={replay}
                      />
                      <span>{s.name}</span>
                    </Button>
                  ))}
                </div>
                <div className="inspector-section">
                  <div className="control-label">
                    <h3>播放方式</h3>
                    {reduced ? <span>系统已减少动态效果</span> : null}
                  </div>
                  <div className="play-options">
                    {(
                      [
                        ['hover', '触发'],
                        ['loop', '循环'],
                        ['still', '静止'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        variant="ghost"
                        aria-pressed={mode === value}
                        isDisabled={reduced && value !== 'still'}
                        onPress={() => setMode(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="speed-row">
                    <span>速度</span>
                    <div>
                      {[0.5, 1, 1.5].map((n) => (
                        <Button
                          key={n}
                          variant="ghost"
                          aria-label={`${n} 倍速`}
                          aria-pressed={speed === n}
                          isDisabled={reduced || mode === 'still'}
                          onPress={() => setSpeed(n)}
                        >
                          {n}×
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="inspector-section details">
                  <span className="motion-description">
                    {styles.find((s) => s.id === style)?.action}
                  </span>
                  <code>{selectedIcon.id}</code>
                  <div className="export-actions">
                    <Button variant="secondary" onPress={copyId}>
                      复制 ID
                    </Button>
                    <Button
                      variant="primary"
                      onPress={() => {
                        download(
                          svgMarkup(
                            selectedIcon,
                            style,
                            exportColor(selected, palette, theme === 'dark'),
                          ),
                          `${selected}-${style}-${palette}.svg`,
                          'image/svg+xml',
                        )
                        setFeedback('已下载静态 SVG；动态效果保留在 React 组件中')
                      }}
                    >
                      下载 SVG
                    </Button>
                  </div>
                  <p className="export-hint">
                    {fileColor(selected)
                      ? '文件类型固定色 · SVG 无填充'
                      : 'currentColor · SVG 无填充'}
                  </p>
                  <p className="feedback" role="status">
                    {feedback}
                  </p>
                </div>
                <details className="source-details">
                  <summary>
                    来源与组件映射<span>{selectedIcon.sources.length}</span>
                  </summary>
                  {selectedIcon.registryOnly ? <p>兼容目录条目，未检出源码调用。</p> : null}
                  {selectedIcon.future ? <p>根据产品规划预留，尚未接入应用。</p> : null}
                  {selectedIcon.symbols.length ? (
                    <code>{selectedIcon.symbols.join('\n')}</code>
                  ) : null}
                  <ul>
                    {selectedIcon.sources.map((s, i) => (
                      <li key={`${s.path}-${s.line}-${i}`}>
                        <code>
                          {s.path}
                          {s.line ? `:${s.line}` : ''}
                        </code>
                      </li>
                    ))}
                  </ul>
                </details>
              </aside>
            </div>
            <footer>
              <span>TUAI · Icon studies</span>
              <span>悬停、聚焦或点击图标播放</span>
              <span>SVG + Framer Motion</span>
            </footer>
          </main>
        </div>
      </Playback.Provider>
    </MotionConfig>
  )
}
