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
