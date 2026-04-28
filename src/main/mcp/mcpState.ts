export type McpSafeMode = 'full' | 'safe' | 'read_only'

export interface McpSession {
  connectionId: string
  database: string
  safeMode: McpSafeMode
}

let activeSession: McpSession | null = null

export function enableMcp(connectionId: string, database: string, safeMode: McpSafeMode = 'read_only'): void {
  activeSession = { connectionId, database, safeMode }
}

export function disableMcp(connectionId: string, database: string): void {
  if (activeSession?.connectionId === connectionId && activeSession?.database === database) {
    activeSession = null
  }
}

export function getActiveSession(): McpSession | null {
  return activeSession
}

export function setActiveSafeMode(safeMode: McpSafeMode): void {
  if (activeSession) activeSession.safeMode = safeMode
}

export function clearSessionForConnection(connectionId: string): void {
  if (activeSession?.connectionId === connectionId) {
    activeSession = null
  }
}

export function isDbEnabled(connectionId: string, database: string): boolean {
  return activeSession?.connectionId === connectionId && activeSession?.database === database
}
