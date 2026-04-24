import { Pool, type PoolClient } from 'pg'
import type { ConnectionConfig, QueryResult, TableInfo, ColumnInfo } from '../../shared/types'
import type { DatabaseAdapter } from './adapter'

const SYSTEM_SCHEMAS = new Set([
  'pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1'
])
const MAX_ROWS = 2000

export class PostgresAdapter implements DatabaseAdapter {
  private _pool: Pool | null = null
  private host: string
  private port: number
  private config: ConnectionConfig

  constructor(config: ConnectionConfig, tunnelPort?: number) {
    this.config = config
    this.host = tunnelPort ? '127.0.0.1' : config.host
    this.port = tunnelPort ?? config.port
  }

  private pool(): Pool {
    if (!this._pool) {
      this._pool = new Pool({
        host: this.host,
        port: this.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database || 'postgres',
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000
      })
    }
    return this._pool
  }

  async query(sql: string, schema?: string): Promise<QueryResult> {
    const client: PoolClient = await this.pool().connect()
    const start = Date.now()
    try {
      if (schema) await client.query(`SET search_path = "${schema.replace(/"/g, '')}"`)
      const res = await client.query(sql)
      const durationMs = Date.now() - start
      const columns = (res.fields ?? []).map((f) => f.name)
      if (columns.length > 0) {
        const rows = (res.rows ?? []) as Record<string, unknown>[]
        return { columns, rows: rows.slice(0, MAX_ROWS), rowCount: rows.length, durationMs }
      }
      return { columns: [], rows: [], rowCount: 0, affectedRows: res.rowCount ?? 0, durationMs }
    } finally {
      client.release()
    }
  }

  async getDatabases(): Promise<string[]> {
    const res = await this.pool().query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT LIKE 'pg_%' AND schema_name != 'information_schema'
       ORDER BY schema_name`
    )
    return res.rows.map((r) => r.schema_name).filter((s) => !SYSTEM_SCHEMAS.has(s))
  }

  async getTables(schema: string): Promise<TableInfo[]> {
    const res = await this.pool().query<{ name: string; tableType: string; sizeBytes: string }>(
      `SELECT table_name as name, table_type as "tableType",
              pg_total_relation_size(quote_ident($1) || '.' || quote_ident(table_name))::bigint as "sizeBytes"
       FROM information_schema.tables
       WHERE table_schema = $1 ORDER BY table_name`,
      [schema]
    )
    return res.rows.map((r) => ({
      name: r.name,
      tableType: r.tableType === 'BASE TABLE' ? 'BASE TABLE' : r.tableType,
      sizeBytes: Number(r.sizeBytes ?? 0)
    }))
  }

  async getColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const res = await this.pool().query(
      `SELECT
         c.column_name                                                    as name,
         c.udt_name                                                       as type,
         c.is_nullable                                                    as nullable,
         CASE WHEN pk.column_name IS NOT NULL THEN 'PRI'
              WHEN uq.column_name IS NOT NULL THEN 'UNI'
              WHEN ix.attname    IS NOT NULL THEN 'MUL'
              ELSE '' END                                                 as key,
         c.column_default                                                 as "default",
         CASE WHEN c.is_identity = 'YES' THEN 'auto_increment' ELSE '' END as extra,
         fk.foreign_table                                                 as "refTable",
         fk.constraint_name                                               as "indexName"
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT ku.column_name FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage ku
           ON ku.constraint_name = tc.constraint_name AND ku.table_schema = tc.table_schema AND ku.table_name = tc.table_name
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
       ) pk ON pk.column_name = c.column_name
       LEFT JOIN (
         SELECT ku.column_name FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage ku
           ON ku.constraint_name = tc.constraint_name AND ku.table_schema = tc.table_schema AND ku.table_name = tc.table_name
         WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = $1 AND tc.table_name = $2
       ) uq ON uq.column_name = c.column_name
       LEFT JOIN (
         SELECT DISTINCT a.attname FROM pg_index xi
         JOIN pg_class t ON t.oid = xi.indrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(xi.indkey)
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = $1 AND t.relname = $2
       ) ix ON ix.attname = c.column_name
       LEFT JOIN (
         SELECT ku.column_name, ccu.table_name as foreign_table, tc.constraint_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage ku
           ON ku.constraint_name = tc.constraint_name AND ku.table_schema = tc.table_schema AND ku.table_name = tc.table_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
       ) fk ON fk.column_name = c.column_name
       WHERE c.table_schema = $1 AND c.table_name = $2
       ORDER BY c.ordinal_position`,
      [schema, table]
    )
    return res.rows.map((r) => ({
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
    const res = await this.pool().query<{ schema: string; total_bytes: string }>(
      `SELECT schemaname as schema,
              SUM(pg_total_relation_size(schemaname || '.' || tablename))::bigint as total_bytes
       FROM pg_tables
       WHERE schemaname NOT LIKE 'pg_%' AND schemaname != 'information_schema'
       GROUP BY schemaname`
    )
    const out: Record<string, number> = {}
    for (const r of res.rows) out[r.schema] = Number(r.total_bytes ?? 0)
    return out
  }

  async close(): Promise<void> {
    await this._pool?.end().catch(() => {})
    this._pool = null
  }
}
