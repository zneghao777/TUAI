import { createHash } from 'node:crypto'
import { load, JSON_SCHEMA } from 'js-yaml'
import { z } from 'zod'
import type { SkillFile, SkillImport } from './types.ts'

const input = z.strictObject({
  source: z.string().trim().min(1).max(200),
  files: z
    .array(z.strictObject({ path: z.string().max(240), data: z.string().max(3_000_000) }))
    .min(1)
    .max(128),
})
const frontmatter = z.object({
  name: z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(2000),
  'disable-model-invocation': z.boolean().optional(),
  'user-invocable': z.boolean().optional(),
})
export interface ParsedSkill {
  name: string
  description: string
  body: string
  files: SkillFile[]
  source: string
  digest: string
  modelInvocable: boolean
  userInvocable: boolean
  requiredTools: string[]
}
export function parsePackage(value: SkillImport): ParsedSkill {
  const parsed = input.safeParse(value)
  if (!parsed.success) throw new Error('技能包不合法：最多 128 个文件，来源不超过 200 字')
  const { files, source } = parsed.data
  const names = new Set<string>()
  let bytes = 0
  for (const file of files) {
    if (
      !file.path ||
      file.path.startsWith('/') ||
      /[\\\x00-\x1f:]/.test(file.path) ||
      file.path.split('/').some((p) => !p || p === '.' || p === '..')
    )
      throw new Error('技能文件路径不合法')
    const key = file.path.normalize('NFC').toLowerCase()
    if (names.has(key)) throw new Error('技能包包含重名文件')
    names.add(key)
    const content = Buffer.from(file.data, 'base64')
    if (content.toString('base64') !== file.data) throw new Error('技能文件编码不合法')
    bytes += content.byteLength
    if (bytes > 2 * 1024 * 1024) throw new Error('技能包不能超过 2 MB')
  }
  const document = files.find((f) => f.path === 'SKILL.md')
  if (!document) throw new Error('技能包根目录需要 SKILL.md')
  const markdown = decodeText(document.data)
  const match = markdown
    ?.replace(/^\uFEFF/, '')
    .match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  if (!match) throw new Error('SKILL.md 需要 YAML 头部和 UTF-8 正文')
  let meta: unknown
  try {
    meta = load(match[1]!, { schema: JSON_SCHEMA })
  } catch {
    throw new Error('SKILL.md 头部不是合法 YAML')
  }
  const fields = frontmatter.safeParse(meta)
  if (!fields.success) throw new Error('请检查技能 name、description 和调用开关')
  const body = match[2]!.trim()
  if (!body) throw new Error('SKILL.md 正文不能为空')
  let requiredTools: string[] = []
  const manifest = files.find((f) => f.path === 'tianzhiai.manifest.json')
  if (manifest) {
    try {
      const data = z
        .object({ requiredTools: z.array(z.string().min(1).max(150)).max(64).default([]) })
        .parse(JSON.parse(decodeText(manifest.data) ?? ''))
      requiredTools = [...new Set(data.requiredTools)]
    } catch {
      throw new Error('tianzhiai.manifest.json 的 requiredTools 必须为工具名数组')
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  return {
    name: fields.data.name,
    description: fields.data.description,
    body,
    files,
    source,
    digest: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    modelInvocable: !fields.data['disable-model-invocation'],
    userInvocable: fields.data['user-invocable'] !== false,
    requiredTools,
  }
}
export function decodeText(data: string): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(data, 'base64'))
  } catch {
    return null
  }
}
