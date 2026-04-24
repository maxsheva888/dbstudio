import { ipcMain } from 'electron'
import { openConnection, closeConnection, listConnectedIds, getAdapter } from '../connections/registry'
import { loadConnections } from '../connections/store'
import { logEntry } from '../queryLog'

function findConfig(connectionId: string) {
  const conn = loadConnections().find((c) => c.id === connectionId)
  if (!conn) throw new Error(`Connection not found: ${connectionId}`)
  return conn
}

export function registerSchemaHandlers(): void {
  ipcMain.handle('schema:connect', async (_e, connectionId: string) => {
    const config = findConfig(connectionId)
    await openConnection(config)
    const ranAt = Date.now()
    const databases = await getAdapter(connectionId).getDatabases()
    logEntry({ sql: 'SHOW DATABASES', connectionId, database: null, durationMs: Date.now() - ranAt, error: null, rowCount: databases.length, ranAt, source: 'system' })
    return databases
  })

  ipcMain.handle('schema:disconnect', async (_e, connectionId: string) => {
    await closeConnection(connectionId)
  })

  ipcMain.handle('schema:listConnected', () => {
    return listConnectedIds()
  })

  ipcMain.handle('schema:tables', async (_e, connectionId: string, database: string) => {
    const ranAt = Date.now()
    const tables = await getAdapter(connectionId).getTables(database)
    logEntry({ sql: `SHOW TABLE STATUS FROM \`${database}\``, connectionId, database, durationMs: Date.now() - ranAt, error: null, rowCount: tables.length, ranAt, source: 'system' })
    return tables
  })

  ipcMain.handle('schema:dbSizes', async (_e, connectionId: string) => {
    return getAdapter(connectionId).getDbSizes()
  })

  ipcMain.handle('schema:columns', async (_e, connectionId: string, database: string, table: string) => {
    const ranAt = Date.now()
    const columns = await getAdapter(connectionId).getColumns(database, table)
    logEntry({ sql: `SHOW COLUMNS FROM \`${database}\`.\`${table}\``, connectionId, database, durationMs: Date.now() - ranAt, error: null, rowCount: columns.length, ranAt, source: 'system' })
    return columns
  })
}
