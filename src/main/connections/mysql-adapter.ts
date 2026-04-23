import mysql from 'mysql2/promise'
import type { ConnectionConfig, TestConnectionResult } from '../../shared/types'

export async function testConnection(config: Pick<ConnectionConfig, 'host' | 'port' | 'user' | 'password' | 'database'>): Promise<TestConnectionResult> {
  const start = Date.now()
  let conn: mysql.Connection | null = null
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      connectTimeout: 5000
    })
    await conn.ping()
    return { success: true, message: 'Подключение успешно', latencyMs: Date.now() - start }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message }
  } finally {
    await conn?.end()
  }
}

export async function getDatabases(config: ConnectionConfig): Promise<string[]> {
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    connectTimeout: 5000
  })
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SHOW DATABASES')
    return rows.map((r) => r['Database'] as string)
  } finally {
    await conn.end()
  }
}
