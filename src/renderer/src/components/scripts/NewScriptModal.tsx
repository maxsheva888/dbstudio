import React, { useState, useEffect, useRef } from 'react'
import { useConnections } from '@renderer/context/ConnectionsContext'

interface Props {
  onSave: (name: string, scope: string) => void
  onClose: () => void
  initialTable?: string | null
}

export default function NewScriptModal({ onSave, onClose, initialTable }: Props) {
  const { activeDatabases, activeDatabase, activeConnectionId } = useConnections()
  const [name, setName] = useState('')
  const [scopeType, setScopeType] = useState<'global' | 'db' | 'table'>('global')
  const [dbName, setDbName] = useState(activeDatabase ?? activeDatabases[0] ?? '')
  const [tableName, setTableName] = useState(initialTable ?? '')

  // autocomplete state
  const [allTables, setAllTables] = useState<string[]>([])
  const [recentTables, setRecentTables] = useState<string[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const tableInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const hasConnection = !!activeConnectionId

  function buildScope(): string {
    if (scopeType === 'db' && activeConnectionId) return `db:${activeConnectionId}:${dbName}`
    if (scopeType === 'table' && activeConnectionId) return `table:${activeConnectionId}:${dbName}.${tableName}`
    return 'global'
  }

  // fetch tables when DB changes and scope is table
  useEffect(() => {
    if (scopeType !== 'table' || !activeConnectionId || !dbName) {
      setAllTables([])
      return
    }
    window.api.schema.tables(activeConnectionId, dbName).then((rows) => {
      setAllTables(rows.map((r) => r.name))
    }).catch(() => setAllTables([]))
  }, [scopeType, activeConnectionId, dbName])

  // fetch recent tables on focus
  function handleTableFocus() {
    if (!activeConnectionId || !dbName) return
    window.api.scripts.recentTables(activeConnectionId, dbName, 8).then((tables) => {
      setRecentTables(tables)
      setShowDropdown(true)
    })
  }

  // suggestions to show in dropdown
  const query = tableName.trim().toLowerCase()
  const filteredAll = query
    ? allTables.filter((t) => t.toLowerCase().includes(query))
    : []
  const dropdownItems: { label: string; item: string; group?: string }[] = query
    ? filteredAll.map((t) => ({ label: t, item: t }))
    : [
        ...recentTables.map((t) => ({ label: t, item: t, group: 'Недавние' })),
        ...allTables
          .filter((t) => !recentTables.includes(t))
          .slice(0, 8)
          .map((t) => ({ label: t, item: t, group: recentTables.length > 0 ? 'Все таблицы' : undefined }))
      ]

  function selectTable(t: string) {
    setTableName(t)
    setShowDropdown(false)
    tableInputRef.current?.focus()
  }

  // close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    function onDown(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node) &&
          !tableInputRef.current?.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showDropdown])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed, buildScope())
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-vs-sidebar border border-vs-border rounded shadow-xl w-96 p-5 flex flex-col gap-4"
      >
        <h2 className="text-sm font-semibold text-vs-text">Новый скрипт</h2>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-vs-textDim">Название</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Active Users"
            className="px-3 py-1.5 text-sm bg-vs-input text-vs-text border border-vs-border rounded outline-none focus:border-vs-statusBar"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-vs-textDim">Область действия</label>
          <select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as 'global' | 'db' | 'table')}
            className="px-3 py-1.5 text-sm bg-vs-input text-vs-text border border-vs-border rounded outline-none focus:border-vs-statusBar"
          >
            <option value="global">Глобальный</option>
            <option value="db" disabled={!hasConnection}>База данных{!hasConnection ? ' (нет подключения)' : ''}</option>
            <option value="table" disabled={!hasConnection}>Таблица{!hasConnection ? ' (нет подключения)' : ''}</option>
          </select>
        </div>

        {(scopeType === 'db' || scopeType === 'table') && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-vs-textDim">База данных</label>
            {activeDatabases.length > 0 ? (
              <select
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                className="px-3 py-1.5 text-sm bg-vs-input text-vs-text border border-vs-border rounded outline-none focus:border-vs-statusBar"
              >
                {activeDatabases.map((db) => (
                  <option key={db} value={db}>{db}</option>
                ))}
              </select>
            ) : (
              <input
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="Имя базы данных"
                className="px-3 py-1.5 text-sm bg-vs-input text-vs-text border border-vs-border rounded outline-none focus:border-vs-statusBar"
              />
            )}
          </div>
        )}

        {scopeType === 'table' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-vs-textDim">Таблица</label>
            <div className="relative">
              <input
                ref={tableInputRef}
                value={tableName}
                onChange={(e) => { setTableName(e.target.value); setShowDropdown(true) }}
                onFocus={handleTableFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowDropdown(false)
                  if (e.key === 'ArrowDown') { e.preventDefault(); dropdownRef.current?.querySelector('button')?.focus() }
                }}
                placeholder="Имя таблицы"
                className="w-full px-3 py-1.5 text-sm bg-vs-input text-vs-text border border-vs-border rounded outline-none focus:border-vs-statusBar"
              />

              {showDropdown && dropdownItems.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute top-full left-0 right-0 mt-0.5 bg-vs-sidebar border border-vs-border rounded shadow-xl z-10 max-h-52 overflow-y-auto"
                >
                  {(() => {
                    let lastGroup: string | undefined = undefined
                    return dropdownItems.map((item, i) => {
                      const showGroupHeader = item.group && item.group !== lastGroup
                      lastGroup = item.group
                      return (
                        <React.Fragment key={i}>
                          {showGroupHeader && (
                            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-vs-textDim bg-vs-panelHeader border-b border-vs-border">
                              {item.group}
                            </div>
                          )}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectTable(item.item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') selectTable(item.item)
                              if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLElement)?.focus() }
                              if (e.key === 'ArrowUp') { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLElement)?.focus() ?? tableInputRef.current?.focus() }
                              if (e.key === 'Escape') { setShowDropdown(false); tableInputRef.current?.focus() }
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm text-vs-text hover:bg-vs-hover focus:bg-vs-hover outline-none"
                          >
                            {item.label}
                          </button>
                        </React.Fragment>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!name.trim() || (scopeType === 'table' && !tableName.trim())}
            className="px-4 py-1.5 text-sm bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Создать
          </button>
        </div>
      </form>
    </div>
  )
}
