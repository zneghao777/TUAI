import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import s from '../App.module.css'
export function Button({
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      className={`${s.button} ${props.className ?? ''}`}
      disabled={props.disabled || busy}
      aria-busy={busy}
    >
      {children}
    </button>
  )
}
export function Icon({
  name,
}: {
  name:
    | 'plus'
    | 'send'
    | 'paperclip'
    | 'menu'
    | 'stop'
    | 'close'
    | 'star'
    | 'search'
    | 'chevron'
    | 'download'
    | 'copy'
    | 'check'
    | 'settings'
    | 'model'
    | 'reset'
    | 'right'
    | 'back'
    | 'shield'
}) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    send: 'M12 19V5M5 12l7-7 7 7',
    paperclip: 'M8 13l6-6a3 3 0 014 4l-8 8a5 5 0 01-7-7l9-9M6 15l8-8',
    menu: 'M4 5h16v14H4zM9 5v14',
    stop: 'M7 7h10v10H7z',
    close: 'M6 6l12 12M18 6L6 18',
    star: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
    search: 'M17 17l4 4M19 11a8 8 0 11-16 0 8 8 0 0116 0',
    chevron: 'M6 9l6 6 6-6',
    download: 'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',
    copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
    check: 'M5 12l4 4L19 6',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    model: 'M4 7c0-5 16-5 16 0s-16 5-16 0v10c0 5 16 5 16 0V7M4 12c0 5 16 5 16 0',
    reset: 'M4 4v6h6M4 10a8 8 0 118 10',
    right: 'M9 5l7 7-7 7',
    back: 'M15 5l-7 7 7 7',
    shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4',
  }
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
export function Modal({
  title,
  onClose,
  children,
  className,
  busy = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const el = ref.current!
    const before = document.activeElement
    el.showModal()
    return () => {
      el.close()
      if (before instanceof HTMLElement && before.isConnected && !before.closest('[inert]'))
        before.focus()
      else document.querySelector<HTMLButtonElement>('[aria-label="打开导航"]')?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      className={`${s.modal} ${className ?? ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (
          !busy &&
          e.target === e.currentTarget &&
          (e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom)
        )
          onClose()
      }}
    >
      <div className={s.modalHead}>
        <h2 id={titleId}>{title}</h2>
        <Button aria-label="关闭" onClick={onClose} disabled={busy}>
          <Icon name="close" />
        </Button>
      </div>
      {children}
    </dialog>
  )
}
export function downloadText(text: string, name = '执行记录.txt') {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function TextOutput({ text }: { text: string }) {
  return (
    <>
      <pre>
        {text.slice(0, 16000)}
        {text.length > 16000 ? '\n…显示前 16,000 字符' : ''}
      </pre>
      {text.length > 16000 ? (
        <Button onClick={() => downloadText(text, '完整工具输出.txt')}>下载完整工具输出</Button>
      ) : null}
    </>
  )
}
export function Raw({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? ''
  return (
    <>
      <pre>
        {text.slice(0, 16000)}
        {text.length > 16000 ? '\n…显示前 16,000 字符' : ''}
      </pre>
      {text.length > 16000 ? (
        <Button onClick={() => downloadText(text, '完整结果记录.json')}>下载完整记录</Button>
      ) : null}
    </>
  )
}
export function SafeMarkdown({ text }: { text: string }) {
  const [page, setPage] = useState(0),
    pages = Math.max(1, Math.ceil(text.length / 24000)),
    current = Math.min(page, pages - 1)
  return (
    <div className={s.markdown}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>［外部图片：{alt ?? '未自动加载'}］</span>,
        }}
      >
        {text.slice(current * 24000, (current + 1) * 24000)}
      </Markdown>
      {pages > 1 ? (
        <div>
          <span>
            长内容 · 第 {current + 1} / {pages} 段
          </span>
          <Button disabled={!current} onClick={() => setPage(current - 1)}>
            上一段
          </Button>
          <Button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>
            下一段
          </Button>
          <Button onClick={() => downloadText(text)}>下载完整文本</Button>
        </div>
      ) : null}
    </div>
  )
}
export function Copy({ text }: { text: string }) {
  const [message, setMessage] = useState('复制')
  return (
    <Button
      title="复制文本"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => setMessage('已复制'),
          () => setMessage('复制失败，请选择文本复制'),
        )
      }}
    >
      <Icon name="copy" />
      {message}
    </Button>
  )
}
export function Glow() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)')
    if (media.matches) return
    let frame = 0,
      x = 0,
      y = 0,
      tx = 0,
      ty = 0,
      started = false
    const render = () => {
      x += (tx - x) * 0.18
      y += (ty - y) * 0.18
      const el = ref.current
      if (!el) return
      el.style.transform = `translate3d(${x - 110}px,${y - 110}px,0)`
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.3) frame = requestAnimationFrame(render)
      else frame = 0
    }
    const move = (e: PointerEvent) => {
      if (media.matches) return
      tx = e.clientX
      ty = e.clientY
      if (!started) {
        x = tx
        y = ty
        started = true
      }
      if (ref.current) ref.current.style.opacity = '1'
      if (!frame) frame = requestAnimationFrame(render)
    }
    const leave = () => {
      if (ref.current) ref.current.style.opacity = '0'
      cancelAnimationFrame(frame)
      frame = 0
    }
    media.addEventListener('change', leave)
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      media.removeEventListener('change', leave)
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(frame)
    }
  }, [])
  return <div className={s.glow} ref={ref} aria-hidden="true" />
}
