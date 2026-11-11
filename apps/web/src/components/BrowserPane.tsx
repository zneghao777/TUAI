import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ActionButton,
  Button,
  Menu,
  IconEllipsisOutlineRegular,
  GuideArtworkBrowser,
  IconGlobeOutlineRegular,
  IconCheckOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserSnapshot, PanelInput, TransactionView } from '@tuai/browser-service/types'
import type { MediaFrame, InputResult } from '@tuai/ego-connector/types'
import type { AppClient } from '../model/client'
import { unwrap } from '../model/client'
import { useProductLanguage } from '../model/product-language'
import { mountBrowserFollow } from '../model/browser'
import { transferBrowserSelection } from '../model/browser-clipboard'
import './BrowserPane.css'

const copy = {
  zh: {
    pages: '页面',
    more: '浏览器操作',
    nativeTake: '在 Ego 中接管',
    stop: '停止任务',
    expired: '批准已过期，请重新准备',
    browser: '浏览器',
    take: '接管',
    give: '交还 Agent',
    agent: 'Agent 控制中',
    human: '用户正在控制',
    native: 'Ego 原生人控',
    nativeNotice: '正在 Ego 中操作；画面暂停，完成后交还 Agent',
    connect: '正在连接…',
    disconnected: '连接已断开',
    reconnect: '重新连接',
    closed: '任务已结束',
    waiting: '等待人工处理',
    empty: '当前聊天还没有浏览器任务',
    drag: '移动控制栏；按 Home 复位',
    fit: '适合窗口',
    actual: '原始尺寸',
    input: 'Ego 页面直接输入',
    error: '操作未完成，请核对当前页面后重试',
    clipboard: '剪贴板权限未获准',
    approve: '批准这次操作',
    reject: '拒绝',
    title: '确认具体操作',
    merchant: '商户',
    itinerary: '行程／内容',
    data: '用户数据',
    amount: '金额',
    terms: '条款',
    action: '操作',
    approved: '操作已派发，等待订单核验',
    unknown: '结果未知，只读核验中',
    reserved: '预订状态',
    paid: '已付款',
    unpaid: '未付款',
    ticketed: '已出票',
    unticketed: '未出票',
    mismatch: '页面或控制权已变化，请重新核对',
    inputFailed: '输入结果不确定，已停止发送；请重新连接并核对页面',
    browserFailed: 'Ego 不可用，请检查本机浏览器后重新连接',
  },
  en: {
    pages: 'Pages',
    more: 'Browser actions',
    nativeTake: 'Take control in Ego',
    stop: 'Stop task',
    expired: 'Approval expired; prepare again',
    browser: 'Browser',
    take: 'Take control',
    give: 'Return to Agent',
    agent: 'Agent in control',
    human: 'You are in control',
    native: 'Ego native control',
    nativeNotice: 'Control is in Ego. Frames are paused; return to Agent when finished.',
    connect: 'Connecting…',
    disconnected: 'Disconnected',
    reconnect: 'Reconnect',
    closed: 'Task ended',
    waiting: 'Waiting for you',
    empty: 'This chat has no browser task',
    drag: 'Move controls; press Home to reset',
    fit: 'Fit to panel',
    actual: 'Actual size',
    input: 'Direct input for Ego page',
    error: 'Action failed. Check the current page and retry.',
    clipboard: 'Clipboard permission denied',
    approve: 'Approve this action',
    reject: 'Reject',
    title: 'Confirm this action',
    merchant: 'Merchant',
    itinerary: 'Itinerary / item',
    data: 'User data',
    amount: 'Amount',
    terms: 'Terms',
    action: 'Action',
    approved: 'Action dispatched; verify the order',
    unknown: 'Result unknown; read-only verification',
    reserved: 'Reservation status',
    paid: 'Paid',
    unpaid: 'Unpaid',
    ticketed: 'Ticket issued',
    unticketed: 'No ticket issued',
    mismatch: 'Page or control changed. Check it again.',
    inputFailed: 'Input result uncertain. Sending stopped; reconnect and check the page.',
    browserFailed: 'Ego unavailable. Check the local browser and reconnect.',
  },
  it: {
    pages: 'Pagine',
    more: 'Azioni browser',
    nativeTake: 'Prendi controllo in Ego',
    stop: 'Interrompi attività',
    expired: 'Approvazione scaduta; prepara di nuovo',
    browser: 'Browser',
    take: 'Prendi controllo',
    give: 'Restituisci all’Agent',
    agent: 'Controllo Agent',
    human: 'Hai il controllo',
    native: 'Controllo nativo Ego',
    nativeNotice: 'Controllo in Ego. Immagine in pausa; restituisci all’Agent al termine.',
    connect: 'Connessione…',
    disconnected: 'Disconnesso',
    reconnect: 'Riconnetti',
    closed: 'Attività terminata',
    waiting: 'In attesa di te',
    empty: 'Questa chat non ha attività browser',
    drag: 'Sposta i controlli; premi Home per ripristinare',
    fit: 'Adatta al pannello',
    actual: 'Dimensioni originali',
    input: 'Input diretto della pagina Ego',
    error: 'Operazione non riuscita. Controlla la pagina e riprova.',
    clipboard: 'Permesso per gli appunti negato',
    approve: 'Approva questa operazione',
    reject: 'Rifiuta',
    title: 'Conferma l’operazione',
    merchant: 'Esercente',
    itinerary: 'Itinerario / articolo',
    data: 'Dati utente',
    amount: 'Importo',
    terms: 'Condizioni',
    action: 'Operazione',
    approved: 'Operazione inviata; verifica l’ordine',
    unknown: 'Esito sconosciuto; verifica in sola lettura',
    reserved: 'Stato prenotazione',
    paid: 'Pagato',
    unpaid: 'Non pagato',
    ticketed: 'Biglietto emesso',
    unticketed: 'Nessun biglietto emesso',
    mismatch: 'Pagina o controllo cambiati. Verifica di nuovo.',
    inputFailed: 'Esito input incerto. Invio sospeso; riconnetti e verifica la pagina.',
    browserFailed: 'Ego non disponibile. Controlla il browser locale e riconnetti.',
  },
}
const address = (id: string) => `dsh-resource://ego-browser/${id}`
function DragIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      {[5, 10, 15].flatMap((y) =>
        [7, 13].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />),
      )}
    </svg>
  )
}
function ZoomIcon({ fit }: { fit: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {fit ? (
        <path d="M3 7h4V3M7 7 2.5 2.5M17 13h-4v4m0-4 4.5 4.5M13 3v4h4m-4 0 4.5-4.5M7 17v-4H3m4 0-4.5 4.5" />
      ) : (
        <path d="M3 7V3h4M3 3l4.5 4.5M17 13v4h-4m4 0-4.5-4.5M13 3h4v4m0-4-4.5 4.5M7 17H3v-4m0 4 4.5-4.5" />
      )}
    </svg>
  )
}
const mods = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
  (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
function Transaction({
  client,
  state,
  tx,
}: {
  client: AppClient
  state: BrowserSnapshot
  tx: TransactionView
}) {
  const language = useProductLanguage(client),
    t = copy[language]
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [expired, setExpired] = useState(Date.now() >= tx.expiresAt)
  useEffect(() => {
    const remaining = tx.expiresAt - Date.now()
    setExpired(remaining <= 0)
    if (remaining <= 0) return
    const timer = setTimeout(() => setExpired(true), remaining)
    return () => clearTimeout(timer)
  }, [tx.expiresAt])
  const approve = async (decision: 'approve' | 'reject') => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      unwrap(
        await client.ctx.remote.browsers.approve(
          state.sessionId,
          {
            browserId: state.id,
            transactionId: tx.id,
            version: tx.version,
            digest: tx.digest,
            requestId: crypto.randomUUID(),
            expectedRevision: state.revision,
            controlEpoch: state.controlEpoch,
            decision,
          },
          new AbortController().signal,
        ),
      )
    } catch {
      setError(t.mismatch)
    } finally {
      setBusy(false)
    }
  }
  if (['invalidated', 'rejected'].includes(tx.state)) return null
  return (
    <section className="tz-browser-approval" aria-label={t.title}>
      <h3>
        {tx.state === 'awaiting_confirmation'
          ? t.title
          : tx.state === 'unknown'
            ? t.unknown
            : tx.state === 'reconciled'
              ? t.reserved
              : t.approved}
      </h3>
      <dl>
        {[
          [t.merchant, tx.summary.merchant],
          [t.itinerary, tx.summary.itinerary],
          [t.data, tx.summary.dataScope],
          [t.amount, `${tx.summary.amount} ${tx.summary.currency}`],
          [t.terms, tx.summary.terms],
          [t.action, tx.summary.action],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {tx.result && (
        <p>
          {tx.result.orderId} · {tx.result.orderState} · {tx.result.paid ? t.paid : t.unpaid} ·{' '}
          {tx.result.ticketed ? t.ticketed : t.unticketed}
        </p>
      )}
      {(error || (expired && tx.state === 'awaiting_confirmation')) && (
        <p role="alert">{error || t.expired}</p>
      )}
      {tx.state === 'awaiting_confirmation' && (
        <div className="tz-browser-approval-actions">
          <Button variant="ghost" disabled={busy} onClick={() => void approve('reject')}>
            {t.reject}
          </Button>
          <Button
            variant="primary"
            disabled={busy || expired}
            aria-busy={busy}
            onClick={() => void approve('approve')}
          >
            {t.approve}
          </Button>
        </div>
      )}
    </section>
  )
}

function BrowserView({
  client,
  snapshot,
  visible,
}: {
  client: AppClient
  snapshot: BrowserSnapshot
  visible: boolean
}) {
  const language = useProductLanguage(client),
    t = copy[language]
  const [wireState, setWireState] = useState<BrowserSnapshot>(),
    [connectionId, setConnectionId] = useState(''),
    [connected, setConnected] = useState(false)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [actual, setActual] = useState(false),
    [retry, setRetry] = useState(0),
    [inputStopped, setInputStopped] = useState(false),
    [menu, setMenu] = useState(false)
  const [pageMenu, setPageMenu] = useState(false)
  const [size, setSize] = useState({ width: 1, height: 1 }),
    [source, setSource] = useState(snapshot.viewport),
    [position, setPosition] = useState<{ x: number; y: number }>()
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    proxy = useRef<HTMLTextAreaElement>(null),
    toolbar = useRef<HTMLDivElement>(null)
  const socket = useRef<WebSocket | undefined>(undefined),
    frame = useRef<MediaFrame | undefined>(undefined),
    sequence = useRef(0),
    composing = useRef(false),
    commit = useRef({ text: '', at: 0 }),
    direct = useRef(false),
    latest = useRef(snapshot)
  const clicks = useRef({ at: 0, x: 0, y: 0, count: 1 })
  const pending = useRef(
    new Map<
      number,
      { at: number; resolve(value: InputResult): void; reject(error: Error): void }
    >(),
  )
  const state = wireState && wireState.revision >= snapshot.revision ? wireState : snapshot
  latest.current = state
  const scale = actual
    ? 1
    : Math.min(1, size.width / Math.max(1, source.width), size.height / Math.max(1, source.height))
  const canInput =
    !state.needsReconciliation &&
    visible &&
    connected &&
    state.lifecycle === 'open' &&
    state.controller === 'human' &&
    state.egoState === 'agent' &&
    !!connectionId &&
    state.controlConnectionId === connectionId &&
    !inputStopped
  direct.current = canInput
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const positionKey = 'tianzhiai-ego-controls-v1'
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(
      8,
      Math.min(p.x, (host.current?.clientWidth ?? 0) - (toolbar.current?.offsetWidth ?? 300) - 8),
    ),
    y: Math.max(
      8,
      Math.min(p.y, (host.current?.clientHeight ?? 0) - (toolbar.current?.offsetHeight ?? 64) - 8),
    ),
  })
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 640px)')
    const change = () => setActual(narrow.matches)
    change()
    narrow.addEventListener('change', change)
    return () => narrow.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
      setPosition((old) => (old ? clamp(old) : old))
    })
    observer.observe(element)
    try {
      const value = JSON.parse(localStorage.getItem(positionKey) ?? 'null')
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) setPosition(clamp(value))
    } catch {
      /* Device placement is optional. */
    }
    return () => observer.disconnect()
  }, [])
  const sendInput = (input: PanelInput): Promise<InputResult> => {
    const ws = socket.current,
      meta = frame.current,
      current = latest.current
    if (!direct.current || !ws || ws.readyState !== WebSocket.OPEN || !meta)
      return Promise.reject(new Error('INPUT_STALE'))
    if (pending.current.size >= 128) return Promise.reject(new Error('INPUT_QUEUE_LIMIT'))
    const id = ++sequence.current
    return new Promise((resolve, reject) => {
      pending.current.set(id, { at: Date.now(), resolve, reject })
      ws.send(
        JSON.stringify({
          type: 'input',
          sequence: id,
          epoch: current.controlEpoch,
          pageId: meta.pageId,
          viewportVersion: meta.viewport.version,
          input,
        }),
      )
    })
  }
  const input = (value: PanelInput) => {
    const epoch = latest.current.controlEpoch
    void sendInput(value).catch(() => {
      if (!direct.current || latest.current.controlEpoch !== epoch) return
      setError(t.inputFailed)
      setInputStopped(true)
      direct.current = false
    })
  }
  useEffect(() => {
    if (!visible || snapshot.lifecycle === 'closed') return
    let disposed = false,
      decoding = false,
      newest: ArrayBuffer | undefined
    const url = new URL('api/browser/media', document.baseURI)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.search = new URLSearchParams({
      browserId: snapshot.id,
      sessionId: snapshot.sessionId,
    }).toString()
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    socket.current = ws
    setConnected(false)
    setError('')
    setWireState(undefined)
    sequence.current = 0
    const rejectPending = () => {
      for (const item of pending.current.values()) item.reject(new Error('BROWSER_DISCONNECTED'))
      pending.current.clear()
    }
    const paint = async () => {
      if (decoding || !newest || disposed) return
      decoding = true
      while (newest && !disposed) {
        const packet = newest
        newest = undefined
        const headerLength = new DataView(packet).getUint32(0)
        const meta = JSON.parse(
          new TextDecoder().decode(new Uint8Array(packet, 4, headerLength)),
        ) as MediaFrame
        let bitmap: ImageBitmap | undefined
        try {
          bitmap = await createImageBitmap(
            new Blob([packet.slice(4 + headerLength)], { type: 'image/png' }),
          )
          if (disposed) {
            bitmap.close()
            break
          }
          const element = canvas.current
          if (element) {
            element.width = bitmap.width
            element.height = bitmap.height
            element.getContext('2d')?.drawImage(bitmap, 0, 0)
            frame.current = meta
            setSource((old) =>
              old.width === meta.viewport.width &&
              old.height === meta.viewport.height &&
              old.version === meta.viewport.version
                ? old
                : meta.viewport,
            )
            window.dispatchEvent(
              new CustomEvent('tianzhiai:browser-metric', {
                detail: {
                  phase: 'frame',
                  frameId: meta.frameId,
                  captureAt: meta.captureAt,
                  drawAt: Date.now(),
                  ageMs: Date.now() - meta.captureAt,
                  bytes: packet.byteLength,
                },
              }),
            )
          }
        } catch {
          if (!disposed) setError(t.browserFailed)
        } finally {
          bitmap?.close()
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'frameAck', frameId: meta.frameId }))
        }
      }
      decoding = false
    }
    ws.onmessage = (event) => {
      if (disposed) return
      if (event.data instanceof ArrayBuffer) {
        newest = event.data
        void paint()
        return
      }
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        setError(t.browserFailed)
        return
      }
      if (message.type === 'welcome') {
        setConnectionId(message.connectionId)
        setWireState(message.state)
        setConnected(true)
      }
      if (message.type === 'state') {
        if (message.state.controlEpoch !== latest.current.controlEpoch) {
          composing.current = false
          if (proxy.current) proxy.current.value = ''
          rejectPending()
        }
        latest.current = message.state
        setWireState(message.state)
      }
      if (message.type === 'mediaError') setError(t.browserFailed)
      if (message.type === 'inputResult') {
        const request = pending.current.get(message.sequence)
        pending.current.delete(message.sequence)
        if (!request) return
        window.dispatchEvent(
          new CustomEvent('tianzhiai:browser-metric', {
            detail: {
              phase: 'input',
              at: Date.now(),
              latencyMs: Date.now() - request.at,
              status: message.status,
            },
          }),
        )
        if (message.status !== 'executed') {
          request.reject(new Error(message.error))
          return
        }
        const focus = message.result?.focus
        if (focus && proxy.current) {
          proxy.current.style.left = `${Math.max(0, focus.x * scaleRef.current)}px`
          proxy.current.style.top = `${Math.max(0, focus.y * scaleRef.current)}px`
          proxy.current.style.height = `${Math.max(1, focus.height * scaleRef.current)}px`
        }
        request.resolve(message.result)
      }
    }
    ws.onclose = () => {
      if (!disposed) {
        direct.current = false
        setConnected(false)
        setError(t.disconnected)
        rejectPending()
      }
    }
    ws.onerror = () => {
      if (!disposed) setError(t.browserFailed)
    }
    const wheel = (e: WheelEvent) => {
      if (!direct.current) return
      e.preventDefault()
      e.stopPropagation()
      const r = canvas.current?.getBoundingClientRect(),
        vp = frame.current?.viewport
      if (r && vp)
        input({
          type: 'wheel',
          x: Math.max(0, Math.min(vp.width, (e.clientX - r.left) / scaleRef.current)),
          y: Math.max(0, Math.min(vp.height, (e.clientY - r.top) / scaleRef.current)),
          deltaX: Math.max(-10000, Math.min(10000, e.deltaX)),
          deltaY: Math.max(-10000, Math.min(10000, e.deltaY)),
          modifiers: mods(e),
        })
    }
    const element = canvas.current
    element?.addEventListener('wheel', wheel, { passive: false })
    const release = () => {
      if (direct.current) input({ type: 'release' })
      composing.current = false
      if (proxy.current) proxy.current.value = ''
    }
    const visibility = () => {
      if (document.hidden) release()
    }
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      release()
      direct.current = false
      disposed = true
      newest = undefined
      frame.current = undefined
      ws.close()
      socket.current = undefined
      rejectPending()
      element?.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [snapshot.id, snapshot.sessionId, snapshot.lifecycle === 'closed', visible, retry])
  const control = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const s = latest.current
    const action =
      s.egoState === 'native-human'
        ? 'return'
        : s.lifecycle !== 'open'
          ? 'reconnect'
          : s.controller === 'human' && s.controlConnectionId === connectionId
            ? 'return'
            : 'take'
    try {
      const result = unwrap(
        await client.ctx.remote.browsers.control(s.sessionId, {
          browserId: s.id,
          requestId: crypto.randomUUID(),
          expectedRevision: s.revision,
          controlEpoch: s.controlEpoch,
          connectionId,
          action,
        }),
      )
      setWireState(result)
      latest.current = result
      setInputStopped(false)
      if (action === 'reconnect' || s.egoState === 'native-human') setRetry((n) => n + 1)
      if (result.controller !== 'human') {
        composing.current = false
        proxy.current?.blur()
      }
    } catch {
      setError(t.mismatch)
    } finally {
      setBusy(false)
    }
  }
  const pointer = (
    e: ReactPointerEvent<HTMLCanvasElement>,
    event: 'mousePressed' | 'mouseReleased' | 'mouseMoved',
  ) => {
    if (!canInput) return
    e.preventDefault()
    e.stopPropagation()
    if (event === 'mousePressed') {
      e.currentTarget.setPointerCapture(e.pointerId)
      proxy.current?.focus({ preventScroll: true })
    }
    if (event === 'mousePressed') {
      const last = clicks.current,
        at = Date.now()
      clicks.current = {
        at,
        x: e.clientX,
        y: e.clientY,
        count:
          at - last.at < 500 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6
            ? last.count === 2
              ? 1
              : 2
            : 1,
      }
    }
    const r = e.currentTarget.getBoundingClientRect(),
      vp = frame.current?.viewport
    if (!vp || r.width <= 0) return
    input({
      type: 'mouse',
      event,
      x: Math.max(0, Math.min(vp.width, ((e.clientX - r.left) * vp.width) / r.width)),
      y: Math.max(0, Math.min(vp.height, ((e.clientY - r.top) * vp.height) / r.height)),
      button:
        e.button === 2
          ? 'right'
          : e.button === 1
            ? 'middle'
            : event === 'mouseMoved'
              ? 'none'
              : 'left',
      buttons: e.buttons,
      clickCount: clicks.current.count,
      modifiers: mods(e),
    })
  }
  const drag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const box = toolbar.current?.getBoundingClientRect(),
      area = host.current?.getBoundingClientRect()
    if (!box || !area) return
    const initial = { x: box.left - area.left, y: box.top - area.top },
      start = { x: e.clientX, y: e.clientY },
      target = e.currentTarget
    const move = (event: PointerEvent) =>
      setPosition(
        clamp({ x: initial.x + event.clientX - start.x, y: initial.y + event.clientY - start.y }),
      )
    const end = (event: PointerEvent) => {
      const p = clamp({
        x: initial.x + event.clientX - start.x,
        y: initial.y + event.clientY - start.y,
      })
      setPosition(p)
      try {
        localStorage.setItem(positionKey, JSON.stringify(p))
      } catch {
        /* Optional preference. */
      }
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }
  const extraControl = async (action: 'native-handoff' | 'cancel') => {
    setMenu(false)
    if (busy) return
    setBusy(true)
    setError('')
    const s = latest.current
    try {
      const next = unwrap(
        await client.ctx.remote.browsers.control(s.sessionId, {
          browserId: s.id,
          requestId: crypto.randomUUID(),
          expectedRevision: s.revision,
          controlEpoch: s.controlEpoch,
          connectionId,
          action,
        }),
      )
      setWireState(next)
      latest.current = next
    } catch {
      setError(t.mismatch)
    } finally {
      setBusy(false)
    }
  }
  const status =
    state.lifecycle === 'closed'
      ? t.closed
      : state.needsReconciliation
        ? t.unknown
        : state.egoState === 'native-human'
          ? t.native
          : state.lifecycle !== 'open'
            ? t.disconnected
            : state.controller === 'human'
              ? t.human
              : state.taskStatus === 'waiting_user'
                ? t.waiting
                : t.agent
  const pageTitle = state.pages.find((page) => page.id === state.pageId)?.title || t.browser
  const clipboard = async (cut: boolean) => {
    try {
      await transferBrowserSelection(
        cut,
        () => sendInput({ type: 'copy' }),
        (text) => navigator.clipboard.writeText(text),
        (selectionDigest) => sendInput({ type: 'cut', selectionDigest }),
      )
    } catch {
      setError(t.clipboard)
    }
  }
  return (
    <section className="tz-browser" aria-label={t.browser}>
      <div className="tz-browser-pages">
        {state.pages.length > 1 && (
          <Menu
            open={pageMenu}
            onClose={() => setPageMenu(false)}
            portal
            autoFocus
            align="start"
            items={state.pages.map((page) => ({
              id: page.id,
              label: <span title={page.url}>{page.title || page.id}</span>,
              icon: page.id === state.pageId ? <IconCheckOutlineRegular /> : undefined,
              disabled: page.id !== state.pageId && !canInput,
            }))}
            onSelect={(id) => {
              setPageMenu(false)
              if (id === state.pageId || busy) return
              setBusy(true)
              void client.ctx.remote.browsers
                .control(state.sessionId, {
                  browserId: state.id,
                  requestId: crypto.randomUUID(),
                  expectedRevision: state.revision,
                  controlEpoch: state.controlEpoch,
                  connectionId,
                  action: 'switch-page',
                  pageId: id,
                })
                .then((result) => {
                  const next = unwrap(result)
                  setWireState(next)
                  latest.current = next
                  setInputStopped(false)
                })
                .catch(() => setError(t.mismatch))
                .finally(() => setBusy(false))
            }}
            anchor={
              <ActionButton
                className="tz-browser-page-menu"
                aria-label={t.pages}
                title={t.pages}
                aria-expanded={pageMenu}
                onClick={() => setPageMenu((value) => !value)}
              >
                <IconGlobeOutlineRegular />
              </ActionButton>
            }
          />
        )}
        <ActionButton
          className="tz-browser-zoom"
          onClick={() => setActual((value) => !value)}
          aria-label={actual ? t.fit : t.actual}
          title={actual ? t.fit : t.actual}
        >
          <ZoomIcon fit={actual} />
        </ActionButton>
        <Menu
          open={menu}
          onClose={() => setMenu(false)}
          portal
          autoFocus
          align="end"
          items={[
            {
              id: 'native-handoff',
              label: t.nativeTake,
              disabled:
                busy ||
                state.needsReconciliation ||
                state.lifecycle !== 'open' ||
                !state.capabilities.nativeHandoff,
            },
            { id: 'cancel', label: t.stop, disabled: busy || state.lifecycle === 'closed' },
          ]}
          onSelect={(id) => void extraControl(id as 'native-handoff' | 'cancel')}
          anchor={
            <ActionButton
              aria-label={t.more}
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              <IconEllipsisOutlineRegular />
            </ActionButton>
          }
        />
      </div>
      <div className="tz-browser-viewport" ref={host}>
        <div
          className="tz-browser-image"
          style={{ width: source.width * scale, height: source.height * scale }}
        >
          <canvas
            ref={canvas}
            aria-label={t.input}
            tabIndex={canInput ? 0 : -1}
            style={{
              width: source.width * scale,
              height: source.height * scale,
              cursor: canInput ? 'default' : 'auto',
            }}
            onFocus={() => {
              if (canInput) proxy.current?.focus({ preventScroll: true })
            }}
            onPointerDown={(e) => pointer(e, 'mousePressed')}
            onPointerUp={(e) => pointer(e, 'mouseReleased')}
            onPointerMove={(e) => {
              if (canInput) pointer(e, 'mouseMoved')
            }}
            onPointerCancel={() => input({ type: 'release' })}
            onContextMenu={(e) => e.preventDefault()}
          />
          <textarea
            ref={proxy}
            className="tz-browser-proxy"
            aria-label={t.input}
            tabIndex={-1}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={!canInput}
            onBlur={() => {
              if (direct.current) input({ type: 'release' })
            }}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionUpdate={(e) => {
              if (canInput) input({ type: 'composition', text: e.data })
            }}
            onCompositionEnd={(e) => {
              composing.current = false
              commit.current = { text: e.data, at: Date.now() }
              if (e.data) input({ type: 'text', text: e.data })
              else input({ type: 'composition', text: '' })
              e.currentTarget.value = ''
            }}
            onInput={(e) => {
              const native = e.nativeEvent as InputEvent
              if (composing.current || native.isComposing) return
              const text = native.data ?? e.currentTarget.value
              e.currentTarget.value = ''
              if (text && !(text === commit.current.text && Date.now() - commit.current.at < 150))
                input({ type: 'text', text })
              commit.current = { text: '', at: 0 }
            }}
            onPaste={(e) => {
              e.preventDefault()
              e.stopPropagation()
              input({ type: 'text', text: e.clipboardData.getData('text/plain') })
            }}
            onCopy={(e) => {
              e.preventDefault()
              void clipboard(false)
            }}
            onCut={(e) => {
              e.preventDefault()
              void clipboard(true)
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (
                !canInput ||
                e.isDefaultPrevented() ||
                e.nativeEvent.isComposing ||
                composing.current ||
                e.key === 'Process' ||
                e.key === 'Unidentified'
              )
                return
              if ((e.metaKey || e.ctrlKey) && ['c', 'x'].includes(e.key.toLowerCase())) {
                e.preventDefault()
                void clipboard(e.key.toLowerCase() === 'x')
                return
              }
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') return
              if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) return
              e.preventDefault()
              input({
                type: 'key',
                event: 'rawKeyDown',
                key: e.key,
                code: e.code,
                keyCode: e.keyCode,
                modifiers: mods(e),
              })
            }}
            onKeyUp={(e) => {
              e.stopPropagation()
              if (
                !canInput ||
                e.nativeEvent.isComposing ||
                composing.current ||
                (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey)
              )
                return
              e.preventDefault()
              input({
                type: 'key',
                event: 'keyUp',
                key: e.key,
                code: e.code,
                keyCode: e.keyCode,
                modifiers: mods(e),
              })
            }}
          />
        </div>
        {(error ||
          state.needsReconciliation ||
          (state.waitReason && state.controller !== 'human')) && (
          <div className="tz-browser-notice" role={error ? 'alert' : 'status'}>
            {state.lifecycle === 'closed' && !state.needsReconciliation
              ? t.closed
              : state.egoState === 'native-human'
                ? t.nativeNotice
                : error || (state.needsReconciliation ? t.unknown : state.waitReason)}
          </div>
        )}
        <div
          ref={toolbar}
          className="tz-browser-controls"
          style={position ? { left: position.x, top: position.y } : { right: 12, bottom: 12 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ActionButton
            className="tz-browser-handle"
            aria-label={t.drag}
            title={t.drag}
            onPointerDown={drag}
            onKeyDown={(e) => {
              if (e.key === 'Home') {
                e.preventDefault()
                setPosition(undefined)
                localStorage.removeItem(positionKey)
              } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault()
                const r = toolbar.current?.getBoundingClientRect(),
                  h = host.current?.getBoundingClientRect()
                if (r && h)
                  setPosition(
                    clamp({
                      x:
                        r.left -
                        h.left +
                        (e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0),
                      y:
                        r.top -
                        h.top +
                        (e.key === 'ArrowDown' ? 16 : e.key === 'ArrowUp' ? -16 : 0),
                    }),
                  )
              }
            }}
          >
            <DragIcon />
          </ActionButton>
          <div className="tz-browser-control-text">
            <strong>{pageTitle}</strong>
            <span aria-live="polite">{busy ? t.connect : status}</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={
              busy || state.lifecycle === 'closed' || (state.lifecycle === 'open' && !connected)
            }
            aria-busy={busy}
            onClick={() => void control()}
          >
            {state.egoState === 'native-human'
              ? t.give
              : state.lifecycle !== 'open'
                ? t.reconnect
                : state.controller === 'human' && state.controlConnectionId === connectionId
                  ? t.give
                  : t.take}
          </Button>
        </div>
      </div>
      {state.transaction && (
        <Transaction
          key={state.transaction.id}
          client={client}
          state={state}
          tx={state.transaction}
        />
      )}
    </section>
  )
}

export function mountBrowserPane(client: AppClient) {
  const { ctx } = client,
    key = 'tianzhiai-ego-browser'
  const label = () =>
    copy[
      ctx.locale.getSnapshot().active === 'it'
        ? 'it'
        : ctx.locale.getSnapshot().active === 'en'
          ? 'en'
          : 'zh'
    ].browser
  ctx.effect(() =>
    ctx.sidebarRightTabs.register({
      id: key,
      kind: 'ego-browser',
      patterns: ['dsh-resource://ego-browser/**'],
      title: label,
      guide: [{ id: key, order: 12, title: label, icon: GuideArtworkBrowser }],
    }),
  )
  ctx.effect(() =>
    ctx.slots.inject('sidebar.right.pane.tab', () =>
      ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key },
        function BrowserTab({ sessionId, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
          const { tab } = useTabInfo(),
            language = useProductLanguage(client)
          const items = useSyncExternalStore(
            client.browserState.subscribe,
            client.browserState.getSnapshot,
          )
          const id = tab.navigation.address.startsWith('dsh-resource://ego-browser/')
            ? tab.navigation.address.slice('dsh-resource://ego-browser/'.length)
            : undefined
          const state = items.find((s) => s.id === id && s.sessionId === sessionId)
          if (!state)
            return (
              <div className="tz-browser-empty">
                {items.filter((s) => s.sessionId === sessionId).length
                  ? items
                      .filter((s) => s.sessionId === sessionId)
                      .map((s) => (
                        <Button
                          key={s.id}
                          onClick={() => ctx.sidebarRight.openResource(address(s.id))}
                        >
                          {s.pages.find((p) => p.id === s.pageId)?.title || copy[language].browser}
                        </Button>
                      ))
                  : copy[language].empty}
              </div>
            )
          return (
            <BrowserView key={state.id} client={client} snapshot={state} visible={tab.visible} />
          )
        },
      ),
    ),
  )
  ctx.effect(() =>
    ctx.slots.inject('sidebar.right.pane.tab.title', () =>
      ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key }, function BrowserTitle() {
        return <>{copy[useProductLanguage(client)].browser}</>
      }),
    ),
  )
  mountBrowserFollow(client)
}
