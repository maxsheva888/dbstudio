import React, { useState } from 'react'
import { Plus, Plug, Pencil, Trash2, Loader2, PlugZap } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import ConnectionModal from '@renderer/components/connections/ConnectionModal'
import SchemaTree from '@renderer/components/schema/SchemaTree'
import ScriptPanel from '@renderer/components/scripts/ScriptPanel'
import type { ConnectionConfig, ScriptFile } from '@shared/types'

type Panel = 'connections' | 'scripts' | 'history'

interface Props {
  activePanel: Panel
  onTableSelect?: (database: string, table: string) => void
  onOpenScript?: (script: ScriptFile) => void
}

export default function Sidebar({ activePanel, onTableSelect, onOpenScript }: Props) {
  const { saveConnection } = useConnections()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | undefined>()

  function openNew() { setEditing(undefined); setShowModal(true) }
  function openEdit(c: ConnectionConfig) { setEditing(c); setShowModal(true) }

  return (
    <div className="flex flex-col w-64 bg-[#252526] border-r border-[#3c3c3c] shrink-0 overflow-hidden">
      <PanelHeader
        title={panelTitle(activePanel)}
        onAdd={activePanel === 'connections' ? openNew : undefined}
      />
      <div className="flex-1 overflow-y-auto">
        {activePanel === 'connections' && (
          <ConnectionsPanel onEdit={openEdit} onTableSelect={onTableSelect} />
        )}
        {activePanel === 'scripts' && onOpenScript && (
          <ScriptPanel onOpenScript={onOpenScript} />
        )}
        {activePanel === 'history' && <EmptyState text="История пуста" sub="Запросы появятся после выполнения" />}
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
  const { connections, activeConnectionId, deleteConnection, connect, disconnect } = useConnections()
  const [connecting, setConnecting] = useState<string | null>(null)

  async function handleConnect(conn: ConnectionConfig) {
    if (activeConnectionId === conn.id) {
      await disconnect(conn.id)
      return
    }
    setConnecting(conn.id)
    try {
      await connect(conn.id)
    } finally {
      setConnecting(null)
    }
  }

  if (connections.length === 0) {
    return <EmptyState text="Нет подключений" sub="Нажмите + чтобы добавить" />
  }

  return (
    <div className="py-1">
      {connections.map((conn) => {
        const isActive = conn.id === activeConnectionId
        const isConnecting = connecting === conn.id
        return (
          <div key={conn.id}>
            <div
              className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm
                ${isActive ? 'bg-[#094771] text-white' : 'text-[#d4d4d4] hover:bg-[#2a2d2e]'}
              `}
            >
              <span
                className="flex-1 truncate"
                title={`${conn.user}@${conn.host}:${conn.port}`}
              >
                {conn.name}
              </span>

              {isConnecting && <Loader2 size={13} className="animate-spin shrink-0 text-[#007acc]" />}

              {!isConnecting && (
                <div className="flex gap-1 invisible group-hover:visible">
                  <button
                    title={isActive ? 'Отключиться' : 'Подключиться'}
                    onClick={() => handleConnect(conn)}
                    className={`p-0.5 ${isActive ? 'hover:text-red-400' : 'hover:text-[#007acc]'}`}
                  >
                    {isActive ? <PlugZap size={13} /> : <Plug size={13} />}
                  </button>
                  <button title="Редактировать" onClick={() => onEdit(conn)} className="p-0.5 hover:text-[#d4d4d4]">
                    <Pencil size={13} />
                  </button>
                  <button title="Удалить" onClick={() => deleteConnection(conn.id)} className="p-0.5 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Schema tree shown inline when this connection is active */}
            {isActive && (
              <SchemaTree onTableSelect={onTableSelect} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function PanelHeader({ title, onAdd }: { title: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 h-9 shrink-0">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#bbb]">{title}</span>
      {onAdd && (
        <button onClick={onAdd} title="Добавить" className="text-[#858585] hover:text-[#d4d4d4] transition-colors">
          <Plus size={16} />
        </button>
      )}
    </div>
  )
}

function EmptyState({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-1 px-4">
      <span className="text-sm text-[#858585]">{text}</span>
      <span className="text-xs text-[#555]">{sub}</span>
    </div>
  )
}

function panelTitle(panel: Panel): string {
  switch (panel) {
    case 'connections': return 'Подключения'
    case 'scripts':     return 'Скрипты'
    case 'history':     return 'История'
  }
}
