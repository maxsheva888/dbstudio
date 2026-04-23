import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ConnectionConfig } from '@shared/types'

interface ConnectionsContextValue {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  reload: () => Promise<void>
  saveConnection: (config: ConnectionConfig) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  setActiveConnectionId: (id: string | null) => void
}

const ConnectionsContext = createContext<ConnectionsContextValue | null>(null)

export function ConnectionsProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<ConnectionConfig[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const list = await window.api.connections.list()
    setConnections(list)
  }, [])

  const saveConnection = useCallback(async (config: ConnectionConfig) => {
    await window.api.connections.save(config)
    await reload()
  }, [reload])

  const deleteConnection = useCallback(async (id: string) => {
    await window.api.connections.delete(id)
    if (activeConnectionId === id) setActiveConnectionId(null)
    await reload()
  }, [reload, activeConnectionId])

  useEffect(() => { reload() }, [reload])

  return (
    <ConnectionsContext.Provider value={{
      connections, activeConnectionId, reload,
      saveConnection, deleteConnection, setActiveConnectionId
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
