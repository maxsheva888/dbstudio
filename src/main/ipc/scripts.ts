import { ipcMain } from 'electron'
import {
  listScripts, createScript, renameScript, deleteScript,
  listVersions, getVersion, saveVersion,
  logRun, logError, getStats,
  getSuggestions, searchScripts,
  logAnonRun, logTableAccess, getRecentTables, getHistory
} from '../scripts/store'

export function registerScriptsHandlers(): void {
  ipcMain.handle('scripts:list', () => listScripts())

  ipcMain.handle('scripts:create', (_e, name: string, scope: string) =>
    createScript(name, scope)
  )

  ipcMain.handle('scripts:rename', (_e, id: string, name: string) => {
    renameScript(id, name)
  })

  ipcMain.handle('scripts:delete', (_e, id: string) => {
    deleteScript(id)
  })

  ipcMain.handle('scripts:versions', (_e, scriptId: string) =>
    listVersions(scriptId)
  )

  ipcMain.handle('scripts:getVersion', (_e, versionId: number) =>
    getVersion(versionId)
  )

  ipcMain.handle('scripts:saveVersion', (_e, scriptId: string, content: string) =>
    saveVersion(scriptId, content)
  )

  ipcMain.handle('scripts:logRun', (
    _e,
    scriptId: string,
    versionId: number,
    connectionId: string,
    durationMs: number,
    rowCount: number
  ) => {
    logRun(scriptId, versionId, connectionId, durationMs, rowCount)
  })

  ipcMain.handle('scripts:logError', (
    _e,
    scriptId: string,
    contentHash: string,
    errorMessage: string,
    connectionId: string | null
  ) => {
    logError(scriptId, contentHash, errorMessage, connectionId)
  })

  ipcMain.handle('scripts:stats', (_e, scriptId: string) =>
    getStats(scriptId)
  )

  ipcMain.handle('scripts:suggestions', (
    _e,
    connectionId: string | null,
    activeDb: string | null,
    activeTable: string | null,
    threshold?: number
  ) => getSuggestions(connectionId, activeDb, activeTable, threshold))

  ipcMain.handle('scripts:search', (_e, query: string) =>
    searchScripts(query)
  )

  ipcMain.handle('scripts:logAnonRun', (
    _e,
    sql: string,
    connectionId: string | null,
    durationMs: number,
    rowCount: number | null
  ) => logAnonRun(sql, connectionId, durationMs, rowCount))

  ipcMain.handle('scripts:logTableAccess', (
    _e,
    connectionId: string,
    dbName: string,
    tableName: string
  ) => logTableAccess(connectionId, dbName, tableName))

  ipcMain.handle('scripts:recentTables', (
    _e,
    connectionId: string,
    dbName: string,
    limit?: number
  ) => getRecentTables(connectionId, dbName, limit))

  ipcMain.handle('scripts:history', (_e, limit?: number) => getHistory(limit))
}
