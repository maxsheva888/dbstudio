import React, { useEffect, useState } from 'react'
import { Star, Clock, LayoutGrid, Archive } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import type { ScriptFile, ScriptSuggestions } from '@shared/types'

interface Props {
  onOpenScript: (script: ScriptFile) => void
  activeTable?: string | null
}

export default function SuggestionsSection({ onOpenScript, activeTable }: Props) {
  const { activeDatabase } = useConnections()
  const [suggestions, setSuggestions] = useState<ScriptSuggestions | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.api.scripts.suggestions(activeDatabase, activeTable ?? null).then(setSuggestions)
  }, [activeDatabase, activeTable])

  if (!suggestions) return null

  const hasAny =
    suggestions.favourites.length > 0 ||
    suggestions.recent.length > 0 ||
    suggestions.contextual.length > 0 ||
    suggestions.archiveCandidates.length > 0

  if (!hasAny) return null

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="border-b border-vs-border">
      {suggestions.favourites.length > 0 && (
        <Group
          id="favourites"
          label="Избранные"
          icon={<Star size={11} className="text-[#ffd700]" />}
          count={suggestions.favourites.length}
          collapsed={collapsed.has('favourites')}
          onToggle={() => toggle('favourites')}
        >
          {suggestions.favourites.map((s) => (
            <SuggestionRow
              key={s.id}
              name={s.name}
              meta={`${s.runCount} запусков`}
              onClick={() => onOpenScript(s)}
            />
          ))}
        </Group>
      )}

      {suggestions.recent.length > 0 && (
        <Group
          id="recent"
          label="Недавние"
          icon={<Clock size={11} className="text-[#4a9cd6]" />}
          count={suggestions.recent.length}
          collapsed={collapsed.has('recent')}
          onToggle={() => toggle('recent')}
        >
          {suggestions.recent.map((s) => (
            <SuggestionRow
              key={s.id}
              name={s.name}
              meta={relativeDate(s.lastRunAt)}
              onClick={() => onOpenScript(s)}
            />
          ))}
        </Group>
      )}

      {suggestions.contextual.length > 0 && (
        <Group
          id="contextual"
          label={activeTable ? `Для таблицы: ${activeTable}` : `Для БД: ${activeDatabase}`}
          icon={<LayoutGrid size={11} className="text-[#4ec9b0]" />}
          count={suggestions.contextual.length}
          collapsed={collapsed.has('contextual')}
          onToggle={() => toggle('contextual')}
        >
          {suggestions.contextual.map((s) => (
            <SuggestionRow key={s.id} name={s.name} onClick={() => onOpenScript(s)} />
          ))}
        </Group>
      )}

      {suggestions.archiveCandidates.length > 0 && (
        <Group
          id="archive"
          label="Архивировать?"
          icon={<Archive size={11} className="text-vs-textDim" />}
          count={suggestions.archiveCandidates.length}
          collapsed={collapsed.has('archive')}
          onToggle={() => toggle('archive')}
        >
          {suggestions.archiveCandidates.map((s) => (
            <SuggestionRow
              key={s.id}
              name={s.name}
              meta={s.lastRunAt ? `30+ дней назад` : 'никогда'}
              muted
              onClick={() => onOpenScript(s)}
            />
          ))}
        </Group>
      )}
    </div>
  )
}

function Group({
  id, label, icon, count, collapsed, onToggle, children
}: {
  id: string
  label: string
  icon: React.ReactNode
  count: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-vs-hover select-none"
        onClick={onToggle}
      >
        <span className="text-vs-textDim text-[10px]">{collapsed ? '▸' : '▾'}</span>
        {icon}
        <span className="text-xs text-vs-textDim font-semibold flex-1 truncate">{label}</span>
        <span className="text-xs text-vs-textDim">{count}</span>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

function SuggestionRow({
  name, meta, muted, onClick
}: { name: string; meta?: string; muted?: boolean; onClick: () => void }) {
  return (
    <div
      className="flex items-center gap-1.5 pl-7 pr-3 py-0.5 cursor-pointer hover:bg-vs-hover text-xs"
      onClick={onClick}
    >
      <span className={`flex-1 truncate ${muted ? 'text-vs-textDim' : 'text-vs-text'}`}>{name}</span>
      {meta && <span className="text-[10px] text-vs-textDim shrink-0">{meta}</span>}
    </div>
  )
}

function relativeDate(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(diff / 86400000)
  return `${days} дн назад`
}
