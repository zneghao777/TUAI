import { createRoot, type Root } from 'react-dom/client'
import { AppClient } from './model/client'
import { mountProductUi } from './ui'
import { readBootLanguage } from './model/language'
import { localizeHostError } from './model/host-errors'
import './hero.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/shiki.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/focus.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/scrollbar.css'
import './theme.css'
import './chat-theme.css'
const container = document.getElementById('root')!
let root: Root | undefined
const client = new AppClient()
const bootLanguage = readBootLanguage()
const bootCopy = {
  zh: {
    loading: '正在连接TUAI…',
    failed: '连接未完成',
    unavailable: 'Host 未就绪',
    retry: '重新连接',
  },
  en: {
    loading: 'Connecting to TUAI…',
    failed: 'Connection failed',
    unavailable: 'Host is not ready',
    retry: 'Reconnect',
  },
  it: {
    loading: 'Connessione a TUAI…',
    failed: 'Connessione non riuscita',
    unavailable: 'Host non ancora disponibile',
    retry: 'Riconnetti',
  },
}[bootLanguage]
document.documentElement.lang = bootLanguage === 'zh' ? 'zh-CN' : bootLanguage
let unmount: (() => void) | undefined
let closed = false
const loading = document.createElement('p')
loading.style.padding = '32px'
loading.textContent = bootCopy.loading
container.replaceChildren(loading)
void client
  .start()
  .then(() => {
    if (closed) return
    unmount = mountProductUi(client, container)
  })
  .catch((error) => {
    if (closed) return
    void client.dispose()
    root ??= createRoot(container)
    root.render(
      <main style={{ padding: 32 }}>
        <h1>{bootCopy.failed}</h1>
        <p>
          {error instanceof Error
            ? localizeHostError(error.message, bootLanguage)
            : bootCopy.unavailable}
        </p>
        <button onClick={() => location.reload()}>{bootCopy.retry}</button>
      </main>,
    )
  })
window.addEventListener(
  'pagehide',
  () => {
    closed = true
    if (unmount) unmount()
    else root?.unmount()
    void client.dispose()
  },
  { once: true },
)
