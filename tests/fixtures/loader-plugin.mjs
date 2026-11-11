import { Context, Service } from '../../vendor/cordis/lib/index.js'

export const lifecycle = { created: 0, disposed: 0, events: [], ticks: 0 }
export { Context as frameworkIdentity }

export default class Probe extends Service {
  constructor(ctx, config) {
    super(ctx, 'migrationProbe')
    this.value = config.value
    lifecycle.created++
    ctx.on('migration/ping', (value) => lifecycle.events.push(value))
    ctx.effect(() => {
      const timer = setInterval(() => lifecycle.ticks++, 10)
      return () => {
        clearInterval(timer)
        lifecycle.disposed++
      }
    }, 'migration-probe')
  }
}
