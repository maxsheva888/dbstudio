import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { McpSafeMode, McpSessionInfo } from '@shared/types'

interface McpContextValue {
  activeSession: McpSessionInfo | null
  serverRunning: boolean
  serverPort: number | null
  isEnabled: (connectionId: string, database: string) => boolean
  enableDb: (connectionId: string, database: string) => Promise<void>
  disableDb: (connectionId: string, database: string) => Promise<void>
  setSafeMode: (mode: McpSafeMode) => Promise<void>
  clearConnection: (connectionId: string) => Promise<void>
  restartServer: (port: number) => Promise<{ success: boolean; error?: string }>
}

const McpContext = createContext<McpContextValue | null>(null)

export function McpProvider({ children }: { children: React.ReactNode }) {
  const [activeSession, setActiveSession] = useState<McpSessionInfo | null>(null)
  const [serverRunning, setServerRunning] = useState(false)
  const [serverPort, setServerPort] = useState<number | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.api.mcp.getStatus()
      setActiveSession(status.activeSession)
      setServerRunning(status.running)
      setServerPort(status.port)
    } catch {}
  }, [])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  const isEnabled = useCallback(
    (connectionId: string, database: string) =>
      activeSession?.connectionId === connectionId && activeSession?.database === database,
    [activeSession]
  )

  const enableDb = useCallback(async (connectionId: string, database: string) => {
    await window.api.mcp.setEnabled(connectionId, database, true)
    await refreshStatus()
  }, [refreshStatus])

  const disableDb = useCallback(async (connectionId: string, database: string) => {
    await window.api.mcp.setEnabled(connectionId, database, false)
    await refreshStatus()
  }, [refreshStatus])

  const setSafeMode = useCallback(async (mode: McpSafeMode) => {
    if (!activeSession) return
    await window.api.mcp.setSafeMode(activeSession.connectionId, activeSession.database, mode)
    setActiveSession((prev) => prev ? { ...prev, safeMode: mode } : null)
  }, [activeSession])

  const clearConnection = useCallback(async (connectionId: string) => {
    await window.api.mcp.clearConnection(connectionId)
    if (activeSession?.connectionId === connectionId) setActiveSession(null)
  }, [activeSession])

  const restartServer = useCallback(async (port: number) => {
    const result = await window.api.mcp.startServer(port)
    await refreshStatus()
    return result
  }, [refreshStatus])

  return (
    <McpContext.Provider value={{
      activeSession, serverRunning, serverPort,
      isEnabled, enableDb, disableDb, setSafeMode, clearConnection, restartServer,
    }}>
      {children}
    </McpContext.Provider>
  )
}

export function useMcp() {
  const ctx = useContext(McpContext)
  if (!ctx) throw new Error('useMcp must be used inside McpProvider')
  return ctx
}
