import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ConnectionConfig } from '@shared/types'

interface ConnectionsContextValue {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  activeDatabases: string[]
  activeDatabase: string | null
  reload: () => Promise<void>
  saveConnection: (config: ConnectionConfig) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  setActiveDatabase: (db: string | null) => void
}

const ConnectionsContext = createContext<ConnectionsContextValue | null>(null)

export function ConnectionsProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<ConnectionConfig[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [activeDatabases, setActiveDatabases] = useState<string[]>([])
  const [activeDatabase, setActiveDatabase] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setConnections(await window.api.connections.list())
  }, [])

  const saveConnection = useCallback(async (config: ConnectionConfig) => {
    await window.api.connections.save(config)
    await reload()
  }, [reload])

  const deleteConnection = useCallback(async (id: string) => {
    if (activeConnectionId === id) {
      await window.api.schema.disconnect(id).catch(() => {})
      setActiveConnectionId(null)
      setActiveDatabases([])
      setActiveDatabase(null)
    }
    await window.api.connections.delete(id)
    await reload()
  }, [reload, activeConnectionId])

  const connect = useCallback(async (id: string) => {
    if (activeConnectionId && activeConnectionId !== id) {
      await window.api.schema.disconnect(activeConnectionId).catch(() => {})
    }
    const dbs = await window.api.schema.connect(id)
    setActiveConnectionId(id)
    setActiveDatabases(dbs)
    setActiveDatabase(null)
  }, [activeConnectionId])

  const disconnect = useCallback(async (id: string) => {
    await window.api.schema.disconnect(id).catch(() => {})
    setActiveConnectionId(null)
    setActiveDatabases([])
    setActiveDatabase(null)
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <ConnectionsContext.Provider value={{
      connections, activeConnectionId, activeDatabases, activeDatabase,
      reload, saveConnection, deleteConnection,
      connect, disconnect, setActiveDatabase
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
