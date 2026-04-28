export type DbType = 'mysql' | 'postgres' | 'sqlite'

export interface SSHConfig {
  host: string
  port: number
  user: string
  authType: 'password' | 'key'
  password?: string
  keyPath?: string
  passphrase?: string
}

export interface ConnectionConfig {
  id: string
  name: string
  type?: DbType          // default 'mysql' for backwards compat
  host: string
  port: number
  user: string
  password: string
  database?: string
  filePath?: string      // SQLite only
  ssh?: SSHConfig
  tags?: string[]
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
  truncated?: boolean
  affectedRows?: number
  durationMs: number
}

export interface IndexInfo {
  name: string
  columns: string[]
  type: string
  unique: boolean
  nullable: boolean
  kind: 'PK' | 'UNIQUE' | 'INDEX'
  cardinality?: number
}

export interface ForeignKeyInfo {
  name: string
  columns: string[]
  refTable: string
  refColumns: string[]
  onUpdate: string
  onDelete: string
}

// ── ERD / Schema Diagram ─────────────────────────────────────────────────────

export interface ERDColumn {
  name: string
  type: string
  pk: boolean
  fk: string | null  // "refTable.refCol"
  uq: boolean
  idx: boolean
  nn: boolean
}

export interface ERDTableData {
  name: string
  cols: ERDColumn[]
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

export type QueryLogKind =
  | 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE'
  | 'DDL' | 'EXPLAIN' | 'BEGIN' | 'CONNECT' | 'OTHER'

export type QueryLogStatus = 'ok' | 'slow' | 'error' | 'cancelled'

export type QueryLogGrade = 'A' | 'B' | 'C' | 'D' | 'F' | '?'

export interface QueryLogPlan {
  rows: number
  scan: 'pk' | 'index' | 'range' | 'full' | 'meta'
  cost: number
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
  kind: QueryLogKind
  status: QueryLogStatus
  sourceLabel: string
  scriptId?: string
  user: string | null
  tx: boolean
  plan?: QueryLogPlan
  grade: QueryLogGrade
  hints: string[]
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

// ── MCP Server ───────────────────────────────────────────────────────────────

export type McpSafeMode = 'full' | 'safe' | 'read_only'

export interface McpSessionInfo {
  connectionId: string
  database: string
  safeMode: McpSafeMode
}

export interface McpServerStatus {
  running: boolean
  port: number | null
  activeSession: McpSessionInfo | null
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
