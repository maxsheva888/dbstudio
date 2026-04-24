import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  FileCode2, Pencil, Trash2, Globe, Database, Table2, Search,
  Archive, ChevronRight, GripVertical, Eye
} from 'lucide-react'
import { useScripts } from '@renderer/context/ScriptsContext'
import { useConnections } from '@renderer/context/ConnectionsContext'
import NewScriptModal from './NewScriptModal'
import SuggestionsSection, { SectionGroup } from './SuggestionsSection'
import type { ScriptFile } from '@shared/types'

interface Props {
  onOpenScript: (script: ScriptFile) => void
  activeTable?: string | null
}

// ─── Scope parsing helpers ────────────────────────────────────────────────────

function parseScope(scope: string): { type: 'global' | 'db' | 'table'; connId?: string; db?: string; table?: string } {
  if (scope === 'global') return { type: 'global' }
  if (scope.startsWith('db:')) {
    // Format: db:<connId>:<dbName>
    const rest = scope.slice(3)
    const idx = rest.indexOf(':')
    if (idx >= 0) return { type: 'db', connId: rest.slice(0, idx), db: rest.slice(idx + 1) }
    // Legacy format: db:<dbName>
    return { type: 'db', connId: '__legacy__', db: rest }
  }
  if (scope.startsWith('table:')) {
    // Format: table:<connId>:<dbName>.<tableName>
    const rest = scope.slice(6)
    const colonIdx = rest.indexOf(':')
    if (colonIdx >= 0) {
      const connId = rest.slice(0, colonIdx)
      const remainder = rest.slice(colonIdx + 1)
      const dotIdx = remainder.lastIndexOf('.')
      if (dotIdx >= 0) return { type: 'table', connId, db: remainder.slice(0, dotIdx), table: remainder.slice(dotIdx + 1) }
    }
    // Legacy: table:<dbName>.<tableName>
    const dotIdx = rest.lastIndexOf('.')
    if (dotIdx >= 0) return { type: 'table', connId: '__legacy__', db: rest.slice(0, dotIdx), table: rest.slice(dotIdx + 1) }
  }
  return { type: 'global' }
}

// ─── Section layout state ─────────────────────────────────────────────────────

interface SectionLayout {
  id: string
  collapsed: boolean
  height: number
}

const STORAGE_KEY = 'dbstudio-script-sections-v1'
const EXP_DBS_KEY = 'dbstudio:scriptPanel:expandedDbs'
const EXP_TABLES_KEY = 'dbstudio:scriptPanel:expandedTables'
const DEFAULT_LAYOUT: SectionLayout[] = [
  { id: 'suggestions', collapsed: false, height: 130 },
  { id: 'scripts',     collapsed: false, height: 300 },
  { id: 'archive',     collapsed: true,  height: 90  },
]

function loadLayout(): SectionLayout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: SectionLayout[] = JSON.parse(raw)
      const ids = parsed.map((s) => s.id)
      if (DEFAULT_LAYOUT.every((d) => ids.includes(d.id))) return parsed
    }
  } catch {}
  return DEFAULT_LAYOUT
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ScriptPanel({ onOpenScript, activeTable }: Props) {
  const { scripts, createScript, renameScript, deleteScript } = useScripts()
  const { activeConnectionId, activeDatabase } = useConnections()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ScriptFile[] | null>(null)
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(EXP_DBS_KEY) ?? '[]')) } catch { return new Set() }
  })
  const [expandedTables, setExpandedTables] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(EXP_TABLES_KEY) ?? '[]')) } catch { return new Set() }
  })
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [archiveCandidates, setArchiveCandidates] = useState<(ScriptFile & { lastRunAt: number | null })[]>([])

  const [layout, setLayout] = useState<SectionLayout[]>(loadLayout)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  }, [layout])

  useEffect(() => {
    window.api.scripts.suggestions(activeConnectionId, activeDatabase, activeTable ?? null).then((s) => {
      setArchiveCandidates(s.archiveCandidates)
    })
  }, [activeConnectionId, activeDatabase, activeTable, scripts])

  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return }
    const timer = setTimeout(async () => {
      setSearchResults(await window.api.scripts.search(search))
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  // ── Build tree from scripts ─────────────────────────────────────────────────

  const tree = useMemo(() => {
    const source = searchResults ?? scripts
    const globals: ScriptFile[] = []
    const dbMap = new Map<string, { scripts: ScriptFile[]; tables: Map<string, ScriptFile[]> }>()
    const readonlyIds = new Set<string>()

    for (const s of source) {
      const parsed = parseScope(s.scope)

      if (parsed.type === 'global') {
        globals.push(s)
        continue
      }

      const matchesConn = parsed.connId === '__legacy__'
        ? !!activeConnectionId && parsed.db === activeDatabase
        : parsed.connId === activeConnectionId && parsed.db === activeDatabase

      if (!matchesConn) readonlyIds.add(s.id)

      const dbName = parsed.db!
      const entry = dbMap.get(dbName) ?? { scripts: [] as ScriptFile[], tables: new Map<string, ScriptFile[]>() }

      if (parsed.type === 'db') {
        entry.scripts.push(s)
      } else if (parsed.type === 'table') {
        const tableName = parsed.table!
        const tableArr = entry.tables.get(tableName) ?? []
        tableArr.push(s)
        entry.tables.set(tableName, tableArr)
      }
      dbMap.set(dbName, entry)
    }

    return { globals, dbMap, readonlyIds }
  }, [searchResults, scripts, activeConnectionId])

  // ── Collapse toggle ─────────────────────────────────────────────────────────

  function toggleSection(id: string) {
    setLayout((prev) => prev.map((s) => s.id === id ? { ...s, collapsed: !s.collapsed } : s))
  }

  function toggleDb(db: string) {
    setExpandedDbs((prev) => {
      const next = new Set(prev)
      if (next.has(db)) next.delete(db); else next.add(db)
      localStorage.setItem(EXP_DBS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function toggleTable(key: string) {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      localStorage.setItem(EXP_TABLES_KEY, JSON.stringify([...next]))
      return next
    })
  }

  // ── Resize ──────────────────────────────────────────────────────────────────

  function startResize(e: React.MouseEvent, idx: number) {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = layout[idx].height
    function onMove(ev: MouseEvent) {
      const delta = ev.clientY - startY
      setLayout((prev) => prev.map((s, i) =>
        i === idx ? { ...s, height: Math.max(44, startHeight + delta) } : s
      ))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Drag reorder ────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragFrom(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(idx)
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragFrom === null || dragFrom === idx) { resetDrag(); return }
    setLayout((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragFrom, 1)
      next.splice(idx, 0, moved)
      return next
    })
    resetDrag()
  }

  function resetDrag() { setDragFrom(null); setDragOver(null) }

  // ── Section content ─────────────────────────────────────────────────────────

  function renderScriptsContent() {
    const { globals, dbMap, readonlyIds } = tree
    const hasAnything = globals.length > 0 || dbMap.size > 0

    if (!hasAnything && !search) {
      return (
        <div className="flex flex-col items-center py-8 gap-2 text-center px-4">
          <FileCode2 size={28} className="text-vs-textDim opacity-40" />
          <span className="text-sm text-vs-textDim">Нет скриптов</span>
        </div>
      )
    }

    if (!hasAnything && search) {
      return <div className="px-4 py-6 text-center text-xs text-vs-textDim">Ничего не найдено</div>
    }

    return (
      <>
        {/* Global scripts — flat, no group header */}
        {globals.length > 0 && (
          <div>
            {globals.map((s) => (
              <ScriptRow
                key={s.id}
                script={s}
                indent={1}
                icon={<Globe size={11} className="text-vs-textDim shrink-0" />}
                isRenaming={renamingId === s.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onClick={() => onOpenScript(s)}
                onStartRename={() => { setRenamingId(s.id); setRenameValue(s.name) }}
                onCommitRename={async () => {
                  if (renameValue.trim()) await renameScript(s.id, renameValue.trim())
                  setRenamingId(null)
                }}
                onDelete={async () => {
                  if (confirm(`Удалить скрипт "${s.name}"?`)) await deleteScript(s.id)
                }}
              />
            ))}
          </div>
        )}

        {/* DB groups */}
        {[...dbMap.entries()].map(([dbName, { scripts: dbScripts, tables }]) => {
          const dbKey = dbName
          const expanded = expandedDbs.has(dbKey) || !!search
          const totalCount = dbScripts.length + [...tables.values()].reduce((n, arr) => n + arr.length, 0)
          const readonlyCount = dbScripts.filter((s) => readonlyIds.has(s.id)).length +
            [...tables.values()].reduce((n, arr) => n + arr.filter((s) => readonlyIds.has(s.id)).length, 0)

          return (
            <SectionGroup
              key={dbKey}
              id={dbKey}
              label={dbName}
              icon={<Database size={11} className="text-[#c09030]" />}
              count={totalCount}
              dimmed={readonlyCount === totalCount}
              collapsed={!expanded}
              onToggle={() => toggleDb(dbKey)}
            >
              {/* DB-level scripts */}
              {dbScripts.map((s) => (
                <ScriptRow
                  key={s.id}
                  script={s}
                  indent={2}
                  readonly={readonlyIds.has(s.id)}
                  isRenaming={renamingId === s.id}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onClick={() => onOpenScript(s)}
                  onStartRename={() => { setRenamingId(s.id); setRenameValue(s.name) }}
                  onCommitRename={async () => {
                    if (renameValue.trim()) await renameScript(s.id, renameValue.trim())
                    setRenamingId(null)
                  }}
                  onDelete={async () => {
                    if (confirm(`Удалить скрипт "${s.name}"?`)) await deleteScript(s.id)
                  }}
                />
              ))}

              {/* Table subgroups */}
              {[...tables.entries()].map(([tableName, tableScripts]) => {
                const tableKey = `${dbName}::${tableName}`
                const tableExpanded = expandedTables.has(tableKey) || !!search
                const tableReadonly = tableScripts.every((s) => readonlyIds.has(s.id))
                return (
                  <SectionGroup
                    key={tableKey}
                    id={tableKey}
                    label={tableName}
                    icon={<Table2 size={11} className="text-[#4a9cd6]" />}
                    count={tableScripts.length}
                    dimmed={tableReadonly}
                    collapsed={!tableExpanded}
                    onToggle={() => toggleTable(tableKey)}
                    indent={1}
                  >
                    {tableScripts.map((s) => (
                      <ScriptRow
                        key={s.id}
                        script={s}
                        indent={3}
                        readonly={readonlyIds.has(s.id)}
                        isRenaming={renamingId === s.id}
                        renameValue={renameValue}
                        onRenameChange={setRenameValue}
                        onClick={() => onOpenScript(s)}
                        onStartRename={() => { setRenamingId(s.id); setRenameValue(s.name) }}
                        onCommitRename={async () => {
                          if (renameValue.trim()) await renameScript(s.id, renameValue.trim())
                          setRenamingId(null)
                        }}
                        onDelete={async () => {
                          if (confirm(`Удалить скрипт "${s.name}"?`)) await deleteScript(s.id)
                        }}
                      />
                    ))}
                  </SectionGroup>
                )
              })}
            </SectionGroup>
          )
        })}
      </>
    )
  }

  function renderContent(id: string) {
    if (id === 'suggestions') {
      return !search
        ? <SuggestionsSection onOpenScript={onOpenScript} activeTable={activeTable} />
        : null
    }
    if (id === 'scripts') return renderScriptsContent()
    if (id === 'archive') {
      return archiveCandidates.length === 0 ? (
        <div className="px-4 py-3 text-center text-xs text-vs-textDim opacity-60">Нет кандидатов</div>
      ) : (
        archiveCandidates.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 pl-7 pr-3 py-0.5 cursor-pointer hover:bg-vs-hover text-xs" onClick={() => onOpenScript(s)}>
            <FileCode2 size={12} className="text-vs-textDim shrink-0" />
            <span className="flex-1 truncate text-vs-textDim">{s.name}</span>
            <span className="text-[10px] text-vs-textDim shrink-0">{s.lastRunAt ? '30+ дн' : 'никогда'}</span>
          </div>
        ))
      )
    }
    return null
  }

  function sectionLabel(id: string) {
    if (id === 'suggestions') return 'Предложения'
    if (id === 'scripts') return 'Скрипты'
    if (id === 'archive') return 'Архивировать?'
    return id
  }

  function sectionIcon(id: string) {
    if (id === 'archive') return <Archive size={11} className="text-vs-textDim shrink-0" />
    return undefined
  }

  function sectionCount(id: string): number | undefined {
    if (id === 'scripts') {
      const { globals, dbMap } = tree
      const dbTotal = [...dbMap.values()].reduce((n, { scripts: ds, tables }) =>
        n + ds.length + [...tables.values()].reduce((m, arr) => m + arr.length, 0), 0)
      return globals.length + dbTotal
    }
    if (id === 'archive') return archiveCandidates.length > 0 ? archiveCandidates.length : undefined
    return undefined
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="px-2 py-1.5 border-b border-vs-border shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-vs-input rounded">
          <Search size={12} className="text-vs-textDim shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени и содержимому…"
            className="flex-1 bg-transparent text-xs text-vs-text outline-none placeholder:text-vs-textDim"
          />
          {search && <button onClick={() => setSearch('')} className="text-vs-textDim hover:text-vs-text text-xs">✕</button>}
        </div>
      </div>

      {/* New script */}
      <div className="px-2 py-1 border-b border-vs-border shrink-0">
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-xs text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors"
        >
          + Новый скрипт
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {layout.map((section, idx) => {
          const isDragTarget = dragOver === idx && dragFrom !== idx
          return (
            <div
              key={section.id}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, idx)}
              className={isDragTarget ? 'outline outline-1 outline-[#007acc] outline-offset-[-1px]' : ''}
            >
              {/* Section header */}
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnd={resetDrag}
                className={`flex items-center h-[22px] px-1 gap-0.5 select-none bg-vs-panelHeader border-b border-vs-border
                  ${dragFrom === idx ? 'opacity-40' : ''}`}
              >
                <div className="cursor-grab active:cursor-grabbing text-vs-textDim opacity-40 hover:opacity-100 transition-opacity shrink-0">
                  <GripVertical size={12} />
                </div>
                <div
                  className="flex items-center flex-1 gap-1 h-full cursor-pointer hover:bg-vs-hover px-1 rounded min-w-0"
                  onClick={() => toggleSection(section.id)}
                >
                  <ChevronRight
                    size={12}
                    className={`text-vs-textDim shrink-0 transition-transform duration-100 ${!section.collapsed ? 'rotate-90' : ''}`}
                  />
                  {sectionIcon(section.id)}
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-vs-textDim flex-1 truncate">
                    {sectionLabel(section.id)}
                  </span>
                  {sectionCount(section.id) !== undefined && (
                    <span className="text-[11px] text-vs-textDim pr-1">{sectionCount(section.id)}</span>
                  )}
                </div>
              </div>

              {/* Content */}
              {!section.collapsed && (
                <div style={{ height: section.height, overflowY: 'auto', overflowX: 'hidden' }}>
                  {renderContent(section.id)}
                </div>
              )}

              {/* Resize handle */}
              {!section.collapsed && idx < layout.length - 1 && (
                <div
                  onMouseDown={(e) => startResize(e, idx)}
                  className="h-[4px] cursor-row-resize bg-vs-border hover:bg-vs-statusBar transition-colors shrink-0"
                />
              )}
            </div>
          )
        })}
      </div>

      {showModal && (
        <NewScriptModal
          onSave={async (name, scope) => {
            const script = await createScript(name, scope)
            setShowModal(false)
            // Auto-expand the db/table group where the script was created
            const parsed = parseScope(scope)
            if (parsed.db) {
              setExpandedDbs((prev) => {
                const next = new Set([...prev, parsed.db!])
                localStorage.setItem(EXP_DBS_KEY, JSON.stringify([...next]))
                return next
              })
              if (parsed.table) {
                setExpandedTables((prev) => {
                  const next = new Set([...prev, `${parsed.db}::${parsed.table}`])
                  localStorage.setItem(EXP_TABLES_KEY, JSON.stringify([...next]))
                  return next
                })
              }
            }
            onOpenScript(script)
          }}
          onClose={() => setShowModal(false)}
          initialTable={activeTable}
        />
      )}
    </div>
  )
}

// ─── Script row ────────────────────────────────────────────────────────────────

interface RowProps {
  script: ScriptFile
  indent: 1 | 2 | 3
  icon?: React.ReactNode
  readonly?: boolean
  isRenaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onClick: () => void
  onStartRename: () => void
  onCommitRename: () => void
  onDelete: () => void
}

const INDENT_PL: Record<number, string> = { 1: 'pl-4', 2: 'pl-7', 3: 'pl-10' }

function ScriptRow({ script, indent, icon, readonly, isRenaming, renameValue, onRenameChange, onClick, onStartRename, onCommitRename, onDelete }: RowProps) {
  return (
    <div
      title={readonly ? 'Только просмотр — нет подключения к базе этого скрипта' : undefined}
      className={`group flex items-center gap-1.5 ${INDENT_PL[indent]} pr-2 py-0.5 cursor-pointer hover:bg-vs-hover text-xs
        ${readonly ? 'text-vs-textDim' : 'text-vs-text'}`}
      onClick={!isRenaming ? onClick : undefined}
    >
      {readonly
        ? <Eye size={12} className="text-[#c09030] shrink-0 opacity-70" />
        : (icon ?? <FileCode2 size={12} className="text-vs-textDim shrink-0" />)
      }
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') onCommitRename(); if (e.key === 'Escape') onRenameChange(script.name) }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-vs-input text-vs-text px-1 outline-none rounded border border-vs-statusBar"
        />
      ) : (
        <span className={`flex-1 truncate ${readonly ? 'opacity-70' : ''}`}>{script.name}</span>
      )}
      {!isRenaming && (
        <div className="flex gap-1 invisible group-hover:visible shrink-0">
          <button title="Переименовать" onClick={(e) => { e.stopPropagation(); onStartRename() }} className="p-0.5 hover:text-vs-text">
            <Pencil size={11} />
          </button>
          <button title="Удалить" onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-0.5 hover:text-red-400">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}
