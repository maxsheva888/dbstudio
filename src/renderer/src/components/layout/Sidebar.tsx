import React, { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import { useTags } from '@renderer/context/TagsContext'
import ConnectionModal from '@renderer/components/connections/ConnectionModal'
import SchemaTree from '@renderer/components/schema/SchemaTree'
import HistoryPanel from './HistoryPanel'
import type { ConnectionConfig, ScriptFile } from '@shared/types'
import type { ActivityPanel } from './ActivityBar'

// ─── Tag color helpers ────────────────────────────────────────────────────────

const FILTER_COLORS: Record<string, string> = {
  local: '#007acc',
  dev:   '#b88a3e',
  prod:  '#a13434',
}

function tagBgFg(color: string): { bg: string; fg: string } {
  const r = parseInt(color.slice(1, 3), 16) || 0
  const g = parseInt(color.slice(3, 5), 16) || 0
  const b = parseInt(color.slice(5, 7), 16) || 0
  const bgR = Math.round(r * 0.55)
  const bgG = Math.round(g * 0.55)
  const bgB = Math.round(b * 0.55)
  const fgR = Math.min(255, Math.round(r + (255 - r) * 0.5))
  const fgG = Math.min(255, Math.round(g + (255 - g) * 0.5))
  const fgB = Math.min(255, Math.round(b + (255 - b) * 0.5))
  return {
    bg: `#${bgR.toString(16).padStart(2, '0')}${bgG.toString(16).padStart(2, '0')}${bgB.toString(16).padStart(2, '0')}`,
    fg: `#${fgR.toString(16).padStart(2, '0')}${fgG.toString(16).padStart(2, '0')}${fgB.toString(16).padStart(2, '0')}`,
  }
}

// ─── Engine icon ──────────────────────────────────────────────────────────────

function EngineIcon({ type, size = 16 }: { type?: string; size?: number }) {
  const s = size
  if (type === 'postgres') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <ellipse cx="12" cy="6" rx="8" ry="3" fill="#336791" opacity="0.9" />
        <path d="M4 6 V14 C4 16 8 17 12 17 C16 17 20 16 20 14 V6" stroke="#5e8db5" strokeWidth="1.4" fill="#2a4d6b" opacity="0.85" />
        <ellipse cx="12" cy="6" rx="8" ry="3" stroke="#7ba8cf" strokeWidth="1" fill="none" />
        <path d="M9 9 L9 13 M12 9 L12 13 M15 9 L15 13" stroke="#a8c8e3" strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'sqlite') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <rect x="4" y="4" width="16" height="16" rx="2" fill="#0f80cc" opacity="0.85" />
        <path d="M7 9 C9 7 13 7 15 9 L15 15 C13 13 9 13 7 15 Z" fill="#fff" opacity="0.9" />
        <circle cx="11" cy="11" r="0.9" fill="#0f80cc" />
      </svg>
    )
  }
  // mysql (default)
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 18 C3 14 5 10 9 8 C12 6 15 6 18 8" stroke="#00758f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M5 17 C7 13 11 11 16 12" stroke="#f29111" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="8" r="1.6" fill="#00758f" />
      <path d="M18 9 L20 13 L19 13 L20 16" stroke="#00758f" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Env tag ──────────────────────────────────────────────────────────────────

function EnvTag({ tagKeys }: { tagKeys?: string[] }) {
  const { getTag } = useTags()
  if (!tagKeys || tagKeys.length === 0) return null
  return (
    <>
      {tagKeys.map((key) => {
        const tag = getTag(key)
        if (!tag) return null
        const { bg, fg } = tagBgFg(tag.color)
        return (
          <span key={key} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: bg, color: fg,
            padding: '1px 5px', borderRadius: 3,
            fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: 0.5, lineHeight: 1.4, flexShrink: 0,
          }}>
            <span style={{ width: 4, height: 4, borderRadius: 999, background: fg }} />
            {tag.label}
          </span>
        )
      })}
    </>
  )
}

// ─── SSH badge ────────────────────────────────────────────────────────────────

function SshBadge() {
  return (
    <span title="SSH-туннель" style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: '#2a3a2a', color: '#9cd97f',
      padding: '1px 4px', borderRadius: 3,
      fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
      letterSpacing: 0.4, lineHeight: 1.4, flexShrink: 0,
    }}>
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
        <rect x="2" y="5" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 5 V3.5 a2 2 0 0 1 4 0 V5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
      SSH
    </span>
  )
}

// ─── Hover action button ──────────────────────────────────────────────────────

function HoverBtn({
  title, onClick, danger, alwaysVisible, activeColor, children,
}: {
  title: string
  onClick: (e: React.MouseEvent) => void
  danger?: boolean
  alwaysVisible?: boolean
  activeColor?: string
  children: React.ReactNode
}) {
  const [hov, setHov] = useState(false)
  const baseColor = activeColor ?? (danger ? '#858585' : '#858585')
  const hoverColor = danger ? '#f48771' : (activeColor ?? '#cccccc')
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 22, height: 22, border: 'none',
        background: hov ? '#3a3a3a' : 'transparent',
        color: hov ? hoverColor : (alwaysVisible ? baseColor : '#858585'),
        cursor: 'pointer', borderRadius: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .1s, color .1s',
      }}
    >
      {children}
    </button>
  )
}

// ─── Connection card ──────────────────────────────────────────────────────────

interface ConnCardProps {
  conn: ConnectionConfig
  active: boolean
  connected: boolean
  connecting: boolean
  lost?: boolean
  onSelect: () => void
  onConnect: (e: React.MouseEvent) => void
  onDisconnect: (e: React.MouseEvent) => void
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onTableSelect?: (connectionId: string, database: string, table: string) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  isDragging?: boolean
  isDragOver?: boolean
}

function ConnCard({
  conn, active, connected, connecting, lost,
  onSelect, onConnect, onDisconnect, onEdit, onDelete,
  onTableSelect,
  draggable: isDraggable, onDragStart, onDragOver, onDrop, onDragEnd,
  isDragging, isDragOver,
}: ConnCardProps) {
  const [hover, setHover] = useState(false)
  const { getTag } = useTags()
  const firstTag = conn.tags?.[0] ? getTag(conn.tags[0]) : undefined
  const borderColor = firstTag ? firstTag.color : '#3c3c3c'
  const subtitle = conn.type === 'sqlite'
    ? (conn.filePath ?? conn.name)
    : `${conn.host}:${conn.port}${conn.database ? `/${conn.database}` : ''}`

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        position: 'relative',
        margin: '3px 6px',
        padding: '8px 10px 8px 26px',
        background: active ? '#2c2f36' : hover ? '#2a2d32' : '#222226',
        border: `1px solid ${active ? '#007acc55' : '#2e2e2e'}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 5,
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isDragOver
          ? `0 -2px 0 #007acc`
          : active ? '0 2px 8px rgba(0,0,0,0.35)' : 'none',
        transition: 'background .12s, box-shadow .12s',
      }}
    >
      {/* Drag handle — shown on hover for non-active cards */}
      {!active && (
        <div style={{
          position: 'absolute', left: 5, top: 0, bottom: 0,
          width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hover ? 0.6 : 0, cursor: 'grab', color: '#858585',
          transition: 'opacity .12s',
        }}>
          <svg width="6" height="12" viewBox="0 0 6 12" fill="none">
            <circle cx="1.5" cy="2" r="1" fill="currentColor" />
            <circle cx="4.5" cy="2" r="1" fill="currentColor" />
            <circle cx="1.5" cy="6" r="1" fill="currentColor" />
            <circle cx="4.5" cy="6" r="1" fill="currentColor" />
            <circle cx="1.5" cy="10" r="1" fill="currentColor" />
            <circle cx="4.5" cy="10" r="1" fill="currentColor" />
          </svg>
        </div>
      )}

      {/* Row 1: engine + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <EngineIcon type={conn.type ?? 'mysql'} size={15} />
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 500,
          color: active ? '#e2e2e2' : '#c0c0c0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {conn.name}
        </span>
      </div>

      {/* Row 2: host / path */}
      <div style={{
        marginTop: 3, fontSize: 10, fontFamily: 'ui-monospace, monospace',
        color: '#5a5a5a',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {subtitle}
      </div>

      {/* Row 3: env tags + ssh badge + lost badge */}
      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <EnvTag tagKeys={conn.tags} />
        {conn.ssh && <SshBadge />}
        {lost && (
          <span title="Соединение потеряно" style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: '#3a1a1a', color: '#f48771',
            padding: '1px 5px', borderRadius: 3,
            fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: 0.4, lineHeight: 1.4, flexShrink: 0,
          }}>
            <span style={{ width: 4, height: 4, borderRadius: 999, background: '#f48771' }} />
            ПОТЕРЯНО
          </span>
        )}
      </div>

      {/* Always-visible connect/disconnect button + edit/delete */}
      <div style={{ position: 'absolute', right: 5, top: 5, display: 'flex', gap: 1 }}>
        {connecting ? (
          <div style={{
            width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M6 1 A5 5 0 0 1 11 6" stroke="#dcb67a" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        ) : connected ? (
          <HoverBtn title="Отключиться" onClick={onDisconnect} alwaysVisible activeColor="#f48771">
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <rect x="1.5" y="1.5" width="3" height="7" rx="0.5" fill="currentColor"/>
              <rect x="5.5" y="1.5" width="3" height="7" rx="0.5" fill="currentColor"/>
            </svg>
          </HoverBtn>
        ) : (
          <HoverBtn title="Подключиться" onClick={onConnect} alwaysVisible activeColor="#4ec9b0">
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <path d="M2 1 L9 5 L2 9 Z" fill="currentColor"/>
            </svg>
          </HoverBtn>
        )}
        <HoverBtn title="Редактировать" onClick={onEdit}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M7 2 L10 5 L4 11 L1 11 L1 8 Z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
          </svg>
        </HoverBtn>
        <HoverBtn title="Удалить" onClick={onDelete} danger>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 3 H10 M5 1.5 H7 M3.5 3 L4 10 H8 L8.5 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        </HoverBtn>
      </div>

      {/* Active card: inline schema tree */}
      {active && (
        <div style={{
          marginTop: 8,
          marginLeft: -26, marginRight: -10,
          borderTop: '1px solid #2e2e2e',
          background: '#1a1a1c',
          maxHeight: 500,
          overflowY: 'auto',
        }}>
          <SchemaTree onTableSelect={onTableSelect} />
        </div>
      )}
    </div>
  )
}

// ─── Sidebar props ────────────────────────────────────────────────────────────

interface Props {
  activePanel: ActivityPanel
  onTableSelect?: (connectionId: string, database: string, table: string) => void
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

// ─── Connections panel ────────────────────────────────────────────────────────

function ConnectionsPanel({
  onEdit,
  onTableSelect,
}: {
  onEdit: (c: ConnectionConfig) => void
  onTableSelect?: (connectionId: string, database: string, table: string) => void
}) {
  const { connections, activeConnectionId, openConnectionIds, lostConnectionIds, deleteConnection, connect, disconnect, reconnect } = useConnections()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'local' | 'dev' | 'prod'>('all')
  const [order, setOrder] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Keep order in sync with connections list
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => connections.some((c) => c.id === id))
      const added = connections.map((c) => c.id).filter((id) => !kept.includes(id))
      return [...kept, ...added]
    })
  }, [connections])

  async function handleConnect(conn: ConnectionConfig) {
    if (activeConnectionId === conn.id && !lostConnectionIds.includes(conn.id)) return
    setConnecting(conn.id)
    try {
      lostConnectionIds.includes(conn.id) ? await reconnect(conn.id) : await connect(conn.id)
    } finally { setConnecting(null) }
  }

  async function handleDisconnect(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await disconnect(id)
  }

  function handleTableSelect(connectionId: string, database: string, table: string) {
    window.api.scripts.logTableAccess(connectionId, database, table)
    onTableSelect?.(connectionId, database, table)
  }

  // Drag-and-drop for "all connections" list
  function dndHandlers(id: string) {
    return {
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        setDraggingId(id)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault()
        if (id !== draggingId) setDragOverId(id)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        if (!draggingId || draggingId === id) { resetDnd(); return }
        setOrder((list) => {
          const out = [...list]
          const from = out.indexOf(draggingId)
          const to = out.indexOf(id)
          if (from === -1 || to === -1) return list
          out.splice(from, 1)
          out.splice(to, 0, draggingId)
          return out
        })
        resetDnd()
      },
      onDragEnd: resetDnd,
    }
  }

  function resetDnd() { setDraggingId(null); setDragOverId(null) }

  if (connections.length === 0) {
    return <EmptyState text="Нет подключений" sub="Нажмите + чтобы добавить" />
  }

  const ordered = order.map((id) => connections.find((c) => c.id === id)).filter(Boolean) as ConnectionConfig[]
  const filtered = filter === 'all' ? ordered : ordered.filter((c) => c.tags?.includes(filter))
  const activeConn = connections.find((c) => c.id === activeConnectionId)
  const otherConns = filtered.filter((c) => c.id !== activeConnectionId)

  const counts = {
    all: connections.length,
    local: connections.filter((c) => c.tags?.includes('local')).length,
    dev:   connections.filter((c) => c.tags?.includes('dev')).length,
    prod:  connections.filter((c) => c.tags?.includes('prod')).length,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 5, padding: '0 8px 8px', flexWrap: 'wrap' }}>
        {(['all', 'local', 'dev', 'prod'] as const).map((f) => {
          const sel = filter === f
          const color = f !== 'all' ? FILTER_COLORS[f] : undefined
          const style = color ? tagBgFg(color) : { bg: '#3a3a3a', fg: '#cccccc' }
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '3px 8px', borderRadius: 10,
                background: sel ? style.bg : 'transparent',
                color: sel ? style.fg : '#6e6e6e',
                border: `1px solid ${sel ? (color ? color + '55' : '#555') : '#303030'}`,
                fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
                cursor: 'pointer', letterSpacing: 0.3,
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'background .1s, color .1s',
              }}
            >
              {f === 'all' ? 'Все' : f}
              <span style={{ fontSize: 9, opacity: 0.65 }}>{counts[f]}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pb-2">
        {/* ── Current connection (sticky top) ── */}
        {activeConn && (
          <div style={{
            paddingBottom: 6,
            borderBottom: '1px solid #2e2e2e',
            background: 'linear-gradient(to bottom, rgba(0,122,204,0.07), transparent)',
            marginBottom: 4,
          }}>
            <div style={{
              padding: '4px 14px 3px',
              fontSize: 9, color: '#606060',
              letterSpacing: 0.7, fontWeight: 700, textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {lostConnectionIds.includes(activeConn.id) ? (
                <span style={{
                  width: 5, height: 5, borderRadius: 999, background: '#f48771',
                  boxShadow: '0 0 0 2px #f4877130', flexShrink: 0,
                }} />
              ) : (
                <span style={{
                  width: 5, height: 5, borderRadius: 999, background: '#4ec9b0',
                  boxShadow: '0 0 0 2px #4ec9b030', flexShrink: 0,
                }} />
              )}
              текущее подключение
            </div>
            <ConnCard
              conn={activeConn}
              active={true}
              connected={openConnectionIds.includes(activeConn.id)}
              connecting={connecting === activeConn.id}
              lost={lostConnectionIds.includes(activeConn.id)}
              onSelect={() => {}}
              onConnect={(e) => { e.stopPropagation(); void handleConnect(activeConn) }}
              onDisconnect={(e) => void handleDisconnect(e, activeConn.id)}
              onEdit={(e) => { e.stopPropagation(); onEdit(activeConn) }}
              onDelete={(e) => { e.stopPropagation(); deleteConnection(activeConn.id) }}
              onTableSelect={handleTableSelect}
            />
          </div>
        )}

        {/* ── All connections ── */}
        {otherConns.length > 0 && (
          <>
            <div style={{
              padding: '4px 14px 5px',
              fontSize: 9, color: '#606060',
              letterSpacing: 0.7, fontWeight: 700, textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              все подключения
              <span style={{ opacity: 0.55, marginLeft: 2 }}>{otherConns.length}</span>
            </div>

            {otherConns.map((c) => (
              <ConnCard
                key={c.id}
                conn={c}
                active={false}
                connected={openConnectionIds.includes(c.id)}
                connecting={connecting === c.id}
                lost={lostConnectionIds.includes(c.id)}
                onSelect={() => void handleConnect(c)}
                onConnect={(e) => { e.stopPropagation(); void handleConnect(c) }}
                onDisconnect={(e) => void handleDisconnect(e, c.id)}
                onEdit={(e) => { e.stopPropagation(); onEdit(c) }}
                onDelete={(e) => { e.stopPropagation(); deleteConnection(c.id) }}
                {...dndHandlers(c.id)}
                isDragging={draggingId === c.id}
                isDragOver={dragOverId === c.id && draggingId !== c.id}
              />
            ))}
          </>
        )}

        {/* No results for current filter */}
        {!activeConn && otherConns.length === 0 && filter !== 'all' && (
          <EmptyState text={`Нет подключений «${filter}»`} sub="Смените фильтр или добавьте подключение" />
        )}
      </div>
    </div>
  )
}

// ─── Panel header ─────────────────────────────────────────────────────────────

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

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-1 px-4">
      <span className="text-sm text-vs-textDim">{text}</span>
      <span className="text-xs text-vs-textDim opacity-60">{sub}</span>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function panelTitle(panel: ActivityPanel): string {
  switch (panel) {
    case 'connections': return 'Подключения'
    case 'history':     return 'История'
  }
}
