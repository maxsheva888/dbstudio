import mysql from 'mysql2/promise'
import type { ConnectionConfig } from '../../shared/types'

interface PoolEntry {
  config: ConnectionConfig
  pools: Map<string, mysql.Pool>
}

const registry = new Map<string, PoolEntry>()

export function openConnection(config: ConnectionConfig): void {
  if (!registry.has(config.id)) {
    registry.set(config.id, { config, pools: new Map() })
  }
}

export function closeConnection(id: string): void {
  const entry = registry.get(id)
  if (!entry) return
  for (const pool of entry.pools.values()) pool.end().catch(() => {})
  registry.delete(id)
}

export function getPool(connectionId: string, database?: string): mysql.Pool {
  const entry = registry.get(connectionId)
  if (!entry) throw new Error(`No active connection: ${connectionId}`)
  const key = database ?? '__no_db__'
  if (!entry.pools.has(key)) {
    entry.pools.set(key, mysql.createPool({
      host: entry.config.host,
      port: entry.config.port,
      user: entry.config.user,
      password: entry.config.password,
      database: database || undefined,
      connectionLimit: 5,
      timezone: 'local'
    }))
  }
  return entry.pools.get(key)!
}

export function isConnected(id: string): boolean {
  return registry.has(id)
}
