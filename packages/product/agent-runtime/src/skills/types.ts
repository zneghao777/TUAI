/** Browser-safe Skill management contracts. File data is canonical base64. */
export interface SkillFile {
  path: string
  data: string
}
export interface SkillImport {
  files: SkillFile[]
  source: string
}
export interface SkillEdit extends SkillImport {
  id: string
  revision: number
}
export interface SkillMutation {
  id: string
  revision: number
  version: number
}
export interface SkillVersion {
  version: number
  description: string
  digest: string
  source: string
  createdAt: number
  checked: boolean
  issues: string[]
  files: { path: string; bytes: number }[]
  requiredTools: string[]
  modelInvocable: boolean
  userInvocable: boolean
}
export interface SkillItem {
  id: string
  name: string
  revision: number
  enabled: boolean
  activeVersion: number | null
  versions: SkillVersion[]
}
export interface SkillUse {
  sessionId: string
  turn: number
  version: number
  digest: string
  loadedAt: number
}
export interface SkillDetail {
  skill: SkillItem
  uses: SkillUse[]
}
export interface SkillFileRead {
  id: string
  version: number
  path: string
}
export interface SkillFileValue {
  path: string
  data: string
  text: string | null
}
