import { once } from 'node:events'
import { loadHostSettings, resolveHostPaths } from '../../packages/product/host-config/lib/index.js'

const paths = resolveHostPaths({ env: { TUAI_HOME: process.argv[2] } })
const start = once(process, 'message')
process.send({ ready: true })
await start
const results = await Promise.allSettled(Array.from({ length: 32 }, () => loadHostSettings(paths)))
process.send(
  {
    ids: results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value.hostId),
    errors: results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason.message),
  },
  () => process.disconnect(),
)
