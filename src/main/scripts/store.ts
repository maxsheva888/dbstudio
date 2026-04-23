import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'
import type { ScriptFile, ScriptVersion, RunLog, ErrorLog, ScriptStats } from '../../shared/types'

interface ScriptsData {
  scripts: ScriptFile[]
  versions: ScriptVersion[]
  runLogs: RunLog[]
  errorLogs: ErrorLog[]
  _nextId: number
}

function getStorePath(): string {
  return join(app.getPath('userData'), 'scripts.json')
}

function load(): ScriptsData {
  const path = getStorePath()
  if (!existsSync(path)) {
    return { scripts: [], versions: [], runLogs: [], errorLogs: [], _nextId: 1 }
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ScriptsData
  } catch {
    return { scripts: [], versions: [], runLogs: [], errorLogs: [], _nextId: 1 }
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

  const latest = data.versions
    .filter((v) => v.scriptId === scriptId)
    .sort((a, b) => b.createdAt - a.createdAt)[0]

  if (latest?.hash === hash) return latest

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
