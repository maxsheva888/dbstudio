import React, { useState, useCallback } from 'react'
import {
  Database, Table2, ChevronRight, ChevronDown,
  KeyRound, Columns3, Loader2, Eye
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

export default function SchemaTree({ onTableSelect }: Props) {
  const { activeConnectionId, activeDatabases, activeDatabase, setActiveDatabase } = useConnections()
  const [dbStates, setDbStates] = useState<Record<string, DbState>>({})
  const [tableStates, setTableStates] = useState<Record<string, TableState>>({})

  const toggleDb = useCallback(async (db: string) => {
    const cur = dbStates[db]
    if (cur?.expanded) {
      setDbStates((s) => ({ ...s, [db]: { ...cur, expanded: false } }))
      return
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

  const toggleTable = useCallback(async (db: string, table: string) => {
    const key = `${db}.${table}`
    const cur = tableStates[key]
    if (cur?.expanded) {
      setTableStates((s) => ({ ...s, [key]: { ...cur, expanded: false } }))
      return
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
        return (
          <div key={db}>
            {/* Database row */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded mx-1
                ${isActive ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'}`}
              onClick={() => { setActiveDatabase(db); toggleDb(db) }}
            >
              {ds?.loading
                ? <Loader2 size={13} className="animate-spin text-[#007acc] shrink-0" />
                : ds?.expanded
                  ? <ChevronDown size={13} className="text-[#858585] shrink-0" />
                  : <ChevronRight size={13} className="text-[#858585] shrink-0" />
              }
              <Database size={14} className="text-[#c09030] shrink-0" />
              <span className="truncate text-[#d4d4d4]">{db}</span>
            </div>

            {/* Tables */}
            {ds?.expanded && ds.tables && (
              <div className="ml-4">
                {ds.tables.map((t) => {
                  const tKey = `${db}.${t.name}`
                  const ts = tableStates[tKey]
                  const isView = t.tableType !== 'BASE TABLE'
                  return (
                    <div key={t.name}>
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded mx-1 hover:bg-[#2a2d2e] group"
                        onClick={() => toggleTable(db, t.name)}
                        onDoubleClick={() => onTableSelect?.(db, t.name)}
                        title="Двойной клик — SELECT * FROM table"
                      >
                        {ts?.loading
                          ? <Loader2 size={12} className="animate-spin text-[#007acc] shrink-0" />
                          : ts?.expanded
                            ? <ChevronDown size={12} className="text-[#858585] shrink-0" />
                            : <ChevronRight size={12} className="text-[#858585] shrink-0" />
                        }
                        {isView
                          ? <Eye size={13} className="text-[#4a9cd6] shrink-0" />
                          : <Table2 size={13} className="text-[#4a9cd6] shrink-0" />
                        }
                        <span className="truncate text-[#d4d4d4]">{t.name}</span>
                      </div>

                      {/* Columns */}
                      {ts?.expanded && ts.columns && (
                        <div className="ml-8">
                          {ts.columns.map((col) => (
                            <div
                              key={col.name}
                              className="flex items-center gap-1 px-2 py-0.5 text-xs text-[#858585] hover:bg-[#2a2d2e] rounded mx-1 cursor-default"
                              title={`${col.type}${col.nullable ? ' NULL' : ' NOT NULL'}${col.extra ? ' ' + col.extra : ''}`}
                            >
                              {col.key === 'PRI'
                                ? <KeyRound size={11} className="text-[#ffd700] shrink-0" />
                                : <Columns3 size={11} className="text-[#858585] shrink-0" />
                              }
                              <span className="truncate">{col.name}</span>
                              <span className="ml-auto text-[#555] truncate max-w-[60px]">{col.type.split('(')[0]}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
