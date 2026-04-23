export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  user: string
  password: string
  database?: string
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
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  key: string
  default: string | null
  extra: string
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
  /** 'global' | 'db:<dbName>' | 'table:<db>.<table>' */
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
