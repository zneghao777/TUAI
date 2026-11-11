import { Context, Service } from '@deepseek-ai/cordis'
import { defineDomain, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

const spec = defineDomain({
  name: 'tianzhiai_file_library_deletions',
  version: 1,
  global: {
    schema: z.object({ entries: z.array(z.object({ path: z.string(), sourceId: z.string() })) }),
    initial: { entries: [] },
  },
  tables: {},
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    fileLibraryDeletions: FileLibraryDeletions
  }
}

/** Durable tombstones prevent a recreated path from inheriting a deleted output's identity. */
export class FileLibraryDeletions extends Service {
  static inject = ['storageDomain']
  private domain!: Domain<typeof spec>
  private pending: Promise<unknown> = Promise.resolve()
  constructor(ctx: Context) {
    super(ctx, 'fileLibraryDeletions')
  }
  protected async [Service.init]() {
    this.domain = await this.ctx.storageDomain.open(spec)
    this.ctx.effect(() => async () => {
      await this.pending
      await this.domain.close()
    })
  }
  has(path: string, sourceId: string): boolean {
    return this.domain.global
      .get()
      .entries.some((entry) => entry.path === path && entry.sourceId === sourceId)
  }
  add(path: string, sourceId: string): Promise<void> {
    const operation = this.pending.then(async () => {
      if (!this.has(path, sourceId))
        await this.domain.global.set({
          entries: [...this.domain.global.get().entries, { path, sourceId }],
        })
    })
    this.pending = operation.catch(() => {})
    return operation
  }
}
