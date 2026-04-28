import { ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { loadConnections, saveConnections } from '../connections/store'
import type { ConnectionConfig, TestConnectionResult } from '../../shared/types'

async function testMySQL(host: string, port: number, user: string, password: string, database?: string): Promise<TestConnectionResult> {
  const mysql = await import('mysql2/promise')
  const start = Date.now()
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | null = null
  try {
    conn = await mysql.createConnection({ host, port, user, password, database: database || undefined, connectTimeout: 5000 })
    await conn.ping()
    return { success: true, message: 'Подключение успешно', latencyMs: Date.now() - start }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    await conn?.end()
  }
}

async function testPostgres(host: string, port: number, user: string, password: string, database?: string): Promise<TestConnectionResult> {
  const { Client } = await import('pg')
  const start = Date.now()
  const client = new Client({ host, port, user, password, database: database || 'postgres', connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
    await client.query('SELECT 1')
    return { success: true, message: 'Подключение успешно', latencyMs: Date.now() - start }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    await client.end().catch(() => {})
  }
}

async function testSQLite(filePath?: string): Promise<TestConnectionResult> {
  if (!filePath) return { success: false, message: 'Не указан файл базы данных' }
  if (!existsSync(filePath)) return { success: false, message: `Файл не найден: ${filePath}` }
  try {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(filePath, { readonly: true })
    db.close()
    return { success: true, message: 'SQLite база данных открыта успешно' }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function registerConnectionHandlers(): void {
  ipcMain.handle('connections:list', () => loadConnections())

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
    saveConnections(loadConnections().filter((c) => c.id !== id))
  })

  ipcMain.handle('connections:test', async (_e, config: Omit<ConnectionConfig, 'id' | 'createdAt'>) => {
    const type = config.type ?? 'mysql'

    // Open SSH tunnel for test if needed
    let tunnelPort: number | undefined
    let tunnel: import('../connections/ssh-tunnel').SSHTunnel | undefined

    if (config.ssh && (type === 'mysql' || type === 'postgres')) {
      try {
        const { SSHTunnel } = await import('../connections/ssh-tunnel')
        tunnel = new SSHTunnel()
        tunnelPort = await tunnel.open(config.ssh, config.host, config.port)
      } catch (err) {
        return { success: false, message: `SSH туннель: ${(err as Error).message}` }
      }
    }

    const host = tunnelPort ? '127.0.0.1' : config.host
    const port = tunnelPort ?? config.port

    try {
      if (type === 'postgres') return await testPostgres(host, port, config.user, config.password, config.database)
      if (type === 'sqlite')   return await testSQLite(config.filePath)
      return await testMySQL(host, port, config.user, config.password, config.database)
    } finally {
      await tunnel?.close().catch(() => {})
    }
  })

  ipcMain.handle('connections:databases', (_e, config: ConnectionConfig) => {
    const { getDatabases } = require('../connections/mysql-adapter')
    return getDatabases(config)
  })

  ipcMain.handle('connections:pickFile', async (_e, mode: 'sqlite' | 'sshkey') => {
    const filters = mode === 'sqlite'
      ? [{ name: 'SQLite Databases', extensions: ['db', 'sqlite', 'sqlite3', 's3db', 'sl3'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'Private Key', extensions: ['pem', 'key', 'ppk'] }, { name: 'All Files', extensions: ['*'] }]
    const result = await dialog.showOpenDialog({ filters, properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0]
  })
}
