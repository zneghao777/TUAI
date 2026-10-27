import { createRoot } from 'react-dom/client'
import { AppClient } from './model/client'
import { App } from './App'
import './theme.css'
const root = createRoot(document.getElementById('root')!)
const client = new AppClient()
root.render(<p style={{ padding: 32 }}>正在连接天质 AI…</p>)
void client
  .start()
  .then(() => root.render(<App client={client} />))
  .catch((error) =>
    root.render(
      <main style={{ padding: 32 }}>
        <h1>连接未完成</h1>
        <p>{error instanceof Error ? error.message : 'Host 未就绪'}</p>
        <button onClick={() => location.reload()}>重新连接</button>
      </main>,
    ),
  )
window.addEventListener(
  'pagehide',
  () => {
    root.unmount()
    void client.dispose()
  },
  { once: true },
)
