import React, { useState, useEffect } from 'react'
import { WifiOff, Database } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import { useTags } from '@renderer/context/TagsContext'

interface Props {
  lastQueryMs?: number | null
}

function useUpdater() {
  const [event, setEvent] = useState<UpdaterEvent | null>(null)
  useEffect(() => {
    const unsub = window.api.updater?.onEvent?.(setEvent)
    return unsub
  }, [])
  return event
}

export default function StatusBar({ lastQueryMs }: Props) {
  const updateEvent = useUpdater()
  const { connections, activeConnectionId, activeDatabase, lostConnectionIds, reconnect } = useConnections()
  const { getTag } = useTags()
  const active = connections.find((c) => c.id === activeConnectionId)
  const isLost = activeConnectionId ? lostConnectionIds.includes(activeConnectionId) : false
  const firstTag = active?.tags?.[0] ? getTag(active.tags[0]) : undefined
  const bgColor = isLost ? '#5a1a1a' : (firstTag ? firstTag.color : 'var(--vs-status-bar)')

  const subtitle = active
    ? active.type === 'sqlite'
      ? active.filePath ?? active.name
      : `${active.user}@${active.host}:${active.port}`
    : null

  return (
    <div
      className="flex items-center justify-between px-3 h-6 text-white shrink-0 text-xs transition-colors duration-300"
      style={{ backgroundColor: bgColor }}
    >
      <div className="flex items-center gap-3">
        {active && isLost ? (
          <>
            <WifiOff size={12} className="text-[#f48771]" />
            <span className="text-[#f48771] font-medium">Соединение потеряно</span>
            <span className="opacity-60">— {active.name}</span>
            <button
              onClick={() => reconnect(active.id)}
              className="ml-1 px-2 py-0.5 rounded text-[10px] font-semibold"
              style={{ background: 'rgba(244,135,113,0.2)', color: '#f48771', border: '1px solid rgba(244,135,113,0.35)' }}
            >
              Переподключить
            </button>
          </>
        ) : active ? (
          <>
            {firstTag && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(0,0,0,0.25)', padding: '1px 6px', borderRadius: 3,
                fontFamily: 'monospace', fontWeight: 700, fontSize: 10, letterSpacing: 0.5,
              }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: '#fff' }} />
                {firstTag.label}
              </span>
            )}
            <span>
              {active.name} — {subtitle}
            </span>
            {activeDatabase && (
              <span className="flex items-center gap-1 opacity-90">
                <Database size={11} />
                {activeDatabase}
              </span>
            )}
            {active.ssh && (
              <span className="opacity-80">via SSH {active.ssh.host}</span>
            )}
            {lastQueryMs != null && (
              <span className="opacity-75">Запрос: {lastQueryMs} мс</span>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1 opacity-80">
            <WifiOff size={12} />
            Нет активного подключения
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {updateEvent?.type === 'available' && (
          <button
            onClick={() => window.api.updater.download()}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold animate-pulse"
            style={{ background: 'rgba(78,201,176,0.2)', color: '#4ec9b0', border: '1px solid rgba(78,201,176,0.4)' }}
            title={`Доступна версия ${updateEvent.version}`}
          >
            ↑ v{updateEvent.version} — Скачать
          </button>
        )}
        {updateEvent?.type === 'downloading' && (
          <span className="text-[10px] opacity-70" style={{ color: '#4ec9b0' }}>
            Загрузка {updateEvent.percent}%…
          </span>
        )}
        {updateEvent?.type === 'ready' && (
          <button
            onClick={() => window.api.updater.install()}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
            style={{ background: 'rgba(78,201,176,0.3)', color: '#4ec9b0', border: '1px solid rgba(78,201,176,0.6)' }}
            title={`Версия ${updateEvent.version} готова к установке`}
          >
            ↑ v{updateEvent.version} — Установить и перезапустить
          </button>
        )}
        <span className="opacity-70">DBStudio v0.1.0</span>
      </div>
    </div>
  )
}
