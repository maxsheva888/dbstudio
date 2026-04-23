import React, { useState, useMemo } from 'react'
import { FileCode2, Pencil, Trash2, Globe, Database, Table2, Search } from 'lucide-react'
import { useScripts } from '@renderer/context/ScriptsContext'
import NewScriptModal from './NewScriptModal'
import type { ScriptFile } from '@shared/types'

interface Props {
  onOpenScript: (script: ScriptFile) => void
}

interface ScopeGroup {
  label: string
  scope: string
  icon: React.ReactNode
  scripts: ScriptFile[]
}

export default function ScriptPanel({ onOpenScript }: Props) {
  const { scripts, createScript, renameScript, deleteScript } = useScripts()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['global']))
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return scripts
    const q = search.toLowerCase()
    return scripts.filter((s) => s.name.toLowerCase().includes(q))
  }, [scripts, search])

  const groups = useMemo((): ScopeGroup[] => {
    const map = new Map<string, ScriptFile[]>()
    for (const s of filtered) {
      const arr = map.get(s.scope) ?? []
      arr.push(s)
      map.set(s.scope, arr)
    }

    const result: ScopeGroup[] = []
    if (map.has('global')) {
      result.push({
        label: 'Глобальные',
        scope: 'global',
        icon: <Globe size={12} className="text-[#858585]" />,
        scripts: map.get('global')!
      })
      map.delete('global')
    }
    for (const [scope, list] of map.entries()) {
      if (scope.startsWith('db:')) {
        result.push({
          label: scope.slice(3),
          scope,
          icon: <Database size={12} className="text-[#c09030]" />,
          scripts: list
        })
      } else if (scope.startsWith('table:')) {
        result.push({
          label: scope.slice(6),
          scope,
          icon: <Table2 size={12} className="text-[#4a9cd6]" />,
          scripts: list
        })
      }
    }
    return result
  }, [filtered])

  function toggleGroup(scope: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  async function handleCreate(name: string, scope: string) {
    const script = await createScript(name, scope)
    setShowModal(false)
    setExpandedGroups((prev) => new Set([...prev, scope]))
    onOpenScript(script)
  }

  function startRename(s: ScriptFile) {
    setRenamingId(s.id)
    setRenameValue(s.name)
  }

  async function commitRename(id: string) {
    const v = renameValue.trim()
    if (v) await renameScript(id, v)
    setRenamingId(null)
  }

  async function handleDelete(s: ScriptFile) {
    if (confirm(`Удалить скрипт "${s.name}" и все его версии?`)) {
      await deleteScript(s.id)
    }
  }

  if (scripts.length === 0 && !search) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2 px-4">
          <FileCode2 size={28} className="text-[#555]" />
          <span className="text-sm text-[#858585]">Нет скриптов</span>
          <button
            onClick={() => setShowModal(true)}
            className="mt-1 px-3 py-1 text-xs bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors"
          >
            Создать первый
          </button>
        </div>
        {showModal && <NewScriptModal onSave={handleCreate} onClose={() => setShowModal(false)} />}
      </>
    )
  }

  return (
    <>
      {/* Search */}
      <div className="px-2 py-1.5 border-b border-[#3c3c3c]">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#3c3c3c] rounded">
          <Search size={12} className="text-[#858585] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск скриптов…"
            className="flex-1 bg-transparent text-xs text-[#d4d4d4] outline-none placeholder:text-[#555]"
          />
        </div>
      </div>

      {/* New script button */}
      <div className="px-2 py-1 border-b border-[#3c3c3c]">
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-xs text-[#858585] hover:text-[#d4d4d4] hover:bg-[#2a2d2e] rounded transition-colors"
        >
          + Новый скрипт
        </button>
      </div>

      {/* Groups */}
      <div className="py-1">
        {groups.map((group) => {
          const expanded = expandedGroups.has(group.scope) || !!search
          return (
            <div key={group.scope}>
              <div
                className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-[#2a2d2e] select-none"
                onClick={() => toggleGroup(group.scope)}
              >
                <span className="text-[#858585]">{expanded ? '▾' : '▸'}</span>
                {group.icon}
                <span className="text-xs text-[#858585] font-semibold uppercase tracking-wide truncate flex-1">
                  {group.label}
                </span>
                <span className="text-xs text-[#555]">{group.scripts.length}</span>
              </div>

              {expanded && (
                <div>
                  {group.scripts.map((s) => (
                    <ScriptRow
                      key={s.id}
                      script={s}
                      isRenaming={renamingId === s.id}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onClick={() => onOpenScript(s)}
                      onStartRename={() => startRename(s)}
                      onCommitRename={() => commitRename(s.id)}
                      onDelete={() => handleDelete(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && search && (
          <div className="px-4 py-6 text-center text-xs text-[#555]">
            Ничего не найдено
          </div>
        )}
      </div>

      {showModal && <NewScriptModal onSave={handleCreate} onClose={() => setShowModal(false)} />}
    </>
  )
}

interface RowProps {
  script: ScriptFile
  isRenaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onClick: () => void
  onStartRename: () => void
  onCommitRename: () => void
  onDelete: () => void
}

function ScriptRow({
  script, isRenaming, renameValue, onRenameChange,
  onClick, onStartRename, onCommitRename, onDelete
}: RowProps) {
  return (
    <div
      className="group flex items-center gap-1.5 pl-7 pr-2 py-0.5 cursor-pointer hover:bg-[#2a2d2e] text-xs text-[#d4d4d4]"
      onClick={!isRenaming ? onClick : undefined}
    >
      <FileCode2 size={12} className="text-[#858585] shrink-0" />

      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename()
            if (e.key === 'Escape') onRenameChange(script.name)
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-[#3c3c3c] text-[#d4d4d4] px-1 outline-none rounded border border-[#007acc]"
        />
      ) : (
        <span className="flex-1 truncate">{script.name}</span>
      )}

      {!isRenaming && (
        <div className="flex gap-1 invisible group-hover:visible shrink-0">
          <button
            title="Переименовать"
            onClick={(e) => { e.stopPropagation(); onStartRename() }}
            className="p-0.5 hover:text-[#d4d4d4]"
          >
            <Pencil size={11} />
          </button>
          <button
            title="Удалить"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-0.5 hover:text-red-400"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}
