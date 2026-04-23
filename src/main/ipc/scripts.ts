import { ipcMain } from 'electron'
import {
  listScripts, createScript, renameScript, deleteScript,
  listVersions, getVersion, saveVersion,
  logRun, logError, getStats,
  getSuggestions, searchScripts
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
    activeDb: string | null,
    activeTable: string | null,
    threshold?: number
  ) => getSuggestions(activeDb, activeTable, threshold))

  ipcMain.handle('scripts:search', (_e, query: string) =>
    searchScripts(query)
  )
}
