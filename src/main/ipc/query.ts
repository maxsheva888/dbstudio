import { ipcMain } from 'electron'
import type { RowDataPacket, ResultSetHeader, FieldPacket } from 'mysql2/promise'
import { getPool } from '../connections/pool'
import type { QueryResult } from '../../shared/types'

const MAX_ROWS = 2000

export function registerQueryHandlers(): void {
  ipcMain.handle(
    'query:execute',
    async (_e, connectionId: string, database: string | null, sql: string): Promise<QueryResult> => {
      const pool = getPool(connectionId, database ?? undefined)
      const start = Date.now()

      const trimmed = sql.trim()
      if (!trimmed) throw new Error('Empty query')

      const [result, fields] = await pool.query(trimmed) as [RowDataPacket[] | ResultSetHeader, FieldPacket[]]
      const durationMs = Date.now() - start

      if (Array.isArray(result)) {
        const rows = result as RowDataPacket[]
        const columns = (fields ?? []).map((f) => f.name)
        return {
          columns,
          rows: rows.slice(0, MAX_ROWS).map((r) => ({ ...r })),
          rowCount: rows.length,
          durationMs
        }
      }

      const header = result as ResultSetHeader
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: header.affectedRows,
        durationMs
      }
    }
  )
}
