import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ConnectionConfig } from '@shared/types'

interface ConnectionsContextValue {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  openConnectionIds: string[]
  lostConnectionIds: string[]
  activeDatabases: string[]
  activeDatabase: string | null
  reload: () => Promise<void>
  saveConnection: (config: ConnectionConfig) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  reconnect: (id: string) => Promise<void>
  setActiveDatabase: (db: string | null) => void
}

const ConnectionsContext = createContext<ConnectionsContextValue | null>(null)

const LS_ACTIVE_ID  = 'dbstudio:activeConnectionId'
const LS_ACTIVE_DB  = 'dbstudio:activeDatabase'
const LS_ACTIVE_DBS = 'dbstudio:activeDatabases'

function lsGetJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback } catch { return fallback }
}

export function ConnectionsProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<ConnectionConfig[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [openConnectionIds, setOpenConnectionIds] = useState<string[]>([])
  const [lostConnectionIds, setLostConnectionIds] = useState<string[]>([])
  const [activeDatabases, setActiveDatabases] = useState<string[]>([])
  const [activeDatabase, setActiveDatabaseState] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setConnections(await window.api.connections.list())
  }, [])

  const saveConnection = useCallback(async (config: ConnectionConfig) => {
    await window.api.connections.save(config)
    await reload()
  }, [reload])

  const deleteConnection = useCallback(async (id: string) => {
    await window.api.schema.disconnect(id).catch(() => {})
    setOpenConnectionIds((prev) => prev.filter((x) => x !== id))
    if (activeConnectionId === id) {
      setActiveConnectionId(null)
      setActiveDatabases([])
      setActiveDatabaseState(null)
      localStorage.removeItem(LS_ACTIVE_ID)
      localStorage.removeItem(LS_ACTIVE_DB)
      localStorage.removeItem(LS_ACTIVE_DBS)
    }
    await window.api.connections.delete(id)
    await reload()
  }, [reload, activeConnectionId])

  // Connects (or switches to) a connection without closing others.
  // schema:connect is idempotent — safe to call if pool is already open.
  const connect = useCallback(async (id: string) => {
    const dbs = await window.api.schema.connect(id)
    setOpenConnectionIds((prev) => prev.includes(id) ? prev : [...prev, id])
    setActiveConnectionId(id)
    setActiveDatabases(dbs)
    setActiveDatabaseState(null)
    localStorage.setItem(LS_ACTIVE_ID, id)
    localStorage.setItem(LS_ACTIVE_DBS, JSON.stringify(dbs))
    localStorage.removeItem(LS_ACTIVE_DB)
  }, [])

  const disconnect = useCallback(async (id: string) => {
    await window.api.schema.disconnect(id).catch(() => {})
    window.api.mcp.clearConnection(id).catch(() => {})
    setOpenConnectionIds((prev) => prev.filter((x) => x !== id))
    setLostConnectionIds((prev) => prev.filter((x) => x !== id))
    if (activeConnectionId === id) {
      setActiveConnectionId(null)
      setActiveDatabases([])
      setActiveDatabaseState(null)
      localStorage.removeItem(LS_ACTIVE_ID)
      localStorage.removeItem(LS_ACTIVE_DB)
      localStorage.removeItem(LS_ACTIVE_DBS)
    }
  }, [activeConnectionId])

  const reconnect = useCallback(async (id: string) => {
    setLostConnectionIds((prev) => prev.filter((x) => x !== id))
    await connect(id)
  }, [connect])

  const setActiveDatabase = useCallback((db: string | null) => {
    setActiveDatabaseState(db)
    if (db) localStorage.setItem(LS_ACTIVE_DB, db)
    else localStorage.removeItem(LS_ACTIVE_DB)
  }, [])

  useEffect(() => {
    const unsubLost = window.api.connection?.onLost?.((connectionId) => {
      setOpenConnectionIds((prev) => prev.filter((x) => x !== connectionId))
      setLostConnectionIds((prev) => prev.includes(connectionId) ? prev : [...prev, connectionId])
    })
    return unsubLost
  }, [])

  useEffect(() => {
    async function init() {
      await reload()

      const savedId = localStorage.getItem(LS_ACTIVE_ID)
      if (!savedId) return

      const savedDb  = localStorage.getItem(LS_ACTIVE_DB)
      const savedDbs = lsGetJson<string[]>(LS_ACTIVE_DBS, [])

      // Restore UI immediately — no IPC needed for this step.
      // Even if pool sync below fails, the user sees the right state.
      setActiveConnectionId(savedId)
      setActiveDatabases(savedDbs)
      setActiveDatabaseState(savedDb || null)

      // Sync with main process pool (non-blocking from UI perspective).
      try {
        // Find which pools are alive (survives Ctrl+R since main process keeps running)
        const connectedIds = await window.api.schema.listConnected()

        if (connectedIds.includes(savedId)) {
          // Ctrl+R scenario: pool is alive, just restore open IDs
          setOpenConnectionIds(connectedIds)
        } else {
          // Fresh app start: pool is empty, reconnect to the active connection
          const dbs = await window.api.schema.connect(savedId)
          setOpenConnectionIds([savedId])
          setActiveDatabases(dbs)
          localStorage.setItem(LS_ACTIVE_DBS, JSON.stringify(dbs))
        }
      } catch {
        // IPC call failed or connection is temporarily unavailable.
        // Do NOT clear localStorage — keep savedId so next start can retry.
        // The connection will appear as "not connected" in the sidebar.
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConnectionsContext.Provider value={{
      connections, activeConnectionId, openConnectionIds, lostConnectionIds, activeDatabases, activeDatabase,
      reload, saveConnection, deleteConnection,
      connect, disconnect, reconnect, setActiveDatabase
    }}>
      {children}
    </ConnectionsContext.Provider>
  )
}

export function useConnections() {
  const ctx = useContext(ConnectionsContext)
  if (!ctx) throw new Error('useConnections must be used inside ConnectionsProvider')
  return ctx
}
