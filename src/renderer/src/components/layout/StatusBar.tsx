import React from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'

export default function StatusBar() {
  const { connections, activeConnectionId } = useConnections()
  const active = connections.find((c) => c.id === activeConnectionId)

  return (
    <div className="flex items-center justify-between px-3 h-6 bg-[#007acc] text-white shrink-0 text-xs">
      <div className="flex items-center gap-3">
        {active ? (
          <span className="flex items-center gap-1">
            <Wifi size={12} />
            {active.name} &mdash; {active.user}@{active.host}:{active.port}
          </span>
        ) : (
          <span className="flex items-center gap-1 opacity-80">
            <WifiOff size={12} />
            Нет активного подключения
          </span>
        )}
      </div>
      <span className="opacity-70">DBStudio v0.1.0</span>
    </div>
  )
}
