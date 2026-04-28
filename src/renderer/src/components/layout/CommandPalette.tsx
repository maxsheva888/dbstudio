import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { FileCode2, Server, Plus, Sun, Moon, Plug, PlugZap } from 'lucide-react'
import { useScripts } from '@renderer/context/ScriptsContext'
import { useConnections } from '@renderer/context/ConnectionsContext'
import { useSettings } from '@renderer/context/SettingsContext'
import type { ScriptFile, ConnectionConfig } from '@shared/types'

interface PaletteItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
}

interface Props {
  onClose: () => void
  onOpenScript: (script: ScriptFile) => void
  onNewTab: () => void
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.includes(q)) return 60
  return 10
}

export default function CommandPalette({ onClose, onOpenScript, onNewTab }: Props) {
  const { scripts } = useScripts()
  const { connections, activeConnectionId, connect, disconnect } = useConnections()
  const { theme, setTheme } = useSettings()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const items = useMemo((): PaletteItem[] => {
    const result: PaletteItem[] = []

    // Fixed actions
    if (!query || fuzzyMatch(query, 'новая вкладка new tab')) {
      result.push({
        id: '__new_tab',
        label: 'Новая вкладка',
        description: 'Ctrl+T',
        icon: <Plus size={14} className="text-vs-textDim" />,
        action: () => { onNewTab(); onClose() }
      })
    }

    if (!query || fuzzyMatch(query, 'тема theme переключить')) {
      result.push({
        id: '__theme',
        label: theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему',
        icon: theme === 'dark'
          ? <Sun size={14} className="text-[#ffd700]" />
          : <Moon size={14} className="text-vs-textDim" />,
        action: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); onClose() }
      })
    }

    // Scripts
    const matchedScripts = scripts
      .filter((s) => !query || fuzzyMatch(query, s.name))
      .sort((a, b) => fuzzyScore(query, b.name) - fuzzyScore(query, a.name))
      .slice(0, 8)

    for (const s of matchedScripts) {
      result.push({
        id: `script:${s.id}`,
        label: s.name,
        description: scopeLabel(s.scope),
        icon: <FileCode2 size={14} className="text-[#4ec9b0]" />,
        action: () => { onOpenScript(s); onClose() }
      })
    }

    // Connections
    const matchedConns = connections
      .filter((c) => !query || fuzzyMatch(query, c.name) || fuzzyMatch(query, c.host))
      .slice(0, 5)

    for (const c of matchedConns) {
      const isActive = c.id === activeConnectionId
      result.push({
        id: `conn:${c.id}`,
        label: isActive ? `Отключиться от ${c.name}` : `Подключиться к ${c.name}`,
        description: `${c.user}@${c.host}:${c.port}`,
        icon: isActive
          ? <PlugZap size={14} className="text-[#4ec9b0]" />
          : <Plug size={14} className="text-vs-textDim" />,
        action: async () => {
          if (isActive) await disconnect(c.id)
          else await connect(c.id)
          onClose()
        }
      })
    }

    return result
  }, [query, scripts, connections, activeConnectionId, theme])

  useEffect(() => { setSelected(0) }, [query])

  const runSelected = useCallback(() => {
    items[selected]?.action()
  }, [items, selected])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); runSelected(); return }
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-[15vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[560px] bg-vs-sidebar border border-vs-border rounded shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-vs-border">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск команд, скриптов, подключений…"
            className="flex-1 bg-transparent text-vs-text text-sm outline-none placeholder:text-vs-textDim"
          />
          <span className="text-xs text-vs-textDim">Esc — закрыть</span>
        </div>

        {/* Items */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-vs-textDim">Ничего не найдено</div>
          )}
          {items.map((item, i) => (
            <div
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setSelected(i)}
              className={`flex items-center gap-3 px-4 py-2 cursor-pointer text-sm transition-colors
                ${i === selected ? 'bg-vs-selected text-white' : 'text-vs-text hover:bg-vs-hover'}`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.description && (
                <span className={`text-xs shrink-0 ${i === selected ? 'text-white/70' : 'text-vs-textDim'}`}>
                  {item.description}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function scopeLabel(scope: string): string {
  if (scope === 'global') return 'Глобальный'
  if (scope.startsWith('db:')) return `БД: ${scope.slice(3)}`
  if (scope.startsWith('table:')) return `Таблица: ${scope.slice(6)}`
  return scope
}
