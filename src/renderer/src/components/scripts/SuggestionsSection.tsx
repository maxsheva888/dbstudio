import React, { useEffect, useState } from 'react'
import { ChevronRight, Star, Clock, LayoutGrid, Archive } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import type { ScriptFile, ScriptSuggestions } from '@shared/types'

interface Props {
  onOpenScript: (script: ScriptFile) => void
  activeTable?: string | null
}

export default function SuggestionsSection({ onOpenScript, activeTable }: Props) {
  const { activeDatabase, activeConnectionId } = useConnections()
  const [suggestions, setSuggestions] = useState<ScriptSuggestions | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.api.scripts.suggestions(activeConnectionId, activeDatabase, activeTable ?? null).then(setSuggestions)
  }, [activeConnectionId, activeDatabase, activeTable])

  if (!suggestions) return null

  const { favourites, recent, contextual } = suggestions
  const hasAny = favourites.length > 0 || recent.length > 0 || contextual.length > 0
  if (!hasAny) return null

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <div className="border-b border-vs-border">
      {favourites.length > 0 && (
        <SectionGroup
          id="favourites"
          label="Избранные"
          icon={<Star size={11} className="text-[#ffd700]" />}
          count={favourites.length}
          collapsed={collapsed.has('favourites')}
          onToggle={() => toggle('favourites')}
        >
          {favourites.map((s) => (
            <SuggestionRow key={s.id} name={s.name} meta={`${s.runCount} запусков`} onClick={() => onOpenScript(s)} />
          ))}
        </SectionGroup>
      )}

      {recent.length > 0 && (
        <SectionGroup
          id="recent"
          label="Недавние"
          icon={<Clock size={11} className="text-[#4a9cd6]" />}
          count={recent.length}
          collapsed={collapsed.has('recent')}
          onToggle={() => toggle('recent')}
        >
          {recent.map((s) => (
            <SuggestionRow key={s.id} name={s.name} meta={relativeDate(s.lastRunAt)} onClick={() => onOpenScript(s)} />
          ))}
        </SectionGroup>
      )}

      {contextual.length > 0 && (
        <SectionGroup
          id="contextual"
          label={activeTable ? `Для таблицы: ${activeTable}` : `Для БД: ${activeDatabase}`}
          icon={<LayoutGrid size={11} className="text-[#4ec9b0]" />}
          count={contextual.length}
          collapsed={collapsed.has('contextual')}
          onToggle={() => toggle('contextual')}
        >
          {contextual.map((s) => (
            <SuggestionRow key={s.id} name={s.name} onClick={() => onOpenScript(s)} />
          ))}
        </SectionGroup>
      )}
    </div>
  )
}

// ─── Archive section (rendered at the bottom of ScriptPanel) ───────────────

interface ArchiveProps {
  onOpenScript: (script: ScriptFile) => void
  activeTable?: string | null
}

export function ArchiveSection({ onOpenScript, activeTable }: ArchiveProps) {
  const { activeDatabase, activeConnectionId } = useConnections()
  const [candidates, setCandidates] = useState<(ScriptFile & { lastRunAt: number | null })[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    window.api.scripts.suggestions(activeConnectionId, activeDatabase, activeTable ?? null).then((s) => {
      setCandidates(s.archiveCandidates)
    })
  }, [activeConnectionId, activeDatabase, activeTable])

  if (candidates.length === 0) return null

  return (
    <SectionGroup
      id="archive"
      label="Архивировать?"
      icon={<Archive size={11} className="text-vs-textDim" />}
      count={candidates.length}
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
    >
      {candidates.map((s) => (
        <SuggestionRow
          key={s.id}
          name={s.name}
          meta={s.lastRunAt ? `30+ дней назад` : 'никогда'}
          muted
          onClick={() => onOpenScript(s)}
        />
      ))}
    </SectionGroup>
  )
}

// ─── Shared section group ──────────────────────────────────────────────────

export function SectionGroup({
  label, icon, count, collapsed, onToggle, children, indent = 0, dimmed = false
}: {
  label: string
  icon?: React.ReactNode
  count?: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
  id?: string
  indent?: number
  dimmed?: boolean
}) {
  const paddingLeft = indent > 0 ? `${indent * 12 + 8}px` : undefined
  return (
    <div>
      <div
        style={paddingLeft ? { paddingLeft } : undefined}
        className={`flex items-center h-[22px] gap-1 cursor-pointer select-none hover:bg-vs-hover bg-vs-panelHeader ${!paddingLeft ? 'px-2' : ''} ${dimmed ? 'opacity-60' : ''}`}
        onClick={onToggle}
      >
        <ChevronRight
          size={12}
          className={`text-vs-textDim shrink-0 transition-transform duration-100 ${!collapsed ? 'rotate-90' : ''}`}
        />
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-vs-textDim flex-1 truncate ml-0.5">
          {label}
        </span>
        {count !== undefined && (
          <span className="text-[11px] text-vs-textDim pr-1">{count}</span>
        )}
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

// ─── Shared row ────────────────────────────────────────────────────────────

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
  return `${Math.floor(diff / 86400000)} дн назад`
}
