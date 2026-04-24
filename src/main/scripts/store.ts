import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'
import type { ScriptFile, ScriptVersion, RunLog, ErrorLog, ScriptStats, ScriptSuggestions, AnonLog, TableAccessLog, HistoryEntry } from '../../shared/types'

interface ScriptsData {
  scripts: ScriptFile[]
  versions: ScriptVersion[]
  runLogs: RunLog[]
  errorLogs: ErrorLog[]
  anonLogs: AnonLog[]
  tableLogs: TableAccessLog[]
  _nextId: number
}

function getStorePath(): string {
  return join(app.getPath('userData'), 'scripts.json')
}

function load(): ScriptsData {
  const path = getStorePath()
  const empty = (): ScriptsData => ({ scripts: [], versions: [], runLogs: [], errorLogs: [], anonLogs: [], tableLogs: [], _nextId: 1 })
  if (!existsSync(path)) return empty()
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as ScriptsData
    // migrate older stores that lack new fields
    if (!data.anonLogs) data.anonLogs = []
    if (!data.tableLogs) data.tableLogs = []
    return data
  } catch {
    return empty()
  }
}

function save(data: ScriptsData): void {
  writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 16)
}

// ── Scripts ──────────────────────────────────────────────────────────────────

export function listScripts(): ScriptFile[] {
  return load().scripts.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function createScript(name: string, scope: string): ScriptFile {
  const data = load()
  const script: ScriptFile = {
    id: randomUUID(),
    name,
    scope,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  data.scripts.push(script)
  save(data)
  return script
}

export function renameScript(id: string, name: string): void {
  const data = load()
  const script = data.scripts.find((s) => s.id === id)
  if (!script) throw new Error(`Script ${id} not found`)
  script.name = name
  script.updatedAt = Date.now()
  save(data)
}

export function deleteScript(id: string): void {
  const data = load()
  data.scripts = data.scripts.filter((s) => s.id !== id)
  data.versions = data.versions.filter((v) => v.scriptId !== id)
  data.runLogs = data.runLogs.filter((r) => r.scriptId !== id)
  data.errorLogs = data.errorLogs.filter((e) => e.scriptId !== id)
  save(data)
}

// ── Versions ─────────────────────────────────────────────────────────────────

export function listVersions(scriptId: string): ScriptVersion[] {
  return load().versions.filter((v) => v.scriptId === scriptId).sort((a, b) => b.createdAt - a.createdAt)
}

export function getVersion(versionId: number): ScriptVersion | null {
  return load().versions.find((v) => v.id === versionId) ?? null
}

export function getLatestVersion(scriptId: string): ScriptVersion | null {
  const versions = listVersions(scriptId)
  return versions[0] ?? null
}

export function saveVersion(scriptId: string, content: string): ScriptVersion {
  const data = load()
  const hash = hashContent(content)

  const existing = data.versions.find((v) => v.scriptId === scriptId && v.hash === hash)
  if (existing) return existing

  const version: ScriptVersion = {
    id: data._nextId++,
    scriptId,
    content,
    hash,
    createdAt: Date.now()
  }
  data.versions.push(version)

  const script = data.scripts.find((s) => s.id === scriptId)
  if (script) script.updatedAt = Date.now()

  save(data)
  return version
}

// ── Run Logs ─────────────────────────────────────────────────────────────────

export function logRun(
  scriptId: string,
  versionId: number,
  connectionId: string,
  durationMs: number,
  rowCount: number
): void {
  const data = load()
  data.runLogs.push({
    id: data._nextId++,
    scriptId,
    versionId,
    connectionId,
    durationMs,
    rowCount,
    ranAt: Date.now()
  })
  save(data)
}

export function logError(
  scriptId: string,
  contentHash: string,
  errorMessage: string,
  connectionId: string | null
): void {
  const data = load()
  data.errorLogs.push({
    id: data._nextId++,
    scriptId,
    contentHash,
    errorMessage,
    connectionId,
    ranAt: Date.now()
  })
  save(data)
}

export function getStats(scriptId: string): ScriptStats {
  const data = load()
  const runs = data.runLogs.filter((r) => r.scriptId === scriptId)
  const errors = data.errorLogs.filter((e) => e.scriptId === scriptId)
  const lastRun = runs.sort((a, b) => b.ranAt - a.ranAt)[0]
  return {
    runCount: runs.length,
    lastRunAt: lastRun?.ranAt ?? null,
    errorCount: errors.length
  }
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export function getSuggestions(
  connectionId: string | null,
  activeDb: string | null,
  activeTable: string | null,
  favouriteThreshold = 5
): ScriptSuggestions {
  const data = load()
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const thirtyDays = 30 * 24 * 60 * 60 * 1000

  // Build stats map
  const statsMap = new Map<string, { runCount: number; lastRunAt: number | null }>()
  for (const script of data.scripts) {
    const runs = data.runLogs.filter((r) => r.scriptId === script.id)
    const lastRun = runs.sort((a, b) => b.ranAt - a.ranAt)[0]
    statsMap.set(script.id, {
      runCount: runs.length,
      lastRunAt: lastRun?.ranAt ?? null
    })
  }

  const favourites = data.scripts
    .filter((s) => (statsMap.get(s.id)?.runCount ?? 0) >= favouriteThreshold)
    .sort((a, b) => (statsMap.get(b.id)?.runCount ?? 0) - (statsMap.get(a.id)?.runCount ?? 0))
    .slice(0, 10)
    .map((s) => ({ ...s, runCount: statsMap.get(s.id)?.runCount ?? 0 }))

  const recent = data.scripts
    .filter((s) => {
      const last = statsMap.get(s.id)?.lastRunAt
      return last != null && now - last < sevenDays
    })
    .sort((a, b) => (statsMap.get(b.id)?.lastRunAt ?? 0) - (statsMap.get(a.id)?.lastRunAt ?? 0))
    .slice(0, 10)
    .map((s) => ({ ...s, lastRunAt: statsMap.get(s.id)?.lastRunAt ?? 0 }))

  const contextual: ScriptFile[] = []
  if (connectionId && activeTable && activeDb) {
    const tableScope = `table:${connectionId}:${activeDb}.${activeTable}`
    contextual.push(...data.scripts.filter((s) => s.scope === tableScope))
  }
  if (connectionId && activeDb) {
    const dbScope = `db:${connectionId}:${activeDb}`
    contextual.push(...data.scripts.filter((s) => s.scope === dbScope && !contextual.find((c) => c.id === s.id)))
  }

  const archiveCandidates = data.scripts
    .filter((s) => {
      const last = statsMap.get(s.id)?.lastRunAt
      return last == null || now - last > thirtyDays
    })
    .map((s) => ({ ...s, lastRunAt: statsMap.get(s.id)?.lastRunAt ?? null }))
    .slice(0, 5)

  return { favourites, recent, contextual, archiveCandidates }
}

// ── Anonymous run log ─────────────────────────────────────────────────────────

export function logAnonRun(
  sql: string,
  connectionId: string | null,
  durationMs: number,
  rowCount: number | null
): void {
  const data = load()
  data.anonLogs.push({
    id: data._nextId++,
    sql: sql.slice(0, 4000),
    connectionId,
    durationMs,
    rowCount,
    ranAt: Date.now()
  })
  // keep last 500 anon logs
  if (data.anonLogs.length > 500) data.anonLogs = data.anonLogs.slice(-500)
  save(data)
}

// ── Table access log ──────────────────────────────────────────────────────────

export function logTableAccess(connectionId: string, dbName: string, tableName: string): void {
  const data = load()
  // remove previous entry for same table, then push to front (most recent)
  data.tableLogs = data.tableLogs.filter(
    (t) => !(t.connectionId === connectionId && t.dbName === dbName && t.tableName === tableName)
  )
  data.tableLogs.unshift({ connectionId, dbName, tableName, accessedAt: Date.now() })
  if (data.tableLogs.length > 200) data.tableLogs = data.tableLogs.slice(0, 200)
  save(data)
}

export function getRecentTables(connectionId: string, dbName: string, limit = 10): string[] {
  const data = load()
  return data.tableLogs
    .filter((t) => t.connectionId === connectionId && t.dbName === dbName)
    .slice(0, limit)
    .map((t) => t.tableName)
}

// ── Unified history ───────────────────────────────────────────────────────────

export function getHistory(limit = 200): HistoryEntry[] {
  const data = load()
  const scriptMap = new Map(data.scripts.map((s) => [s.id, s]))
  const versionMap = new Map(data.versions.map((v) => [v.id, v]))

  const scriptEntries: HistoryEntry[] = data.runLogs.map((r) => {
    const script = scriptMap.get(r.scriptId)
    const version = versionMap.get(r.versionId)
    return {
      id: `script:${r.id}`,
      type: 'script',
      scriptId: r.scriptId,
      scriptName: script?.name ?? '(удалён)',
      sqlPreview: version?.content.slice(0, 200) ?? '',
      connectionId: r.connectionId,
      durationMs: r.durationMs,
      rowCount: r.rowCount,
      ranAt: r.ranAt
    }
  })

  const anonEntries: HistoryEntry[] = data.anonLogs.map((a) => ({
    id: `anon:${a.id}`,
    type: 'anon',
    sqlPreview: a.sql.slice(0, 200),
    connectionId: a.connectionId,
    durationMs: a.durationMs,
    rowCount: a.rowCount,
    ranAt: a.ranAt
  }))

  return [...scriptEntries, ...anonEntries]
    .sort((a, b) => b.ranAt - a.ranAt)
    .slice(0, limit)
}

// ── Full-text search ──────────────────────────────────────────────────────────

export function searchScripts(query: string): ScriptFile[] {
  if (!query.trim()) return listScripts()
  const data = load()
  const q = query.toLowerCase()

  // Build map of scriptId → latest version content
  const latestContent = new Map<string, string>()
  for (const script of data.scripts) {
    const latest = data.versions
      .filter((v) => v.scriptId === script.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    if (latest) latestContent.set(script.id, latest.content.toLowerCase())
  }

  return data.scripts
    .filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (latestContent.get(s.id) ?? '').includes(q)
    )
    .sort((a, b) => {
      const aName = a.name.toLowerCase().startsWith(q) ? 1 : 0
      const bName = b.name.toLowerCase().startsWith(q) ? 1 : 0
      return bName - aName
    })
}
