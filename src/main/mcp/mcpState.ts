export type McpSafeMode = 'full' | 'safe' | 'read_only'

// Map: connectionId → Map<database, McpSafeMode>
const enabledDbs = new Map<string, Map<string, McpSafeMode>>()

export function enableMcp(connectionId: string, database: string, safeMode: McpSafeMode = 'read_only'): void {
  if (!enabledDbs.has(connectionId)) enabledDbs.set(connectionId, new Map())
  enabledDbs.get(connectionId)!.set(database, safeMode)
}

export function disableMcp(connectionId: string, database: string): void {
  const conn = enabledDbs.get(connectionId)
  if (!conn) return
  conn.delete(database)
  if (conn.size === 0) enabledDbs.delete(connectionId)
}

export function isDbEnabled(connectionId: string, database: string): boolean {
  return enabledDbs.get(connectionId)?.has(database) ?? false
}

export function getDbSafeMode(connectionId: string, database: string): McpSafeMode | null {
  return enabledDbs.get(connectionId)?.get(database) ?? null
}

export function setDbSafeMode(connectionId: string, database: string, safeMode: McpSafeMode): void {
  const conn = enabledDbs.get(connectionId)
  if (conn?.has(database)) conn.set(database, safeMode)
}

export function getEnabledDatabases(connectionId: string): { database: string; safeMode: McpSafeMode }[] {
  const conn = enabledDbs.get(connectionId)
  if (!conn) return []
  return Array.from(conn.entries()).map(([database, safeMode]) => ({ database, safeMode }))
}

export function getAllSessions(): { connectionId: string; databases: { database: string; safeMode: McpSafeMode }[] }[] {
  return Array.from(enabledDbs.entries()).map(([connectionId, dbs]) => ({
    connectionId,
    databases: Array.from(dbs.entries()).map(([database, safeMode]) => ({ database, safeMode })),
  }))
}

export function clearSessionForConnection(connectionId: string): void {
  enabledDbs.delete(connectionId)
}

export function hasAnySessions(): boolean {
  return enabledDbs.size > 0
}
