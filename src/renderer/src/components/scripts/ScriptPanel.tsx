import React, { useState, useMemo, useEffect } from 'react'
import { FileCode2, Pencil, Trash2, Globe, Database, Table2, Search } from 'lucide-react'
import { useScripts } from '@renderer/context/ScriptsContext'
import NewScriptModal from './NewScriptModal'
import SuggestionsSection from './SuggestionsSection'
import type { ScriptFile } from '@shared/types'

interface Props {
  onOpenScript: (script: ScriptFile) => void
  activeTable?: string | null
}

interface ScopeGroup {
  label: string
  scope: string
  icon: React.ReactNode
  scripts: ScriptFile[]
}

export default function ScriptPanel({ onOpenScript, activeTable }: Props) {
  const { scripts, createScript, renameScript, deleteScript } = useScripts()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ScriptFile[] | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['global']))
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Full-text search via IPC
  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return }
    const timer = setTimeout(async () => {
      const results = await window.api.scripts.search(search)
      setSearchResults(results)
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  const displayScripts = searchResults ?? scripts

  const groups = useMemo((): ScopeGroup[] => {
    const map = new Map<string, ScriptFile[]>()
    for (const s of displayScripts) {
      const arr = map.get(s.scope) ?? []
      arr.push(s)
      map.set(s.scope, arr)
    }
    const result: ScopeGroup[] = []
    if (map.has('global')) {
      result.push({
        label: 'Глобальные',
        scope: 'global',
        icon: <Globe size={12} className="text-vs-textDim" />,
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
  }, [displayScripts])

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

  function startRename(s: ScriptFile) { setRenamingId(s.id); setRenameValue(s.name) }

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

  return (
    <>
      {/* Search */}
      <div className="px-2 py-1.5 border-b border-vs-border">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-vs-input rounded">
          <Search size={12} className="text-vs-textDim shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени и содержимому…"
            className="flex-1 bg-transparent text-xs text-vs-text outline-none placeholder:text-vs-textDim"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-vs-textDim hover:text-vs-text text-xs">✕</button>
          )}
        </div>
      </div>

      {/* New script button */}
      <div className="px-2 py-1 border-b border-vs-border">
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-xs text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors"
        >
          + Новый скрипт
        </button>
      </div>

      {/* Suggestions (only when not searching) */}
      {!search && <SuggestionsSection onOpenScript={onOpenScript} activeTable={activeTable} />}

      {/* Script groups */}
      <div className="py-1">
        {scripts.length === 0 && !search ? (
          <div className="flex flex-col items-center py-8 gap-2 text-center px-4">
            <FileCode2 size={28} className="text-vs-textDim opacity-40" />
            <span className="text-sm text-vs-textDim">Нет скриптов</span>
          </div>
        ) : (
          <>
            {groups.map((group) => {
              const expanded = expandedGroups.has(group.scope) || !!search
              return (
                <div key={group.scope}>
                  <div
                    className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-vs-hover select-none"
                    onClick={() => toggleGroup(group.scope)}
                  >
                    <span className="text-vs-textDim text-[10px]">{expanded ? '▾' : '▸'}</span>
                    {group.icon}
                    <span className="text-xs text-vs-textDim font-semibold uppercase tracking-wide truncate flex-1">
                      {group.label}
                    </span>
                    <span className="text-xs text-vs-textDim">{group.scripts.length}</span>
                  </div>
                  {expanded && group.scripts.map((s) => (
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
              )
            })}
            {displayScripts.length === 0 && search && (
              <div className="px-4 py-6 text-center text-xs text-vs-textDim">Ничего не найдено</div>
            )}
          </>
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
      className="group flex items-center gap-1.5 pl-7 pr-2 py-0.5 cursor-pointer hover:bg-vs-hover text-xs text-vs-text"
      onClick={!isRenaming ? onClick : undefined}
    >
      <FileCode2 size={12} className="text-vs-textDim shrink-0" />
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
          className="flex-1 bg-vs-input text-vs-text px-1 outline-none rounded border border-vs-statusBar"
        />
      ) : (
        <span className="flex-1 truncate">{script.name}</span>
      )}
      {!isRenaming && (
        <div className="flex gap-1 invisible group-hover:visible shrink-0">
          <button title="Переименовать" onClick={(e) => { e.stopPropagation(); onStartRename() }}
            className="p-0.5 hover:text-vs-text">
            <Pencil size={11} />
          </button>
          <button title="Удалить" onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-0.5 hover:text-red-400">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}
