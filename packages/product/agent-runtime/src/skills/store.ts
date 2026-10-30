import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { parsePackage, decodeText, type ParsedSkill } from './package.ts'
import type {
  SkillDetail,
  SkillEdit,
  SkillFileRead,
  SkillFileValue,
  SkillImport,
  SkillItem,
  SkillMutation,
  SkillUse,
  SkillVersion,
} from './types.ts'

interface ItemRow {
  id: string
  name: string
  revision: number
  enabled: number
  active_version: number | null
}
interface VersionRow {
  version: number
  package: string
  created_at: number
  checked: number
  issues: string
}
/** All state transitions commit with their revision; version content is append-only. */
export class SkillStore {
  private readonly db: DatabaseSync
  constructor(path: string) {
    this.db = new DatabaseSync(path)
    const schema = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    if (schema.user_version > 1) {
      this.db.close()
      throw new Error('技能数据库版本较新，请使用兼容程序')
    }
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, active_version INTEGER);
      CREATE TABLE IF NOT EXISTS skill_versions(skill_id TEXT NOT NULL REFERENCES skills(id), version INTEGER NOT NULL, package TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(skill_id,version));
      CREATE TABLE IF NOT EXISTS skill_checks(skill_id TEXT NOT NULL, version INTEGER NOT NULL, checked INTEGER NOT NULL, issues TEXT NOT NULL, PRIMARY KEY(skill_id,version), FOREIGN KEY(skill_id,version) REFERENCES skill_versions(skill_id,version));
      CREATE TABLE IF NOT EXISTS skill_turns(session_id TEXT NOT NULL, turn INTEGER NOT NULL, selection TEXT NOT NULL, PRIMARY KEY(session_id,turn));
      CREATE TABLE IF NOT EXISTS skill_uses(skill_id TEXT NOT NULL, session_id TEXT NOT NULL, turn INTEGER NOT NULL, version INTEGER NOT NULL, digest TEXT NOT NULL, loaded_at INTEGER NOT NULL, PRIMARY KEY(skill_id,session_id,turn,version), FOREIGN KEY(skill_id,version) REFERENCES skill_versions(skill_id,version)); PRAGMA user_version=1;`)
  }
  close(): void {
    this.db.close()
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  private row(id: string): ItemRow {
    const row = this.db.prepare('SELECT * FROM skills WHERE id=?').get(id) as ItemRow | undefined
    if (!row) throw new Error('技能不存在')
    return row
  }
  private revision(id: string, revision: number) {
    const row = this.row(id)
    if (!Number.isSafeInteger(revision) || row.revision !== revision)
      throw new Error('技能已更新，请刷新后重试')
    return row
  }
  package(id: string, version: number): ParsedSkill {
    const row = this.db
      .prepare('SELECT package FROM skill_versions WHERE skill_id=? AND version=?')
      .get(id, version) as { package: string } | undefined
    if (!row) throw new Error('技能版本不存在')
    return JSON.parse(row.package) as ParsedSkill
  }
  list(): SkillItem[] {
    return (this.db.prepare('SELECT id FROM skills ORDER BY name').all() as { id: string }[]).map(
      (row) => this.item(row.id),
    )
  }
  item(id: string): SkillItem {
    const row = this.row(id)
    const versions = (
      this.db
        .prepare(
          `SELECT v.version,v.package,v.created_at,coalesce(c.checked,0) checked,coalesce(c.issues,'[]') issues
      FROM skill_versions v LEFT JOIN skill_checks c ON c.skill_id=v.skill_id AND c.version=v.version WHERE v.skill_id=? ORDER BY v.version DESC`,
        )
        .all(id) as unknown as VersionRow[]
    ).map((v) => {
      const p = JSON.parse(v.package) as ParsedSkill
      return {
        version: v.version,
        description: p.description,
        digest: p.digest,
        source: p.source,
        createdAt: v.created_at,
        checked: !!v.checked,
        issues: JSON.parse(v.issues) as string[],
        files: p.files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.data, 'base64') })),
        requiredTools: p.requiredTools,
        modelInvocable: p.modelInvocable,
        userInvocable: p.userInvocable,
      } satisfies SkillVersion
    })
    return {
      id: row.id,
      name: row.name,
      revision: row.revision,
      enabled: !!row.enabled,
      activeVersion: row.active_version,
      versions,
    }
  }
  detail(id: string): SkillDetail {
    const uses = this.db
      .prepare(
        'SELECT session_id sessionId,turn,version,digest,loaded_at loadedAt FROM skill_uses WHERE skill_id=? ORDER BY loaded_at DESC LIMIT 50',
      )
      .all(id) as unknown as SkillUse[]
    return { skill: this.item(id), uses }
  }
  import(value: SkillImport): SkillItem {
    const p = parsePackage(value)
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM skills WHERE name=?').get(p.name))
        throw new Error('同名技能已存在，请在详情中创建新版本')
      const id = randomUUID()
      this.db.prepare('INSERT INTO skills(id,name,revision) VALUES(?,?,1)').run(id, p.name)
      this.db
        .prepare('INSERT INTO skill_versions VALUES(?,?,?,?)')
        .run(id, 1, JSON.stringify(p), Date.now())
      return this.item(id)
    })
  }
  edit(value: SkillEdit): SkillItem {
    const p = parsePackage({ files: value.files, source: value.source })
    return this.transaction(() => {
      const row = this.revision(value.id, value.revision)
      if (row.name !== p.name) throw new Error('新版本必须保留技能名称；更名请导入为新技能')
      const current = this.item(value.id)
      if (current.versions.some((v) => v.digest === p.digest)) throw new Error('此内容版本已经存在')
      this.db
        .prepare('INSERT INTO skill_versions VALUES(?,?,?,?)')
        .run(value.id, current.versions[0]!.version + 1, JSON.stringify(p), Date.now())
      this.db.prepare('UPDATE skills SET revision=revision+1 WHERE id=?').run(value.id)
      return this.item(value.id)
    })
  }
  check(value: SkillMutation, tools: readonly string[]): SkillItem {
    return this.transaction(() => {
      this.revision(value.id, value.revision)
      const p = this.package(value.id, value.version)
      const issues = p.requiredTools
        .filter((name) => !tools.includes(name))
        .map((name) => `缺少工具：${name}`)
      this.db
        .prepare('INSERT OR REPLACE INTO skill_checks VALUES(?,?,1,?)')
        .run(value.id, value.version, JSON.stringify(issues))
      this.db.prepare('UPDATE skills SET revision=revision+1 WHERE id=?').run(value.id)
      return this.item(value.id)
    })
  }
  activate(value: SkillMutation, tools: readonly string[]): SkillItem {
    return this.transaction(() => {
      this.revision(value.id, value.revision)
      const version = this.item(value.id).versions.find((v) => v.version === value.version)
      if (
        !version?.checked ||
        version.issues.length ||
        version.requiredTools.some((name) => !tools.includes(name))
      )
        throw new Error('请先通过结构及依赖检查')
      this.db
        .prepare('UPDATE skills SET active_version=?, enabled=1, revision=revision+1 WHERE id=?')
        .run(value.version, value.id)
      return this.item(value.id)
    })
  }
  disable(id: string, revision: number): SkillItem {
    return this.transaction(() => {
      this.revision(id, revision)
      this.db.prepare('UPDATE skills SET enabled=0,revision=revision+1 WHERE id=?').run(id)
      return this.item(id)
    })
  }
  file(request: SkillFileRead): SkillFileValue {
    const file = this.package(request.id, request.version).files.find(
      (f) => f.path === request.path,
    )
    if (!file) throw new Error('技能文件不存在')
    return { ...file, text: decodeText(file.data) }
  }
  selection(sessionId?: string, turn?: number): Record<string, number> {
    const active = () =>
      Object.fromEntries(
        (
          this.db
            .prepare(
              'SELECT id,active_version FROM skills WHERE enabled=1 AND active_version IS NOT NULL',
            )
            .all() as { id: string; active_version: number }[]
        ).map((r) => [r.id, r.active_version]),
      )
    if (!sessionId || turn === undefined) return active()
    return this.transaction(() => {
      const row = this.db
        .prepare('SELECT selection FROM skill_turns WHERE session_id=? AND turn=?')
        .get(sessionId, turn) as { selection: string } | undefined
      if (row) return JSON.parse(row.selection) as Record<string, number>
      const selection = active()
      this.db
        .prepare('INSERT INTO skill_turns VALUES(?,?,?)')
        .run(sessionId, turn, JSON.stringify(selection))
      return selection
    })
  }
  enabled(id: string): boolean {
    return !!this.row(id).enabled
  }
  hasUse(id: string, sessionId: string, turn: number): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM skill_uses WHERE skill_id=? AND session_id=? AND turn=?')
      .get(id, sessionId, turn)
  }
  used(id: string, version: number, sessionId: string, turn: number): void {
    this.db
      .prepare('INSERT OR IGNORE INTO skill_uses VALUES(?,?,?,?,?,?)')
      .run(id, sessionId, turn, version, this.package(id, version).digest, Date.now())
  }
}
