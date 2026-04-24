import Database from 'better-sqlite3'
import { statSync } from 'fs'
import type { ConnectionConfig, QueryResult, TableInfo, ColumnInfo } from '../../shared/types'
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
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
    return rows.map((r) => ({ name: r.name, tableType: 'BASE TABLE', sizeBytes: 0 }))
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
