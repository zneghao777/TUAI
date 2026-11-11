/** Original web seam, tools and providers; credentials stay in the Host store. */
import type { Context } from '@deepseek-ai/cordis'
import Web from '@deepseek-ai/dsh-web'
import * as Fetch from '@deepseek-ai/dsh-web-fetch-http'
import * as Search from '@deepseek-ai/dsh-web-search-deepseek'
import * as Tools from '@deepseek-ai/dsh-tool-web'

export async function mountWebTools(ctx: Context) {
  await ctx.plugin(Web, {})
  await ctx.plugin(Fetch, { userAgent: 'TUAI/0.0.1' })
  await ctx.plugin(Search, { apiKeyEnv: 'deepseek' })
  await ctx.plugin(Tools, {})
}
