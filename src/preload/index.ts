import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ConnectionConfig, TestConnectionResult, TableInfo, ColumnInfo, QueryResult,
  IndexInfo, ForeignKeyInfo, ERDTableData,
  ScriptFile, ScriptVersion, ScriptStats, ScriptSuggestions, HistoryEntry, QueryLogEntry,
  McpSafeMode, McpServerStatus,
} from '../shared/types'

type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }

contextBridge.exposeInMainWorld('api', {
  connections: {
    list: (): Promise<ConnectionConfig[]> =>
      ipcRenderer.invoke('connections:list'),
    save: (config: ConnectionConfig): Promise<void> =>
      ipcRenderer.invoke('connections:save', config),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('connections:delete', id),
    test: (config: Omit<ConnectionConfig, 'id' | 'createdAt'>): Promise<TestConnectionResult> =>
      ipcRenderer.invoke('connections:test', config),
    pickFile: (mode: 'sqlite' | 'sshkey'): Promise<string | null> =>
      ipcRenderer.invoke('connections:pickFile', mode)
  },
  schema: {
    connect: (connectionId: string): Promise<string[]> =>
      ipcRenderer.invoke('schema:connect', connectionId),
    disconnect: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke('schema:disconnect', connectionId),
    listConnected: (): Promise<string[]> =>
      ipcRenderer.invoke('schema:listConnected'),
    tables: (connectionId: string, database: string): Promise<TableInfo[]> =>
      ipcRenderer.invoke('schema:tables', connectionId, database),
    columns: (connectionId: string, database: string, table: string): Promise<ColumnInfo[]> =>
      ipcRenderer.invoke('schema:columns', connectionId, database, table),
    dbSizes: (connectionId: string): Promise<Record<string, number>> =>
      ipcRenderer.invoke('schema:dbSizes', connectionId),
    indexes: (connectionId: string, database: string, table: string): Promise<IndexInfo[]> =>
      ipcRenderer.invoke('schema:indexes', connectionId, database, table),
    foreignKeys: (connectionId: string, database: string, table: string): Promise<ForeignKeyInfo[]> =>
      ipcRenderer.invoke('schema:foreignKeys', connectionId, database, table),
    ddl: (connectionId: string, database: string, table: string): Promise<string> =>
      ipcRenderer.invoke('schema:ddl', connectionId, database, table),
    erd: (connectionId: string, database: string): Promise<ERDTableData[]> =>
      ipcRenderer.invoke('schema:erd', connectionId, database)
  },
  query: {
    execute: (connectionId: string, database: string | null, sql: string, sourceLabel?: string, scriptId?: string, skipLog?: boolean): Promise<QueryResult> =>
      ipcRenderer.invoke('query:execute', connectionId, database, sql, sourceLabel, scriptId, skipLog)
  },
  queryLog: {
    get: (): Promise<QueryLogEntry[]> =>
      ipcRenderer.invoke('queryLog:get'),
    explain: (entryId: number, connectionId: string, database: string | null, sql: string): Promise<boolean> =>
      ipcRenderer.invoke('queryLog:explain', entryId, connectionId, database, sql),
    clear: (): Promise<void> =>
      ipcRenderer.invoke('queryLog:clear'),
    onEntry: (cb: (entry: QueryLogEntry) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, entry: QueryLogEntry) => cb(entry)
      ipcRenderer.on('queryLog:entry', listener)
      return () => ipcRenderer.removeListener('queryLog:entry', listener)
    },
    onEntryUpdate: (cb: (entry: QueryLogEntry) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, entry: QueryLogEntry) => cb(entry)
      ipcRenderer.on('queryLog:entryUpdate', listener)
      return () => ipcRenderer.removeListener('queryLog:entryUpdate', listener)
    },
  },
  mcp: {
    getStatus: (): Promise<McpServerStatus> =>
      ipcRenderer.invoke('mcp:getStatus'),
    setEnabled: (connectionId: string, database: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('mcp:setEnabled', connectionId, database, enabled),
    setSafeMode: (connectionId: string, database: string, mode: McpSafeMode): Promise<void> =>
      ipcRenderer.invoke('mcp:setSafeMode', connectionId, database, mode),
    clearConnection: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke('mcp:clearConnection', connectionId),
    startServer: (port: number): Promise<{ success: boolean; port?: number; error?: string }> =>
      ipcRenderer.invoke('mcp:startServer', port),
    stopServer: (): Promise<void> =>
      ipcRenderer.invoke('mcp:stopServer'),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  },
  updater: {
    onEvent: (cb: (event: UpdaterEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, event: UpdaterEvent) => cb(event)
      ipcRenderer.on('update:event', listener)
      return () => ipcRenderer.removeListener('update:event', listener)
    },
    download: (): Promise<void> => ipcRenderer.invoke('update:download'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
  },
  connection: {
    onLost: (cb: (connectionId: string) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, connectionId: string) => cb(connectionId)
      ipcRenderer.on('connection:lost', listener)
      return () => ipcRenderer.removeListener('connection:lost', listener)
    },
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
    suggestions: (connectionId: string | null, activeDb: string | null, activeTable: string | null, threshold?: number): Promise<ScriptSuggestions> =>
      ipcRenderer.invoke('scripts:suggestions', connectionId, activeDb, activeTable, threshold),
    search: (query: string): Promise<ScriptFile[]> =>
      ipcRenderer.invoke('scripts:search', query),
    logAnonRun: (sql: string, connectionId: string | null, durationMs: number, rowCount: number | null): Promise<void> =>
      ipcRenderer.invoke('scripts:logAnonRun', sql, connectionId, durationMs, rowCount),
    logTableAccess: (connectionId: string, dbName: string, tableName: string): Promise<void> =>
      ipcRenderer.invoke('scripts:logTableAccess', connectionId, dbName, tableName),
    recentTables: (connectionId: string, dbName: string, limit?: number): Promise<string[]> =>
      ipcRenderer.invoke('scripts:recentTables', connectionId, dbName, limit),
    history: (limit?: number): Promise<HistoryEntry[]> =>
      ipcRenderer.invoke('scripts:history', limit)
  }
})
