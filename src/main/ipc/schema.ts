import { ipcMain } from 'electron'
import { openConnection, closeConnection, listConnectedIds, getAdapter } from '../connections/registry'
import { loadConnections } from '../connections/store'
import { logEntry } from '../queryLog'
import type { ERDTableData } from '../../shared/types'

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

  ipcMain.handle('schema:indexes', async (_e, connectionId: string, database: string, table: string) => {
    return getAdapter(connectionId).getIndexes(database, table)
  })

  ipcMain.handle('schema:foreignKeys', async (_e, connectionId: string, database: string, table: string) => {
    return getAdapter(connectionId).getForeignKeys(database, table)
  })

  ipcMain.handle('schema:ddl', async (_e, connectionId: string, database: string, table: string) => {
    return getAdapter(connectionId).getDdl(database, table)
  })

  ipcMain.handle('schema:erd', async (_e, connectionId: string, database: string): Promise<ERDTableData[]> => {
    const adapter = getAdapter(connectionId)
    const tables = await adapter.getTables(database)
    const baseTables = tables.filter((t) => t.tableType === 'BASE TABLE')

    const results = await Promise.all(
      baseTables.map(async (t) => {
        const [cols, fks] = await Promise.all([
          adapter.getColumns(database, t.name),
          adapter.getForeignKeys(database, t.name),
        ])
        const fkMap = new Map<string, string>()
        fks.forEach((fk) => {
          fk.columns.forEach((col, i) => {
            fkMap.set(col, `${fk.refTable}.${fk.refColumns[i] ?? fk.refColumns[0]}`)
          })
        })
        return {
          name: t.name,
          cols: cols.map((c) => ({
            name: c.name,
            type: c.type,
            pk: c.key === 'PRI',
            fk: fkMap.get(c.name) ?? null,
            uq: c.key === 'UNI',
            idx: c.key === 'MUL' && !fkMap.has(c.name),
            nn: !c.nullable,
          })),
        }
      })
    )
    return results
  })
}
