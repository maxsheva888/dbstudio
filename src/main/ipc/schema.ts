import { ipcMain } from 'electron'
import type { RowDataPacket } from 'mysql2/promise'
import { getPool, openConnection, closeConnection } from '../connections/pool'
import { loadConnections } from '../connections/store'
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
    const [rows] = await pool.query<RowDataPacket[]>('SHOW DATABASES')
    return rows.map((r) => r['Database'] as string)
  })

  ipcMain.handle('schema:disconnect', (_e, connectionId: string) => {
    closeConnection(connectionId)
  })

  ipcMain.handle('schema:tables', async (_e, connectionId: string, database: string) => {
    const pool = getPool(connectionId)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME as name, TABLE_TYPE as tableType
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME`,
      [database]
    )
    return rows as TableInfo[]
  })

  ipcMain.handle('schema:columns', async (_e, connectionId: string, database: string, table: string) => {
    const pool = getPool(connectionId)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COLUMN_NAME    as name,
         COLUMN_TYPE    as type,
         IS_NULLABLE    as nullable,
         COLUMN_KEY     as \`key\`,
         COLUMN_DEFAULT as \`default\`,
         EXTRA          as extra
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [database, table]
    )
    return rows.map((r) => ({
      name: r.name as string,
      type: r.type as string,
      nullable: r.nullable === 'YES',
      key: r.key as string,
      default: r.default as string | null,
      extra: r.extra as string
    })) as ColumnInfo[]
  })
}
