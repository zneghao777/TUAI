import { createRoot, type Root } from 'react-dom/client'
import { AppClient } from './model/client'
import { mountProductUi } from './ui'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/focus.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/scrollbar.css'
import './theme.css'
import './chat-theme.css'
const container = document.getElementById('root')!
let root: Root | undefined
const client = new AppClient()
let unmount: (() => void) | undefined
let closed = false
const loading = document.createElement('p')
loading.style.padding = '32px'
loading.textContent = '正在连接天质 AI…'
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
        <h1>连接未完成</h1>
        <p>{error instanceof Error ? error.message : 'Host 未就绪'}</p>
        <button onClick={() => location.reload()}>重新连接</button>
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
