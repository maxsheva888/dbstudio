import React, { useState } from 'react'
import { Plus, Plug, Pencil, Trash2, Loader2, PlugZap } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import ConnectionModal from '@renderer/components/connections/ConnectionModal'
import SchemaTree from '@renderer/components/schema/SchemaTree'
import HistoryPanel from './HistoryPanel'
import type { ConnectionConfig, ScriptFile } from '@shared/types'
import type { ActivityPanel } from './ActivityBar'
import { getTagByKey } from '@renderer/constants/connectionTags'

interface Props {
  activePanel: ActivityPanel
  onTableSelect?: (database: string, table: string) => void
  onOpenScript?: (script: ScriptFile) => void
  onRunScript?: (script: ScriptFile) => void
  onOpenSql?: (sql: string) => void
  onRunSql?: (sql: string) => void
}

export default function Sidebar({ activePanel, onTableSelect, onOpenScript, onRunScript, onOpenSql, onRunSql }: Props) {
  const { saveConnection } = useConnections()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | undefined>()

  function openNew() { setEditing(undefined); setShowModal(true) }
  function openEdit(c: ConnectionConfig) { setEditing(c); setShowModal(true) }

  return (
    <div className="flex flex-col h-full bg-vs-sidebar border-r border-vs-border overflow-hidden">
      <PanelHeader
        title={panelTitle(activePanel)}
        onAdd={activePanel === 'connections' ? openNew : undefined}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {activePanel === 'connections' && (
          <ConnectionsPanel onEdit={openEdit} onTableSelect={onTableSelect} />
        )}
        {activePanel === 'history' && onOpenScript && onRunScript && onOpenSql && onRunSql && (
          <HistoryPanel onOpenScript={onOpenScript} onRunScript={onRunScript} onOpenSql={onOpenSql} onRunSql={onRunSql} />
        )}
        {activePanel === 'history' && (!onOpenScript || !onRunScript || !onOpenSql || !onRunSql) && (
          <EmptyState text="История пуста" sub="Запросы появятся после выполнения" />
        )}
      </div>

      {showModal && (
        <ConnectionModal
          initial={editing}
          onSave={saveConnection}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

function ConnectionsPanel({
  onEdit,
  onTableSelect
}: {
  onEdit: (c: ConnectionConfig) => void
  onTableSelect?: (database: string, table: string) => void
}) {
  const { connections, activeConnectionId, openConnectionIds, deleteConnection, connect, disconnect } = useConnections()
  const [connecting, setConnecting] = useState<string | null>(null)

  async function handleConnect(conn: ConnectionConfig) {
    if (activeConnectionId === conn.id) return
    setConnecting(conn.id)
    try { await connect(conn.id) }
    finally { setConnecting(null) }
  }

  async function handleDisconnect(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await disconnect(id)
  }

  function handleTableSelect(database: string, table: string) {
    if (activeConnectionId) {
      window.api.scripts.logTableAccess(activeConnectionId, database, table)
    }
    onTableSelect?.(database, table)
  }

  if (connections.length === 0) {
    return <EmptyState text="Нет подключений" sub="Нажмите + чтобы добавить" />
  }

  return (
    <div className="py-1">
      {connections.map((conn) => {
        const isActive = conn.id === activeConnectionId
        const isOpen = openConnectionIds.includes(conn.id)
        const isConnecting = connecting === conn.id
        return (
          <div key={conn.id}>
            <div
              className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm
                ${isActive ? 'bg-vs-selected text-white' : 'text-vs-text hover:bg-vs-hover'}`}
              onClick={() => handleConnect(conn)}
            >
              {(() => {
                const tagInfo = getTagByKey(conn.tag)
                return tagInfo ? (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    title={tagInfo.label}
                    style={{ backgroundColor: tagInfo.color }}
                  />
                ) : null
              })()}
              <span className="flex-1 truncate" title={
                conn.type === 'sqlite' ? conn.filePath ?? conn.name
                : `${conn.user}@${conn.host}:${conn.port}${conn.ssh ? ' (SSH)' : ''}`
              }>
                {conn.name}
              </span>
              <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded font-mono opacity-60 ${
                conn.type === 'postgres' ? 'text-[#7ec8e3]' :
                conn.type === 'sqlite'   ? 'text-[#a8cc8c]' : 'text-[#ce9178]'
              }`}>
                {conn.type === 'postgres' ? 'PG' : conn.type === 'sqlite' ? 'SL' : 'MY'}
              </span>
              {conn.ssh && !isActive && (
                <span className="shrink-0 text-[9px] text-[#4ec9b0] opacity-60" title="SSH-туннель">⊞</span>
              )}
              {/* Green dot: open but not active */}
              {isOpen && !isActive && !isConnecting && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 opacity-80" title="Подключение открыто" />
              )}
              {isConnecting && <Loader2 size={13} className="animate-spin shrink-0 text-vs-statusBar" />}
              {!isConnecting && (
                <div className="flex gap-1 invisible group-hover:visible">
                  {isOpen ? (
                    <button
                      title="Отключиться"
                      onClick={(e) => handleDisconnect(e, conn.id)}
                      className="p-0.5 hover:text-red-400"
                    >
                      <PlugZap size={13} />
                    </button>
                  ) : (
                    <button
                      title="Подключиться"
                      onClick={(e) => { e.stopPropagation(); handleConnect(conn) }}
                      className="p-0.5 hover:text-vs-statusBar"
                    >
                      <Plug size={13} />
                    </button>
                  )}
                  <button title="Редактировать" onClick={(e) => { e.stopPropagation(); onEdit(conn) }} className="p-0.5 hover:text-vs-text">
                    <Pencil size={13} />
                  </button>
                  <button title="Удалить" onClick={(e) => { e.stopPropagation(); deleteConnection(conn.id) }} className="p-0.5 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            {isActive && <SchemaTree onTableSelect={handleTableSelect} />}
          </div>
        )
      })}
    </div>
  )
}

function PanelHeader({ title, onAdd }: { title: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 h-9 shrink-0">
      <span className="text-xs font-semibold uppercase tracking-widest text-vs-textDim">{title}</span>
      {onAdd && (
        <button onClick={onAdd} title="Добавить" className="text-vs-textDim hover:text-vs-text transition-colors">
          <Plus size={16} />
        </button>
      )}
    </div>
  )
}

function EmptyState({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-1 px-4">
      <span className="text-sm text-vs-textDim">{text}</span>
      <span className="text-xs text-vs-textDim opacity-60">{sub}</span>
    </div>
  )
}

function panelTitle(panel: ActivityPanel): string {
  switch (panel) {
    case 'connections': return 'Подключения'
    case 'history':     return 'История'
  }
}
