import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  Database, Table2, ChevronRight, ChevronDown,
  KeyRound, Key, Link2, Hash, Columns3, Loader2, Eye
} from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import type { TableInfo, ColumnInfo } from '@shared/types'

interface DbState {
  loading: boolean
  tables?: TableInfo[]
  expanded: boolean
}

interface TableState {
  loading: boolean
  columns?: ColumnInfo[]
  expanded: boolean
}

interface Props {
  onTableSelect?: (database: string, table: string) => void
}

const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])

function fmtBytes(n: number): string {
  if (n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1).replace('.', ',')} KiB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MiB`
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GiB`
}

function sizeBarColor(n: number): string {
  if (n >= 1024 ** 3)        return '#f48771'
  if (n >= 100 * 1024 ** 2)  return '#ce9178'
  return '#4a9cd6'
}

function sizeTextClass(n: number): string {
  if (n >= 1024 ** 3)       return 'text-[#f48771]'
  if (n >= 100 * 1024 ** 2) return 'text-[#ce9178]'
  return 'text-vs-textDim'
}

function lsJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback } catch { return fallback }
}

function dbLsKey(connId: string)    { return `dbstudio:expandedDbs:${connId}` }
function tableLsKey(connId: string) { return `dbstudio:expandedTables:${connId}` }

export default function SchemaTree({ onTableSelect }: Props) {
  const { activeConnectionId, activeDatabases, activeDatabase, setActiveDatabase } = useConnections()
  const [dbStates, setDbStates] = useState<Record<string, DbState>>({})
  const [tableStates, setTableStates] = useState<Record<string, TableState>>({})
  const [dbSizes, setDbSizes] = useState<Record<string, number>>({})
  const restoredRef = useRef(false)

  // ── Restore expansion on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!activeConnectionId || activeDatabases.length === 0 || restoredRef.current) return
    restoredRef.current = true

    const savedExpandedDbs: string[]    = lsJson(dbLsKey(activeConnectionId), [])
    const savedExpandedTables: string[] = lsJson(tableLsKey(activeConnectionId), [])

    // Always include activeDatabase (it should be visible after restore)
    const toExpand = [...new Set([
      ...savedExpandedDbs,
      ...(activeDatabase ? [activeDatabase] : [])
    ])].filter((db) => activeDatabases.includes(db))

    if (toExpand.length === 0) return

    setDbStates((s) => {
      const next = { ...s }
      for (const db of toExpand) next[db] = { loading: true, expanded: true }
      return next
    })

    async function restore() {
      // Load tables for all previously expanded databases
      await Promise.allSettled(
        toExpand.map(async (db) => {
          try {
            const tables = await window.api.schema.tables(activeConnectionId!, db)
            setDbStates((s) => ({ ...s, [db]: { loading: false, expanded: true, tables } }))
          } catch {
            setDbStates((s) => ({ ...s, [db]: { loading: false, expanded: false } }))
          }
        })
      )

      // Load columns for all previously expanded tables
      if (savedExpandedTables.length > 0) {
        await Promise.allSettled(
          savedExpandedTables
            .filter((key) => toExpand.some((db) => key.startsWith(db + '.')))
            .map(async (key) => {
              const dot = key.indexOf('.')
              const db = key.slice(0, dot)
              const table = key.slice(dot + 1)
              try {
                const columns = await window.api.schema.columns(activeConnectionId!, db, table)
                setTableStates((s) => ({ ...s, [key]: { loading: false, expanded: true, columns } }))
              } catch {}
            })
        )
      }
    }

    restore()
  }, [activeConnectionId, activeDatabases, activeDatabase])

  // ── Load DB sizes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConnectionId) return
    window.api.schema.dbSizes(activeConnectionId)
      .then(setDbSizes)
      .catch(() => {})
  }, [activeConnectionId])

  // ── Toggle database ─────────────────────────────────────────────────────
  const toggleDb = useCallback(async (db: string) => {
    const cur = dbStates[db]

    if (cur?.expanded) {
      if (activeConnectionId) {
        const key = dbLsKey(activeConnectionId)
        localStorage.setItem(key, JSON.stringify(lsJson<string[]>(key, []).filter((d) => d !== db)))
      }
      setDbStates((s) => ({ ...s, [db]: { ...cur, expanded: false } }))
      return
    }

    if (activeConnectionId) {
      const key = dbLsKey(activeConnectionId)
      const cur2 = lsJson<string[]>(key, [])
      if (!cur2.includes(db)) localStorage.setItem(key, JSON.stringify([...cur2, db]))
    }

    if (cur?.tables) {
      setDbStates((s) => ({ ...s, [db]: { ...cur, expanded: true } }))
      return
    }

    setDbStates((s) => ({ ...s, [db]: { loading: true, expanded: true } }))
    try {
      const tables = await window.api.schema.tables(activeConnectionId!, db)
      setDbStates((s) => ({ ...s, [db]: { loading: false, expanded: true, tables } }))
    } catch {
      setDbStates((s) => ({ ...s, [db]: { loading: false, expanded: false } }))
    }
  }, [dbStates, activeConnectionId])

  // ── Toggle table ────────────────────────────────────────────────────────
  const toggleTable = useCallback(async (db: string, table: string) => {
    const key = `${db}.${table}`
    const cur = tableStates[key]

    if (cur?.expanded) {
      if (activeConnectionId) {
        const lsKey = tableLsKey(activeConnectionId)
        localStorage.setItem(lsKey, JSON.stringify(lsJson<string[]>(lsKey, []).filter((k) => k !== key)))
      }
      setTableStates((s) => ({ ...s, [key]: { ...cur, expanded: false } }))
      return
    }

    if (activeConnectionId) {
      const lsKey = tableLsKey(activeConnectionId)
      const cur2 = lsJson<string[]>(lsKey, [])
      if (!cur2.includes(key)) localStorage.setItem(lsKey, JSON.stringify([...cur2, key]))
    }

    if (cur?.columns) {
      setTableStates((s) => ({ ...s, [key]: { ...cur, expanded: true } }))
      return
    }

    setTableStates((s) => ({ ...s, [key]: { loading: true, expanded: true } }))
    try {
      const columns = await window.api.schema.columns(activeConnectionId!, db, table)
      setTableStates((s) => ({ ...s, [key]: { loading: false, expanded: true, columns } }))
    } catch {
      setTableStates((s) => ({ ...s, [key]: { loading: false, expanded: false } }))
    }
  }, [tableStates, activeConnectionId])

  if (!activeConnectionId) return null

  return (
    <div className="py-1 text-sm select-none">
      {activeDatabases.map((db) => {
        const ds = dbStates[db]
        const isActive = db === activeDatabase
        const isSystem = SYSTEM_DBS.has(db)
        const dbTotalSize = dbSizes[db] ?? 0
        return (
          <div key={db}>
            <div
              className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded mx-1
                ${isActive ? 'bg-vs-selected text-white' : 'hover:bg-vs-hover'}
                ${isSystem && !isActive ? 'opacity-40' : ''}`}
              onClick={() => { setActiveDatabase(db); toggleDb(db) }}
            >
              {ds?.loading
                ? <Loader2 size={13} className="animate-spin text-vs-statusBar shrink-0" />
                : ds?.expanded
                  ? <ChevronDown size={13} className="text-vs-textDim shrink-0" />
                  : <ChevronRight size={13} className="text-vs-textDim shrink-0" />
              }
              <Database size={14} className="text-[#c09030] shrink-0" />
              <span className="truncate text-vs-text flex-1 min-w-0">{db}</span>
              {dbTotalSize > 0 && (
                <span className={`text-[10px] font-mono tabular-nums shrink-0 ${isActive ? 'opacity-70' : sizeTextClass(dbTotalSize)}`}>
                  {fmtBytes(dbTotalSize)}
                </span>
              )}
            </div>

            {ds?.expanded && ds.tables && (
              <div className="ml-4">
                {(() => {
                  const maxSize = Math.max(...ds.tables.map((t) => t.sizeBytes ?? 0))
                  return ds.tables.map((t) => {
                  const tKey = `${db}.${t.name}`
                  const ts = tableStates[tKey]
                  const isView = t.tableType !== 'BASE TABLE'
                  const sz = t.sizeBytes ?? 0
                  const barPct = maxSize > 0 && sz > 0 ? Math.max(3, (sz / maxSize) * 100) : 0
                  return (
                    <div key={t.name}>
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded mx-1 hover:bg-vs-hover group"
                        onClick={() => toggleTable(db, t.name)}
                        onDoubleClick={() => onTableSelect?.(db, t.name)}
                        title="Двойной клик — SELECT * FROM table"
                      >
                        {ts?.loading
                          ? <Loader2 size={12} className="animate-spin text-vs-statusBar shrink-0" />
                          : ts?.expanded
                            ? <ChevronDown size={12} className="text-vs-textDim shrink-0" />
                            : <ChevronRight size={12} className="text-vs-textDim shrink-0" />
                        }
                        {isView
                          ? <Eye size={13} className="text-[#4a9cd6] shrink-0" />
                          : <Table2 size={13} className="text-[#4a9cd6] shrink-0" />
                        }
                        <span className="truncate text-vs-text flex-1 min-w-0">{t.name}</span>
                        {sz > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            <span className={`text-[10px] font-mono w-[52px] text-right tabular-nums ${sizeTextClass(sz)}`}>
                              {fmtBytes(sz)}
                            </span>
                            <div className="w-10 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${barPct}%`, backgroundColor: sizeBarColor(sz) }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {ts?.expanded && ts.columns && (
                        <div className="ml-8">
                          {ts.columns.map((col) => (
                            <div
                              key={col.name}
                              className="flex items-center gap-1 px-2 py-0.5 text-xs text-vs-textDim hover:bg-vs-hover rounded mx-1 cursor-default"
                              title={`${col.key === 'PRI' ? 'Primary Key · ' : col.key === 'UNI' ? `Unique · ${col.indexName ?? ''} · ` : col.key === 'MUL' ? (col.refTable ? `FK → ${col.refTable} · ${col.indexName ?? 'Index'} · ` : `${col.indexName ?? 'Index'} · `) : ''}${col.nullable ? 'NULL' : 'NOT NULL'}${col.extra ? ' · ' + col.extra : ''}`}
                            >
                              {col.key === 'PRI'
                                ? <KeyRound size={11} className="text-[#ffd700] shrink-0" />
                                : col.key === 'UNI'
                                  ? <Key size={11} className="text-[#f48771] shrink-0" />
                                  : col.key === 'MUL'
                                    ? col.refTable
                                      ? <Link2 size={11} className="text-[#4ec9b0] shrink-0" />
                                      : <Hash size={11} className="text-[#569cd6] shrink-0" />
                                    : <Columns3 size={11} className="text-vs-textDim shrink-0" />
                              }
                              <span className="truncate">{col.name}</span>
                              <span className="ml-auto text-vs-textDim opacity-60 truncate max-w-[60px]">{col.type.split('(')[0]}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                  })
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
