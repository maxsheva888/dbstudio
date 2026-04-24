import React from 'react'
import { Wifi, WifiOff, Database } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import { getTagByKey } from '@renderer/constants/connectionTags'

interface Props {
  lastQueryMs?: number | null
}

export default function StatusBar({ lastQueryMs }: Props) {
  const { connections, activeConnectionId, activeDatabase } = useConnections()
  const active = connections.find((c) => c.id === activeConnectionId)
  const tag = active ? getTagByKey(active.tag) : undefined

  return (
    <div
      className="flex items-center justify-between px-3 h-6 text-white shrink-0 text-xs transition-colors duration-300"
      style={{ backgroundColor: tag ? tag.color : 'var(--vs-status-bar)' }}
    >
      <div className="flex items-center gap-3">
        {active ? (
          <>
            <span className="flex items-center gap-1">
              <Wifi size={12} />
              {active.name} &mdash; {active.user}@{active.host}:{active.port}
            </span>
            {activeDatabase && (
              <span className="flex items-center gap-1 opacity-90">
                <Database size={11} />
                {activeDatabase}
              </span>
            )}
            {lastQueryMs != null && (
              <span className="opacity-80" title="Время выполнения последнего запроса">Запрос: {lastQueryMs} мс</span>
            )}
          </>
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
