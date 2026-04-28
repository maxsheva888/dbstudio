import { app } from 'electron'
import { join } from 'path'
import { existsSync, renameSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'
import Database, { type Database as DB } from 'better-sqlite3'
import type {
  ScriptFile, ScriptVersion, RunLog, ErrorLog,
  ScriptStats, ScriptSuggestions, AnonLog, TableAccessLog, HistoryEntry
} from '../../shared/types'

// ── DB singleton ──────────────────────────────────────────────────────────────

let _db: DB | null = null

function db(): DB {
  if (_db) return _db
  _db = new Database(join(app.getPath('userData'), 'dbstudio.db'))
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  maybeMigrateFromJson(_db)
  return _db
}

// ── Schema ────────────────────────────────────────────────────────────────────

function initSchema(d: DB): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id         TEXT    PRIMARY KEY,
      name       TEXT    NOT NULL,
      scope      TEXT    NOT NULL DEFAULT 'global',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS script_versions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id  TEXT    NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      content    TEXT    NOT NULL,
      hash       TEXT    NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(script_id, hash)
    );

    CREATE TABLE IF NOT EXISTS run_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id     TEXT    NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      version_id    INTEGER NOT NULL,
      connection_id TEXT    NOT NULL,
      duration_ms   INTEGER NOT NULL,
      row_count     INTEGER NOT NULL,
      ran_at        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id     TEXT    NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      content_hash  TEXT    NOT NULL,
      error_message TEXT    NOT NULL,
      connection_id TEXT,
      ran_at        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anon_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sql           TEXT    NOT NULL,
      connection_id TEXT,
      duration_ms   INTEGER NOT NULL,
      row_count     INTEGER,
      ran_at        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS table_access_logs (
      connection_id TEXT    NOT NULL,
      db_name       TEXT    NOT NULL,
      table_name    TEXT    NOT NULL,
      accessed_at   INTEGER NOT NULL,
      PRIMARY KEY (connection_id, db_name, table_name)
    );

    CREATE INDEX IF NOT EXISTS idx_sv_script  ON script_versions(script_id);
    CREATE INDEX IF NOT EXISTS idx_rl_script  ON run_logs(script_id);
    CREATE INDEX IF NOT EXISTS idx_rl_ran_at  ON run_logs(ran_at);
    CREATE INDEX IF NOT EXISTS idx_el_script  ON error_logs(script_id);
    CREATE INDEX IF NOT EXISTS idx_al_ran_at  ON anon_logs(ran_at);
  `)
}

// ── Migration from scripts.json ───────────────────────────────────────────────

interface LegacyData {
  scripts: ScriptFile[]
  versions: ScriptVersion[]
  runLogs: RunLog[]
  errorLogs: ErrorLog[]
  anonLogs: AnonLog[]
  tableLogs: TableAccessLog[]
}

function maybeMigrateFromJson(d: DB): void {
  const jsonPath = join(app.getPath('userData'), 'scripts.json')
  if (!existsSync(jsonPath)) return

  // Skip if already have data
  const count = (d.prepare('SELECT COUNT(*) as n FROM scripts').get() as { n: number }).n
  if (count > 0) { safeRename(jsonPath); return }

  let legacy: LegacyData
  try {
    legacy = JSON.parse(readFileSync(jsonPath, 'utf-8')) as LegacyData
  } catch { safeRename(jsonPath); return }

  const migrate = d.transaction(() => {
    const insScript  = d.prepare('INSERT OR IGNORE INTO scripts (id,name,scope,created_at,updated_at) VALUES (?,?,?,?,?)')
    const insVersion = d.prepare('INSERT OR IGNORE INTO script_versions (id,script_id,content,hash,created_at) VALUES (?,?,?,?,?)')
    const insRun     = d.prepare('INSERT OR IGNORE INTO run_logs (id,script_id,version_id,connection_id,duration_ms,row_count,ran_at) VALUES (?,?,?,?,?,?,?)')
    const insErr     = d.prepare('INSERT OR IGNORE INTO error_logs (id,script_id,content_hash,error_message,connection_id,ran_at) VALUES (?,?,?,?,?,?)')
    const insAnon    = d.prepare('INSERT OR IGNORE INTO anon_logs (id,sql,connection_id,duration_ms,row_count,ran_at) VALUES (?,?,?,?,?,?)')
    const insTable   = d.prepare('INSERT OR REPLACE INTO table_access_logs (connection_id,db_name,table_name,accessed_at) VALUES (?,?,?,?)')

    for (const s of legacy.scripts ?? [])
      insScript.run(s.id, s.name, s.scope, s.createdAt, s.updatedAt)
    for (const v of legacy.versions ?? [])
      insVersion.run(v.id, v.scriptId, v.content, v.hash, v.createdAt)
    for (const r of legacy.runLogs ?? [])
      insRun.run(r.id, r.scriptId, r.versionId, r.connectionId, r.durationMs, r.rowCount, r.ranAt)
    for (const e of legacy.errorLogs ?? [])
      insErr.run(e.id, e.scriptId, e.contentHash, e.errorMessage, e.connectionId, e.ranAt)
    for (const a of legacy.anonLogs ?? [])
      insAnon.run(a.id, a.sql, a.connectionId, a.durationMs, a.rowCount, a.ranAt)
    for (const t of legacy.tableLogs ?? [])
      insTable.run(t.connectionId, t.dbName, t.tableName, t.accessedAt)
  })

  migrate()
  safeRename(jsonPath)
}

function safeRename(path: string): void {
  try { renameSync(path, path + '.migrated') } catch {}
}

// ── Row mappers ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function mapScript(r: Row): ScriptFile {
  return { id: r.id as string, name: r.name as string, scope: r.scope as string, createdAt: r.created_at as number, updatedAt: r.updated_at as number }
}

function mapVersion(r: Row): ScriptVersion {
  return { id: r.id as number, scriptId: r.script_id as string, content: r.content as string, hash: r.hash as string, createdAt: r.created_at as number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 16)
}

// ── Scripts ───────────────────────────────────────────────────────────────────

export function listScripts(): ScriptFile[] {
  return (db().prepare('SELECT * FROM scripts ORDER BY updated_at DESC').all() as Row[]).map(mapScript)
}

export function createScript(name: string, scope: string): ScriptFile {
  const script: ScriptFile = { id: randomUUID(), name, scope, createdAt: Date.now(), updatedAt: Date.now() }
  db().prepare('INSERT INTO scripts (id,name,scope,created_at,updated_at) VALUES (?,?,?,?,?)').run(script.id, script.name, script.scope, script.createdAt, script.updatedAt)
  return script
}

export function renameScript(id: string, name: string): void {
  const info = db().prepare('UPDATE scripts SET name=?, updated_at=? WHERE id=?').run(name, Date.now(), id)
  if (!info.changes) throw new Error(`Script ${id} not found`)
}

export function deleteScript(id: string): void {
  db().prepare('DELETE FROM scripts WHERE id=?').run(id)
}

// ── Versions ──────────────────────────────────────────────────────────────────

export function listVersions(scriptId: string): ScriptVersion[] {
  return (db().prepare('SELECT * FROM script_versions WHERE script_id=? ORDER BY created_at DESC').all(scriptId) as Row[]).map(mapVersion)
}

export function getVersion(versionId: number): ScriptVersion | null {
  const r = db().prepare('SELECT * FROM script_versions WHERE id=?').get(versionId) as Row | undefined
  return r ? mapVersion(r) : null
}

export function getLatestVersion(scriptId: string): ScriptVersion | null {
  const r = db().prepare('SELECT * FROM script_versions WHERE script_id=? ORDER BY created_at DESC LIMIT 1').get(scriptId) as Row | undefined
  return r ? mapVersion(r) : null
}

export function saveVersion(scriptId: string, content: string): ScriptVersion {
  const hash = hashContent(content)
  const existing = db().prepare('SELECT * FROM script_versions WHERE script_id=? AND hash=?').get(scriptId, hash) as Row | undefined
  if (existing) return mapVersion(existing)

  const info = db().prepare('INSERT INTO script_versions (script_id,content,hash,created_at) VALUES (?,?,?,?)').run(scriptId, content, hash, Date.now())
  db().prepare('UPDATE scripts SET updated_at=? WHERE id=?').run(Date.now(), scriptId)
  return mapVersion(db().prepare('SELECT * FROM script_versions WHERE id=?').get(info.lastInsertRowid) as Row)
}

// ── Run / Error logs ──────────────────────────────────────────────────────────

export function logRun(scriptId: string, versionId: number, connectionId: string, durationMs: number, rowCount: number): void {
  db().prepare('INSERT INTO run_logs (script_id,version_id,connection_id,duration_ms,row_count,ran_at) VALUES (?,?,?,?,?,?)').run(scriptId, versionId, connectionId, durationMs, rowCount, Date.now())
}

export function logError(scriptId: string, contentHash: string, errorMessage: string, connectionId: string | null): void {
  db().prepare('INSERT INTO error_logs (script_id,content_hash,error_message,connection_id,ran_at) VALUES (?,?,?,?,?)').run(scriptId, contentHash, errorMessage, connectionId, Date.now())
}

export function getStats(scriptId: string): ScriptStats {
  const r = db().prepare('SELECT COUNT(*) as cnt, MAX(ran_at) as last FROM run_logs WHERE script_id=?').get(scriptId) as { cnt: number; last: number | null }
  const e = db().prepare('SELECT COUNT(*) as cnt FROM error_logs WHERE script_id=?').get(scriptId) as { cnt: number }
  return { runCount: r.cnt, lastRunAt: r.last ?? null, errorCount: e.cnt }
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export function getSuggestions(connectionId: string | null, activeDb: string | null, activeTable: string | null, favouriteThreshold = 5): ScriptSuggestions {
  const now = Date.now()
  const sevenDays  = 7  * 24 * 60 * 60 * 1000
  const thirtyDays = 30 * 24 * 60 * 60 * 1000

  const favourites = (db().prepare(`
    SELECT s.*, COUNT(r.id) as run_count
    FROM scripts s JOIN run_logs r ON r.script_id = s.id
    GROUP BY s.id HAVING run_count >= ?
    ORDER BY run_count DESC LIMIT 10`).all(favouriteThreshold) as Row[])
    .map((r) => ({ ...mapScript(r), runCount: r.run_count as number }))

  const recent = (db().prepare(`
    SELECT s.*, MAX(r.ran_at) as last_run_at
    FROM scripts s JOIN run_logs r ON r.script_id = s.id
    WHERE r.ran_at > ?
    GROUP BY s.id ORDER BY last_run_at DESC LIMIT 10`).all(now - sevenDays) as Row[])
    .map((r) => ({ ...mapScript(r), lastRunAt: r.last_run_at as number }))

  const scopes: string[] = []
  if (connectionId && activeTable && activeDb) scopes.push(`table:${connectionId}:${activeDb}.${activeTable}`)
  if (connectionId && activeDb) scopes.push(`db:${connectionId}:${activeDb}`)
  const contextual = scopes.length
    ? (db().prepare(`SELECT * FROM scripts WHERE scope IN (${scopes.map(() => '?').join(',')}) ORDER BY updated_at DESC`).all(...scopes) as Row[]).map(mapScript)
    : []

  const archiveCandidates = (db().prepare(`
    SELECT s.*, MAX(r.ran_at) as last_run_at
    FROM scripts s LEFT JOIN run_logs r ON r.script_id = s.id
    GROUP BY s.id
    HAVING last_run_at IS NULL OR last_run_at < ?
    LIMIT 5`).all(now - thirtyDays) as Row[])
    .map((r) => ({ ...mapScript(r), lastRunAt: (r.last_run_at as number | null) ?? null }))

  return { favourites, recent, contextual, archiveCandidates }
}

// ── Anonymous run log ─────────────────────────────────────────────────────────

export function logAnonRun(sql: string, connectionId: string | null, durationMs: number, rowCount: number | null): void {
  db().prepare('INSERT INTO anon_logs (sql,connection_id,duration_ms,row_count,ran_at) VALUES (?,?,?,?,?)').run(sql.slice(0, 4000), connectionId, durationMs, rowCount, Date.now())
  // keep last 500
  db().prepare('DELETE FROM anon_logs WHERE id NOT IN (SELECT id FROM anon_logs ORDER BY ran_at DESC LIMIT 500)').run()
}

// ── Table access log ──────────────────────────────────────────────────────────

export function logTableAccess(connectionId: string, dbName: string, tableName: string): void {
  db().prepare('INSERT OR REPLACE INTO table_access_logs (connection_id,db_name,table_name,accessed_at) VALUES (?,?,?,?)').run(connectionId, dbName, tableName, Date.now())
}

export function getRecentTables(connectionId: string, dbName: string, limit = 10): string[] {
  return (db().prepare('SELECT table_name FROM table_access_logs WHERE connection_id=? AND db_name=? ORDER BY accessed_at DESC LIMIT ?').all(connectionId, dbName, limit) as { table_name: string }[]).map((r) => r.table_name)
}

// ── Unified history ───────────────────────────────────────────────────────────

export function getHistory(limit = 200): HistoryEntry[] {
  const rows = db().prepare(`
    SELECT 'script:' || r.id AS id, 'script' AS type,
           r.script_id, s.name AS script_name,
           substr(COALESCE(v.content,''), 1, 200) AS sql_preview,
           r.connection_id, r.duration_ms, r.row_count, r.ran_at
    FROM run_logs r
    JOIN scripts s ON s.id = r.script_id
    LEFT JOIN script_versions v ON v.id = r.version_id
    UNION ALL
    SELECT 'anon:' || a.id, 'anon', NULL, NULL,
           substr(a.sql, 1, 200), a.connection_id, a.duration_ms, a.row_count, a.ran_at
    FROM anon_logs a
    ORDER BY ran_at DESC LIMIT ?`).all(limit) as Row[]

  return rows.map((r) => ({
    id: r.id as string,
    type: r.type as 'script' | 'anon',
    scriptId: r.script_id as string | undefined,
    scriptName: r.script_name as string | undefined,
    sqlPreview: (r.sql_preview as string) ?? '',
    connectionId: r.connection_id as string | null,
    durationMs: r.duration_ms as number,
    rowCount: r.row_count as number | null,
    ranAt: r.ran_at as number
  }))
}

// ── Full-text search ──────────────────────────────────────────────────────────

export function searchScripts(query: string): ScriptFile[] {
  if (!query.trim()) return listScripts()
  const q = `%${query.toLowerCase()}%`
  return (db().prepare(`
    SELECT DISTINCT s.*
    FROM scripts s
    LEFT JOIN script_versions v ON v.script_id = s.id
      AND v.id = (SELECT MAX(id) FROM script_versions WHERE script_id = s.id)
    WHERE lower(s.name) LIKE ? OR lower(COALESCE(v.content,'')) LIKE ?
    ORDER BY CASE WHEN lower(s.name) LIKE ? THEN 0 ELSE 1 END, s.updated_at DESC`
  ).all(q, q, `${query.toLowerCase()}%`) as Row[]).map(mapScript)
}
