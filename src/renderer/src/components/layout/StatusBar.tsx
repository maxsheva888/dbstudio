import React from 'react'
import { WifiOff, Database } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import { useTags } from '@renderer/context/TagsContext'

interface Props {
  lastQueryMs?: number | null
}

export default function StatusBar({ lastQueryMs }: Props) {
  const { connections, activeConnectionId, activeDatabase } = useConnections()
  const { getTag } = useTags()
  const active = connections.find((c) => c.id === activeConnectionId)
  const firstTag = active?.tags?.[0] ? getTag(active.tags[0]) : undefined
  const bgColor = firstTag ? firstTag.color : 'var(--vs-status-bar)'

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
        {active ? (
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
      <span className="opacity-70">DBStudio v0.1.0</span>
    </div>
  )
}
