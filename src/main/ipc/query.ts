import { ipcMain } from 'electron'
import { getAdapter } from '../connections/registry'
import { logEntry } from '../queryLog'
import type { QueryResult } from '../../shared/types'

export function registerQueryHandlers(): void {
  ipcMain.handle(
    'query:execute',
    async (_e, connectionId: string, database: string | null, sql: string): Promise<QueryResult> => {
      const trimmed = sql.trim()
      if (!trimmed) throw new Error('Empty query')

      const ranAt = Date.now()
      try {
        const result = await getAdapter(connectionId).query(trimmed, database ?? undefined)
        logEntry({ sql: trimmed, connectionId, database, durationMs: result.durationMs, error: null, rowCount: result.rowCount, ranAt, source: 'user' })
        return result
      } catch (err) {
        logEntry({ sql: trimmed, connectionId, database, durationMs: Date.now() - ranAt, error: (err as Error).message, rowCount: null, ranAt, source: 'user' })
        throw err
      }
    }
  )
}
