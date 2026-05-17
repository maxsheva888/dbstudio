import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { McpSafeMode, McpSessionInfo } from '@shared/types'

interface McpContextValue {
  activeSessions: McpSessionInfo[]
  serverRunning: boolean
  serverPort: number | null
  isEnabled: (connectionId: string, database: string) => boolean
  getSafeMode: (connectionId: string, database: string) => McpSafeMode
  enableDb: (connectionId: string, database: string) => Promise<void>
  disableDb: (connectionId: string, database: string) => Promise<void>
  setSafeMode: (connectionId: string, database: string, mode: McpSafeMode) => Promise<void>
  clearConnection: (connectionId: string) => Promise<void>
  restartServer: (port: number) => Promise<{ success: boolean; error?: string }>
}

const McpContext = createContext<McpContextValue | null>(null)

export function McpProvider({ children }: { children: React.ReactNode }) {
  const [activeSessions, setActiveSessions] = useState<McpSessionInfo[]>([])
  const [serverRunning, setServerRunning] = useState(false)
  const [serverPort, setServerPort] = useState<number | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.api.mcp.getStatus()
      setActiveSessions(status.activeSessions ?? [])
      setServerRunning(status.running)
      setServerPort(status.port)
    } catch {}
  }, [])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  const isEnabled = useCallback(
    (connectionId: string, database: string) =>
      activeSessions.some(
        (s) => s.connectionId === connectionId && s.databases.some((d) => d.database === database)
      ),
    [activeSessions]
  )

  const getSafeMode = useCallback(
    (connectionId: string, database: string): McpSafeMode => {
      const session = activeSessions.find((s) => s.connectionId === connectionId)
      return session?.databases.find((d) => d.database === database)?.safeMode ?? 'read_only'
    },
    [activeSessions]
  )

  const enableDb = useCallback(async (connectionId: string, database: string) => {
    await window.api.mcp.setEnabled(connectionId, database, true)
    await refreshStatus()
  }, [refreshStatus])

  const disableDb = useCallback(async (connectionId: string, database: string) => {
    await window.api.mcp.setEnabled(connectionId, database, false)
    await refreshStatus()
  }, [refreshStatus])

  const setSafeMode = useCallback(async (connectionId: string, database: string, mode: McpSafeMode) => {
    await window.api.mcp.setSafeMode(connectionId, database, mode)
    setActiveSessions((prev) => prev.map((s) =>
      s.connectionId !== connectionId ? s : {
        ...s,
        databases: s.databases.map((d) =>
          d.database === database ? { ...d, safeMode: mode } : d
        ),
      }
    ))
  }, [])

  const clearConnection = useCallback(async (connectionId: string) => {
    await window.api.mcp.clearConnection(connectionId)
    setActiveSessions((prev) => prev.filter((s) => s.connectionId !== connectionId))
  }, [])

  const restartServer = useCallback(async (port: number) => {
    const result = await window.api.mcp.startServer(port)
    await refreshStatus()
    return result
  }, [refreshStatus])

  return (
    <McpContext.Provider value={{
      activeSessions, serverRunning, serverPort,
      isEnabled, getSafeMode, enableDb, disableDb, setSafeMode, clearConnection, restartServer,
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
