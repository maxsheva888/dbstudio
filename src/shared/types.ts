export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  user: string
  password: string
  database?: string
  tag?: string
  createdAt: string
}

export interface TestConnectionResult {
  success: boolean
  message: string
  latencyMs?: number
}

export interface TableInfo {
  name: string
  tableType: 'BASE TABLE' | 'VIEW' | string
  sizeBytes?: number
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  key: string
  default: string | null
  extra: string
  refTable?: string | null
  indexName?: string | null
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  affectedRows?: number
  durationMs: number
}

// ── Script Library ───────────────────────────────────────────────────────────

export interface ScriptFile {
  id: string
  name: string
  /** 'global' | 'db:<connectionId>:<dbName>' | 'table:<connectionId>:<dbName>.<table>' */
  scope: string
  createdAt: number
  updatedAt: number
}

export interface ScriptVersion {
  id: number
  scriptId: string
  content: string
  hash: string
  createdAt: number
}

export interface RunLog {
  id: number
  scriptId: string
  versionId: number
  connectionId: string
  durationMs: number
  rowCount: number
  ranAt: number
}

export interface ErrorLog {
  id: number
  scriptId: string
  contentHash: string
  errorMessage: string
  connectionId: string | null
  ranAt: number
}

export interface ScriptStats {
  runCount: number
  lastRunAt: number | null
  errorCount: number
}

export interface ScriptSuggestions {
  favourites: Array<ScriptFile & { runCount: number }>
  recent: Array<ScriptFile & { lastRunAt: number }>
  contextual: ScriptFile[]
  archiveCandidates: Array<ScriptFile & { lastRunAt: number | null }>
}

export interface QueryLogEntry {
  id: number
  sql: string
  connectionId: string | null
  database: string | null
  durationMs: number | null
  error: string | null
  rowCount: number | null
  ranAt: number
  source: 'user' | 'system'
}

export interface AnonLog {
  id: number
  sql: string
  connectionId: string | null
  durationMs: number
  rowCount: number | null
  ranAt: number
}

export interface TableAccessLog {
  connectionId: string
  dbName: string
  tableName: string
  accessedAt: number
}

export interface HistoryEntry {
  id: string
  type: 'script' | 'anon'
  scriptId?: string
  scriptName?: string
  sqlPreview: string
  connectionId: string | null
  durationMs: number
  rowCount: number | null
  ranAt: number
}
