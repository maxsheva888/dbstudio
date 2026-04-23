import React, { useState } from 'react'
import { useConnections } from '@renderer/context/ConnectionsContext'

interface Props {
  onSave: (name: string, scope: string) => void
  onClose: () => void
}

export default function NewScriptModal({ onSave, onClose }: Props) {
  const { activeDatabases } = useConnections()
  const [name, setName] = useState('')
  const [scopeType, setScopeType] = useState<'global' | 'db' | 'table'>('global')
  const [dbName, setDbName] = useState(activeDatabases[0] ?? '')
  const [tableName, setTableName] = useState('')

  function buildScope(): string {
    if (scopeType === 'db') return `db:${dbName}`
    if (scopeType === 'table') return `table:${dbName}.${tableName}`
    return 'global'
  }

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
            <option value="db">База данных</option>
            <option value="table">Таблица</option>
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
            <input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Имя таблицы"
              className="px-3 py-1.5 text-sm bg-vs-input text-vs-text border border-vs-border rounded outline-none focus:border-vs-statusBar"
            />
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
            disabled={!name.trim()}
            className="px-4 py-1.5 text-sm bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Создать
          </button>
        </div>
      </form>
    </div>
  )
}
