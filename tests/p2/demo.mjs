// Explicit controlled-model demo, separated from start:web's production model route.
import { fixtureHost } from './fixture-host.mjs'
const host = await fixtureHost({ port: Number(process.env.P2_DEMO_PORT ?? 3101) })
console.log('P2 受控模型演示：真实 Host、工具和持久化；不会调用外部模型。')
console.log(host.login)
let closing = false
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    if (closing) return
    closing = true
    await host.dispose()
  })
