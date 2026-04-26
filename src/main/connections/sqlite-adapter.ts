import Database from 'better-sqlite3'
import { statSync } from 'fs'
import type { ConnectionConfig, QueryResult, TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo } from '../../shared/types'
import type { DatabaseAdapter } from './adapter'

const MAX_ROWS = 2000

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database
  private filePath: string

  constructor(config: ConnectionConfig) {
    if (!config.filePath) throw new Error('SQLite требует filePath')
    this.filePath = config.filePath
    this.db = new Database(config.filePath)
  }

  async query(sql: string, _database?: string): Promise<QueryResult> {
    const start = Date.now()
    const stmts = sql.split(';').map((s) => s.trim()).filter(Boolean)
    let last: QueryResult = { columns: [], rows: [], rowCount: 0, durationMs: 0 }

    for (const stmt of stmts) {
      const s = this.db.prepare(stmt)
      if (s.reader) {
        const rows = s.all() as Record<string, unknown>[]
        last = {
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
          rows: rows.slice(0, MAX_ROWS),
          rowCount: rows.length,
          durationMs: Date.now() - start
        }
      } else {
        const r = s.run()
        last = { columns: [], rows: [], rowCount: 0, affectedRows: r.changes, durationMs: Date.now() - start }
      }
    }
    return last
  }

  async getDatabases(): Promise<string[]> {
    return ['main']
  }

  async getTables(_database: string): Promise<TableInfo[]> {
    const rows = this.db
      .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string; type: string }[]

    const sizeMap = new Map<string, number>()
    try {
      const sizeRows = this.db
        .prepare('SELECT name, SUM(pgsize) AS size_bytes FROM dbstat GROUP BY name')
        .all() as { name: string; size_bytes: number }[]
      for (const r of sizeRows) sizeMap.set(r.name, r.size_bytes)
    } catch {
      // dbstat virtual table not available in this build
    }

    return rows.map((r) => ({
      name: r.name,
      tableType: r.type === 'view' ? 'VIEW' : 'BASE TABLE',
      sizeBytes: sizeMap.get(r.name) ?? 0,
    }))
  }

  async getColumns(_database: string, table: string): Promise<ColumnInfo[]> {
    type PRow = { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number }
    const rows = this.db.prepare(`PRAGMA table_info(\`${table.replace(/`/g, '')}\`)`).all() as PRow[]

    // FK info
    type FKRow = { id: number; seq: number; table: string; from: string; to: string }
    const fks = this.db.prepare(`PRAGMA foreign_key_list(\`${table.replace(/`/g, '')}\`)`).all() as FKRow[]
    const fkMap = new Map(fks.map((f) => [f.from, f.table]))

    return rows.map((r) => ({
      name: r.name,
      type: r.type || 'TEXT',
      nullable: r.notnull === 0 && r.pk === 0,
      key: r.pk > 0 ? 'PRI' : (fkMap.has(r.name) ? 'MUL' : ''),
      default: r.dflt_value,
      extra: r.pk > 0 ? 'auto_increment' : '',
      refTable: fkMap.get(r.name) ?? null,
      indexName: null
    }))
  }

  async getIndexes(_database: string, table: string): Promise<IndexInfo[]> {
    const safe = table.replace(/`/g, '')
    type IRow = { seq: number; name: string; unique: number; origin: string; partial: number }
    const idxRows = this.db.prepare(`PRAGMA index_list(\`${safe}\`)`).all() as IRow[]

    const result: IndexInfo[] = []
    // Add implicit primary key from table_info
    type PRow = { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number }
    const cols = this.db.prepare(`PRAGMA table_info(\`${safe}\`)`).all() as PRow[]
    const pkCols = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name)
    if (pkCols.length > 0) {
      result.push({ name: 'PRIMARY', columns: pkCols, type: 'BTREE', unique: true, nullable: false, kind: 'PK' })
    }

    for (const ix of idxRows) {
      if (ix.origin === 'pk') continue // already handled
      type ICRow = { seqno: number; cid: number; name: string }
      const icols = this.db.prepare(`PRAGMA index_info(\`${ix.name.replace(/`/g, '')}\`)`).all() as ICRow[]
      const isUniq = ix.unique === 1
      result.push({
        name: ix.name,
        columns: icols.map((c) => c.name),
        type: 'BTREE',
        unique: isUniq,
        nullable: false,
        kind: isUniq ? 'UNIQUE' : 'INDEX',
      })
    }
    return result
  }

  async getForeignKeys(_database: string, table: string): Promise<ForeignKeyInfo[]> {
    const safe = table.replace(/`/g, '')
    type FRow = { id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string }
    const rows = this.db.prepare(`PRAGMA foreign_key_list(\`${safe}\`)`).all() as FRow[]
    const map = new Map<number, ForeignKeyInfo>()
    for (const r of rows) {
      if (!map.has(r.id)) {
        map.set(r.id, {
          name: `fk_${safe}_${r.id}`,
          columns: [],
          refTable: r.table,
          refColumns: [],
          onUpdate: r.on_update || 'NO ACTION',
          onDelete: r.on_delete || 'NO ACTION',
        })
      }
      const fk = map.get(r.id)!
      fk.columns.push(r.from)
      if (r.to) fk.refColumns.push(r.to)
    }
    return Array.from(map.values())
  }

  async getDdl(_database: string, table: string): Promise<string> {
    const safe = table.replace(/'/g, "''")
    type Row = { sql: string }
    const row = this.db.prepare(`SELECT sql FROM sqlite_master WHERE name = '${safe}'`).get() as Row | undefined
    return row?.sql ?? ''
  }

  async getDbSizes(): Promise<Record<string, number>> {
    try {
      return { main: statSync(this.filePath).size }
    } catch {
      return { main: 0 }
    }
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
