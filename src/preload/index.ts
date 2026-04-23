import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectionConfig, TestConnectionResult } from '../shared/types'

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

    getDatabases: (config: ConnectionConfig): Promise<string[]> =>
      ipcRenderer.invoke('connections:databases', config)
  }
})
