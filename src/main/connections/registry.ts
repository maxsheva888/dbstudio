import type { DatabaseAdapter } from './adapter'
import type { SSHTunnel } from './ssh-tunnel'
import type { ConnectionConfig } from '../../shared/types'

interface Entry {
  adapter: DatabaseAdapter
  tunnel?: SSHTunnel
  config: ConnectionConfig
}

const registry = new Map<string, Entry>()

export async function openConnection(config: ConnectionConfig): Promise<void> {
  if (registry.has(config.id)) return

  const type = config.type ?? 'mysql'
  let tunnelPort: number | undefined
  let tunnel: SSHTunnel | undefined

  if (config.ssh && (type === 'mysql' || type === 'postgres')) {
    const { SSHTunnel } = await import('./ssh-tunnel')
    tunnel = new SSHTunnel()
    tunnelPort = await tunnel.open(config.ssh, config.host, config.port)
  }

  let adapter: DatabaseAdapter
  if (type === 'postgres') {
    const { PostgresAdapter } = await import('./postgres-adapter')
    adapter = new PostgresAdapter(config, tunnelPort)
  } else if (type === 'sqlite') {
    const { SQLiteAdapter } = await import('./sqlite-adapter')
    adapter = new SQLiteAdapter(config)
  } else {
    const { MySQLAdapter } = await import('./mysql-adapter')
    adapter = new MySQLAdapter(config, tunnelPort)
  }

  registry.set(config.id, { adapter, tunnel, config })
}

export async function closeConnection(id: string): Promise<void> {
  const entry = registry.get(id)
  if (!entry) return
  await entry.adapter.close().catch(() => {})
  await entry.tunnel?.close().catch(() => {})
  registry.delete(id)
}

export function getAdapter(id: string): DatabaseAdapter {
  const entry = registry.get(id)
  if (!entry) throw new Error(`Нет активного подключения: ${id}`)
  return entry.adapter
}

export function getConfig(id: string): ConnectionConfig | undefined {
  return registry.get(id)?.config
}

export function isConnected(id: string): boolean {
  return registry.has(id)
}

export function listConnectedIds(): string[] {
  return [...registry.keys()]
}
