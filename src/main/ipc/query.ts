import { ipcMain } from 'electron'
import type { RowDataPacket, ResultSetHeader, FieldPacket } from 'mysql2/promise'
import { getPool } from '../connections/pool'
import { logEntry } from '../queryLog'
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

      const ranAt = Date.now()
      try {
        const [result, fields] = await pool.query(trimmed) as [RowDataPacket[] | ResultSetHeader, FieldPacket[]]
        const durationMs = Date.now() - start

        if (Array.isArray(result)) {
          const rows = result as RowDataPacket[]
          const columns = (fields ?? []).map((f) => f.name)
          logEntry({ sql: trimmed, connectionId, database, durationMs, error: null, rowCount: rows.length, ranAt, source: 'user' })
          return {
            columns,
            rows: rows.slice(0, MAX_ROWS).map((r) => ({ ...r })),
            rowCount: rows.length,
            durationMs
          }
        }

        const header = result as ResultSetHeader
        logEntry({ sql: trimmed, connectionId, database, durationMs, error: null, rowCount: header.affectedRows ?? 0, ranAt, source: 'user' })
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          affectedRows: header.affectedRows,
          durationMs
        }
      } catch (err) {
        logEntry({ sql: trimmed, connectionId, database, durationMs: Date.now() - start, error: (err as Error).message, rowCount: null, ranAt, source: 'user' })
        throw err
      }
    }
  )
}
