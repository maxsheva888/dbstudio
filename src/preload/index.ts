import { contextBridge, ipcRenderer } from 'electron'
import type {
  ConnectionConfig, TestConnectionResult, TableInfo, ColumnInfo, QueryResult,
  ScriptFile, ScriptVersion, ScriptStats, ScriptSuggestions
} from '../shared/types'

contextBridge.exposeInMainWorld('api', {
  connections: {
    list: (): Promise<ConnectionConfig[]> =>
      ipcRenderer.invoke('connections:list'),
    save: (config: ConnectionConfig): Promise<void> =>
      ipcRenderer.invoke('connections:save', config),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('connections:delete', id),
    test: (config: Omit<ConnectionConfig, 'id' | 'createdAt'>): Promise<TestConnectionResult> =>
      ipcRenderer.invoke('connections:test', config)
  },
  schema: {
    connect: (connectionId: string): Promise<string[]> =>
      ipcRenderer.invoke('schema:connect', connectionId),
    disconnect: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke('schema:disconnect', connectionId),
    tables: (connectionId: string, database: string): Promise<TableInfo[]> =>
      ipcRenderer.invoke('schema:tables', connectionId, database),
    columns: (connectionId: string, database: string, table: string): Promise<ColumnInfo[]> =>
      ipcRenderer.invoke('schema:columns', connectionId, database, table)
  },
  query: {
    execute: (connectionId: string, database: string | null, sql: string): Promise<QueryResult> =>
      ipcRenderer.invoke('query:execute', connectionId, database, sql)
  },
  scripts: {
    list: (): Promise<ScriptFile[]> =>
      ipcRenderer.invoke('scripts:list'),
    create: (name: string, scope: string): Promise<ScriptFile> =>
      ipcRenderer.invoke('scripts:create', name, scope),
    rename: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke('scripts:rename', id, name),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('scripts:delete', id),
    versions: (scriptId: string): Promise<ScriptVersion[]> =>
      ipcRenderer.invoke('scripts:versions', scriptId),
    getVersion: (versionId: number): Promise<ScriptVersion | null> =>
      ipcRenderer.invoke('scripts:getVersion', versionId),
    saveVersion: (scriptId: string, content: string): Promise<ScriptVersion> =>
      ipcRenderer.invoke('scripts:saveVersion', scriptId, content),
    logRun: (scriptId: string, versionId: number, connectionId: string, durationMs: number, rowCount: number): Promise<void> =>
      ipcRenderer.invoke('scripts:logRun', scriptId, versionId, connectionId, durationMs, rowCount),
    logError: (scriptId: string, contentHash: string, errorMessage: string, connectionId: string | null): Promise<void> =>
      ipcRenderer.invoke('scripts:logError', scriptId, contentHash, errorMessage, connectionId),
    stats: (scriptId: string): Promise<ScriptStats> =>
      ipcRenderer.invoke('scripts:stats', scriptId),
    suggestions: (activeDb: string | null, activeTable: string | null, threshold?: number): Promise<ScriptSuggestions> =>
      ipcRenderer.invoke('scripts:suggestions', activeDb, activeTable, threshold),
    search: (query: string): Promise<ScriptFile[]> =>
      ipcRenderer.invoke('scripts:search', query)
  }
})
