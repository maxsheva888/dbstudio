import { ipcMain } from 'electron'
import {
  enableMcp, disableMcp, getActiveSession, setActiveSafeMode,
  clearSessionForConnection, isDbEnabled,
} from '../mcp/mcpState'
import type { McpSafeMode } from '../mcp/mcpState'
import { startMcpServer, stopMcpServer, isMcpRunning, getMcpPort } from '../mcp/server'

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:getStatus', () => {
    const session = getActiveSession()
    return {
      running: isMcpRunning(),
      port: getMcpPort(),
      activeSession: session
        ? { connectionId: session.connectionId, database: session.database, safeMode: session.safeMode }
        : null,
    }
  })

  ipcMain.handle('mcp:setEnabled', (_e, connectionId: string, database: string, enabled: boolean) => {
    if (enabled) enableMcp(connectionId, database)
    else disableMcp(connectionId, database)
  })

  ipcMain.handle('mcp:setSafeMode', (_e, _connectionId: string, _database: string, safeMode: McpSafeMode) => {
    setActiveSafeMode(safeMode)
  })

  ipcMain.handle('mcp:isEnabled', (_e, connectionId: string, database: string) => {
    return isDbEnabled(connectionId, database)
  })

  ipcMain.handle('mcp:clearConnection', (_e, connectionId: string) => {
    clearSessionForConnection(connectionId)
  })

  ipcMain.handle('mcp:startServer', async (_e, port: number) => {
    try {
      await startMcpServer(port)
      return { success: true, port }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mcp:stopServer', async () => {
    await stopMcpServer()
  })
}
