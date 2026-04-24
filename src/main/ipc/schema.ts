import { ipcMain } from 'electron'
import type { RowDataPacket } from 'mysql2/promise'
import { getPool, openConnection, closeConnection, listConnectedIds } from '../connections/pool'
import { loadConnections } from '../connections/store'
import { logEntry } from '../queryLog'
import type { TableInfo, ColumnInfo } from '../../shared/types'

function findConfig(connectionId: string) {
  const conn = loadConnections().find((c) => c.id === connectionId)
  if (!conn) throw new Error(`Connection not found: ${connectionId}`)
  return conn
}

export function registerSchemaHandlers(): void {
  ipcMain.handle('schema:connect', async (_e, connectionId: string) => {
    const config = findConfig(connectionId)
    openConnection(config)
    const pool = getPool(connectionId)
    const ranAt = Date.now()
    const [rows] = await pool.query<RowDataPacket[]>('SHOW DATABASES')
    logEntry({ sql: 'SHOW DATABASES', connectionId, database: null, durationMs: Date.now() - ranAt, error: null, rowCount: rows.length, ranAt, source: 'system' })
    return rows.map((r) => r['Database'] as string)
  })

  ipcMain.handle('schema:disconnect', (_e, connectionId: string) => {
    closeConnection(connectionId)
  })

  ipcMain.handle('schema:listConnected', () => {
    return listConnectedIds()
  })

  ipcMain.handle('schema:tables', async (_e, connectionId: string, database: string) => {
    const pool = getPool(connectionId)
    const ranAt = Date.now()
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME as name, TABLE_TYPE as tableType,
              COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) as sizeBytes
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME`,
      [database]
    )
    logEntry({ sql: `SHOW TABLE STATUS FROM \`${database}\``, connectionId, database, durationMs: Date.now() - ranAt, error: null, rowCount: rows.length, ranAt, source: 'system' })
    return rows.map((r) => ({
      name: r.name as string,
      tableType: r.tableType as string,
      sizeBytes: Number(r.sizeBytes ?? 0) || 0
    })) as TableInfo[]
  })

  ipcMain.handle('schema:dbSizes', async (_e, connectionId: string) => {
    const pool = getPool(connectionId)
    const sql = `SELECT TABLE_SCHEMA as db, SUM(COALESCE(DATA_LENGTH + INDEX_LENGTH, 0)) as totalBytes FROM information_schema.TABLES GROUP BY TABLE_SCHEMA`
    const ranAt = Date.now()
    const [rows] = await pool.query<RowDataPacket[]>(sql)
    logEntry({ sql, connectionId, database: null, durationMs: Date.now() - ranAt, error: null, rowCount: rows.length, ranAt, source: 'system' })
    const result: Record<string, number> = {}
    for (const r of rows) result[r.db as string] = Number(r.totalBytes ?? 0) || 0
    return result
  })

  ipcMain.handle('schema:columns', async (_e, connectionId: string, database: string, table: string) => {
    const pool = getPool(connectionId)
    const ranAt = Date.now()
    const [rows] = await pool.query<RowDataPacket[]>(
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
         ON  k.TABLE_SCHEMA          = c.TABLE_SCHEMA
         AND k.TABLE_NAME            = c.TABLE_NAME
         AND k.COLUMN_NAME           = c.COLUMN_NAME
         AND k.REFERENCED_TABLE_NAME IS NOT NULL
       LEFT JOIN information_schema.STATISTICS s
         ON  s.TABLE_SCHEMA = c.TABLE_SCHEMA
         AND s.TABLE_NAME   = c.TABLE_NAME
         AND s.COLUMN_NAME  = c.COLUMN_NAME
         AND s.SEQ_IN_INDEX = 1
       WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
       GROUP BY c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_KEY,
                c.COLUMN_DEFAULT, c.EXTRA, c.ORDINAL_POSITION
       ORDER BY c.ORDINAL_POSITION`,
      [database, table]
    )
    const result = rows.map((r) => ({
      name: r.name as string,
      type: r.type as string,
      nullable: r.nullable === 'YES',
      key: r.key as string,
      default: r.default as string | null,
      extra: r.extra as string,
      refTable: (r.refTable as string | null) ?? null,
      indexName: (r.indexName as string | null) ?? null
    })) as ColumnInfo[]
    logEntry({ sql: `SHOW COLUMNS FROM \`${database}\`.\`${table}\``, connectionId, database, durationMs: Date.now() - ranAt, error: null, rowCount: result.length, ranAt, source: 'system' })
    return result
  })
}
