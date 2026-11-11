import { Service, type Context } from '@deepseek-ai/cordis'
import { z } from 'zod'

const configSchema = z.strictObject({ label: z.string().min(1) })
declare module '@deepseek-ai/cordis' {
  interface Context {
    tianzhiaiProbe: Probe
  }
  interface Events {
    'tianzhiai/probe/ping'(): void
  }
}

/** Only development.patch.yml enables this P0 lifecycle probe. */
export default class Probe extends Service {
  static Config = configSchema
  public events = 0
  public disposed = false
  public readonly label: string
  public readonly args: readonly string[]

  constructor(ctx: Context, config: z.infer<typeof configSchema>) {
    super(ctx, 'tianzhiaiProbe')
    this.label = config.label
    this.args = ctx.cmdlineArgs?.get() ?? []
    ctx.on('tianzhiai/probe/ping', () => {
      this.events++
    })
    ctx.effect(
      () => () => {
        this.disposed = true
      },
      'tianzhiai-probe',
    )
  }
}
