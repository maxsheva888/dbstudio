import mysql from 'mysql2/promise'
import type { ConnectionConfig, QueryResult, TableInfo, ColumnInfo, TestConnectionResult } from '../../shared/types'
import type { DatabaseAdapter } from './adapter'

const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])
const MAX_ROWS = 2000

export class MySQLAdapter implements DatabaseAdapter {
  private pools = new Map<string, mysql.Pool>()
  private host: string
  private port: number
  private config: ConnectionConfig

  constructor(config: ConnectionConfig, tunnelPort?: number) {
    this.config = config
    this.host = tunnelPort ? '127.0.0.1' : config.host
    this.port = tunnelPort ?? config.port
  }

  private pool(database?: string): mysql.Pool {
    const key = database ?? '__no_db__'
    if (!this.pools.has(key)) {
      this.pools.set(key, mysql.createPool({
        host: this.host,
        port: this.port,
        user: this.config.user,
        password: this.config.password,
        database: database || undefined,
        connectionLimit: 5,
        timezone: 'local'
      }))
    }
    return this.pools.get(key)!
  }

  async query(sql: string, database?: string): Promise<QueryResult> {
    const start = Date.now()
    const [result, fields] = await this.pool(database).query(sql) as
      [mysql.RowDataPacket[] | mysql.ResultSetHeader, mysql.FieldPacket[]]
    const durationMs = Date.now() - start

    if (Array.isArray(result)) {
      const rows = result as mysql.RowDataPacket[]
      return {
        columns: (fields ?? []).map((f) => f.name),
        rows: rows.slice(0, MAX_ROWS).map((r) => ({ ...r })),
        rowCount: rows.length,
        durationMs
      }
    }
    const h = result as mysql.ResultSetHeader
    return { columns: [], rows: [], rowCount: 0, affectedRows: h.affectedRows, durationMs }
  }

  async getDatabases(): Promise<string[]> {
    const [rows] = await this.pool().query<mysql.RowDataPacket[]>('SHOW DATABASES')
    return rows.map((r) => r['Database'] as string).filter((db) => !SYSTEM_DBS.has(db))
  }

  async getTables(database: string): Promise<TableInfo[]> {
    const [rows] = await this.pool().query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME as name, TABLE_TYPE as tableType,
              COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) as sizeBytes
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [database]
    )
    return rows.map((r) => ({
      name: r.name as string,
      tableType: r.tableType as string,
      sizeBytes: Number(r.sizeBytes ?? 0) || 0
    }))
  }

  async getColumns(database: string, table: string): Promise<ColumnInfo[]> {
    const [rows] = await this.pool().query<mysql.RowDataPacket[]>(
      `SELECT
         c.COLUMN_NAME    as name,
         c.COLUMN_TYPE    as type,
         c.IS_NULLABLE    as nullable,
         c.COLUMN_KEY     as \`key\`,
         c.COLUMN_DEFAULT as \`default\`,
         c.EXTRA          as extra,
         MAX(k.REFERENCED_TABLE_NAME) as refTable,
         MAX(s.INDEX_NAME)            as indexName
       FROM information_schema.COLUMNS c
       LEFT JOIN information_schema.KEY_COLUMN_USAGE k
         ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME
         AND k.COLUMN_NAME = c.COLUMN_NAME AND k.REFERENCED_TABLE_NAME IS NOT NULL
       LEFT JOIN information_schema.STATISTICS s
         ON s.TABLE_SCHEMA = c.TABLE_SCHEMA AND s.TABLE_NAME = c.TABLE_NAME
         AND s.COLUMN_NAME = c.COLUMN_NAME AND s.SEQ_IN_INDEX = 1
       WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
       GROUP BY c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_KEY,
                c.COLUMN_DEFAULT, c.EXTRA, c.ORDINAL_POSITION
       ORDER BY c.ORDINAL_POSITION`,
      [database, table]
    )
    return rows.map((r) => ({
      name: r.name as string,
      type: r.type as string,
      nullable: r.nullable === 'YES',
      key: (r.key as string) || '',
      default: r.default as string | null,
      extra: (r.extra as string) || '',
      refTable: (r.refTable as string | null) ?? null,
      indexName: (r.indexName as string | null) ?? null
    }))
  }

  async getDbSizes(): Promise<Record<string, number>> {
    const [rows] = await this.pool().query<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA as db, SUM(COALESCE(DATA_LENGTH + INDEX_LENGTH, 0)) as totalBytes
       FROM information_schema.TABLES GROUP BY TABLE_SCHEMA`
    )
    const out: Record<string, number> = {}
    for (const r of rows) out[r.db as string] = Number(r.totalBytes ?? 0) || 0
    return out
  }

  async close(): Promise<void> {
    for (const p of this.pools.values()) await p.end().catch(() => {})
    this.pools.clear()
  }
}

// ── Legacy helpers used by connections IPC ─────────────────────────────────

export async function testConnection(
  config: Pick<ConnectionConfig, 'host' | 'port' | 'user' | 'password' | 'database'>
): Promise<TestConnectionResult> {
  const start = Date.now()
  let conn: mysql.Connection | null = null
  try {
    conn = await mysql.createConnection({
      host: config.host, port: config.port, user: config.user,
      password: config.password, database: config.database || undefined, connectTimeout: 5000
    })
    await conn.ping()
    return { success: true, message: 'Подключение успешно', latencyMs: Date.now() - start }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    await conn?.end()
  }
}

export async function getDatabases(config: ConnectionConfig): Promise<string[]> {
  const conn = await mysql.createConnection({
    host: config.host, port: config.port, user: config.user,
    password: config.password, connectTimeout: 5000
  })
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SHOW DATABASES')
    return rows.map((r) => r['Database'] as string)
  } finally {
    await conn.end()
  }
}
