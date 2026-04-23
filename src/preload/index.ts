import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectionConfig, TestConnectionResult, TableInfo, ColumnInfo, QueryResult } from '../shared/types'

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
  }
})
