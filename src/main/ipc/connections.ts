import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { loadConnections, saveConnections } from '../connections/store'
import { testConnection, getDatabases } from '../connections/mysql-adapter'
import type { ConnectionConfig } from '../../shared/types'

export function registerConnectionHandlers(): void {
  ipcMain.handle('connections:list', () => {
    return loadConnections()
  })

  ipcMain.handle('connections:save', (_e, config: ConnectionConfig) => {
    const connections = loadConnections()
    const idx = connections.findIndex((c) => c.id === config.id)
    if (idx >= 0) {
      connections[idx] = config
    } else {
      connections.push({ ...config, id: randomUUID(), createdAt: new Date().toISOString() })
    }
    saveConnections(connections)
  })

  ipcMain.handle('connections:delete', (_e, id: string) => {
    const connections = loadConnections().filter((c) => c.id !== id)
    saveConnections(connections)
  })

  ipcMain.handle('connections:test', (_e, config: Omit<ConnectionConfig, 'id' | 'createdAt'>) => {
    return testConnection(config)
  })

  ipcMain.handle('connections:databases', (_e, config: ConnectionConfig) => {
    return getDatabases(config)
  })
}
