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
        className="bg-[#252526] border border-[#3c3c3c] rounded shadow-xl w-96 p-5 flex flex-col gap-4"
      >
        <h2 className="text-sm font-semibold text-[#d4d4d4]">Новый скрипт</h2>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#858585]">Название</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Active Users"
            className="px-3 py-1.5 text-sm bg-[#3c3c3c] text-[#d4d4d4] border border-[#555] rounded outline-none focus:border-[#007acc]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#858585]">Область действия</label>
          <select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as 'global' | 'db' | 'table')}
            className="px-3 py-1.5 text-sm bg-[#3c3c3c] text-[#d4d4d4] border border-[#555] rounded outline-none focus:border-[#007acc]"
          >
            <option value="global">Глобальный</option>
            <option value="db">База данных</option>
            <option value="table">Таблица</option>
          </select>
        </div>

        {(scopeType === 'db' || scopeType === 'table') && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#858585]">База данных</label>
            {activeDatabases.length > 0 ? (
              <select
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                className="px-3 py-1.5 text-sm bg-[#3c3c3c] text-[#d4d4d4] border border-[#555] rounded outline-none focus:border-[#007acc]"
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
                className="px-3 py-1.5 text-sm bg-[#3c3c3c] text-[#d4d4d4] border border-[#555] rounded outline-none focus:border-[#007acc]"
              />
            )}
          </div>
        )}

        {scopeType === 'table' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#858585]">Таблица</label>
            <input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Имя таблицы"
              className="px-3 py-1.5 text-sm bg-[#3c3c3c] text-[#d4d4d4] border border-[#555] rounded outline-none focus:border-[#007acc]"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-[#d4d4d4] hover:text-white hover:bg-[#3c3c3c] rounded transition-colors"
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
