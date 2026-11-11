import { useSource } from '../bindings'
import type { AppClient } from './client'
import type { ProductLanguage } from './language'

/** Subscribe to the existing Locale service rather than retaining a second preference. */
export function useProductLanguage(client: AppClient): ProductLanguage {
  const active = useSource(client.ctx.locale).active
  return active === 'en' || active === 'it' ? active : 'zh'
}
