import { createRoot } from 'react-dom/client'
import { lazy, Suspense } from 'react'
import App from './App'
import '@heroui/styles'
import './style.css'
const root = document.getElementById('root')
if (!root) throw new Error('图标实验室缺少挂载节点')
const ChatPreview = lazy(() => import('./chat/ChatPreview'))
createRoot(root).render(
  location.pathname === '/chat' || location.pathname === '/chat/' ? (
    <Suspense fallback={<p role="status">正在打开聊天模拟…</p>}>
      <ChatPreview />
    </Suspense>
  ) : (
    <App />
  ),
)
