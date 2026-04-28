import { Pool, type PoolClient } from 'pg'
import type { ConnectionConfig, QueryResult, TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo } from '../../shared/types'
import type { DatabaseAdapter } from './adapter'

const SYSTEM_SCHEMAS = new Set([
  'pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1'
])
const MAX_ROWS = 10000

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
        const truncated = rows.length > MAX_ROWS
        return { columns, rows: rows.slice(0, MAX_ROWS), rowCount: rows.length, truncated: truncated || undefined, durationMs }
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

  async getIndexes(schema: string, table: string): Promise<IndexInfo[]> {
    const res = await this.pool().query(
      `SELECT i.relname as name,
              ix.indisunique as unique,
              ix.indisprimary as primary,
              a.attname as col,
              am.amname as type,
              c.reltuples::bigint as cardinality
       FROM pg_index ix
       JOIN pg_class c ON c.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_am am ON am.oid = i.relam
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
       WHERE n.nspname = $1 AND c.relname = $2
       ORDER BY i.relname, a.attnum`,
      [schema, table]
    )
    const map = new Map<string, IndexInfo>()
    for (const r of res.rows) {
      const name = r.name as string
      if (!map.has(name)) {
        const isPk = r.primary as boolean
        const isUniq = r.unique as boolean
        map.set(name, {
          name,
          columns: [],
          type: ((r.type as string) || 'btree').toUpperCase(),
          unique: isUniq,
          nullable: false,
          kind: isPk ? 'PK' : isUniq ? 'UNIQUE' : 'INDEX',
          cardinality: r.cardinality != null ? Number(r.cardinality) : undefined,
        })
      }
      map.get(name)!.columns.push(r.col as string)
    }
    return Array.from(map.values())
  }

  async getForeignKeys(schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const res = await this.pool().query(
      `SELECT tc.constraint_name as name,
              kcu.column_name as col,
              ccu.table_name as ref_table,
              ccu.column_name as ref_col,
              rc.update_rule as on_update,
              rc.delete_rule as on_delete,
              kcu.ordinal_position as pos
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema AND kcu.table_name = tc.table_name
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
       ORDER BY tc.constraint_name, kcu.ordinal_position`,
      [schema, table]
    )
    const map = new Map<string, ForeignKeyInfo>()
    for (const r of res.rows) {
      const name = r.name as string
      if (!map.has(name)) {
        map.set(name, {
          name,
          columns: [],
          refTable: r.ref_table as string,
          refColumns: [],
          onUpdate: (r.on_update as string) || 'NO ACTION',
          onDelete: (r.on_delete as string) || 'NO ACTION',
        })
      }
      const fk = map.get(name)!
      fk.columns.push(r.col as string)
      fk.refColumns.push(r.ref_col as string)
    }
    return Array.from(map.values())
  }

  async getDdl(schema: string, table: string): Promise<string> {
    const res = await this.pool().query(
      `SELECT 'CREATE TABLE ' || quote_ident($1) || '.' || quote_ident($2) || ' (' ||
              chr(10) ||
              string_agg(
                '  ' || quote_ident(column_name) || ' ' ||
                udt_name ||
                CASE WHEN character_maximum_length IS NOT NULL
                     THEN '(' || character_maximum_length || ')'
                     ELSE '' END ||
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
                CASE WHEN column_default IS NOT NULL
                     THEN ' DEFAULT ' || column_default
                     ELSE '' END,
                ',' || chr(10)
                ORDER BY ordinal_position
              ) ||
              chr(10) || ')' as ddl
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, table]
    )
    return (res.rows[0]?.ddl as string) || ''
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
