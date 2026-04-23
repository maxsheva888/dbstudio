import React, { useEffect, useState } from 'react'
import { GitBranch, RotateCcw, GitCompareArrows } from 'lucide-react'
import type { ScriptVersion, ScriptStats } from '@shared/types'

interface Props {
  scriptId: string
  currentContent: string
  currentVersionId: number | undefined
  onLoadVersion: (version: ScriptVersion) => void
  onDiffVersions: (original: ScriptVersion, modified: ScriptVersion) => void
}

export default function VersionsPanel({
  scriptId, currentVersionId, onLoadVersion, onDiffVersions
}: Props) {
  const [versions, setVersions] = useState<ScriptVersion[]>([])
  const [stats, setStats] = useState<ScriptStats | null>(null)
  const [selectedForDiff, setSelectedForDiff] = useState<number | null>(null)

  useEffect(() => {
    setSelectedForDiff(null)
    Promise.all([
      window.api.scripts.versions(scriptId),
      window.api.scripts.stats(scriptId)
    ]).then(([v, s]) => { setVersions(v); setStats(s) })
  }, [scriptId, currentVersionId])

  function handleDiffClick(v: ScriptVersion) {
    if (selectedForDiff === null) { setSelectedForDiff(v.id); return }
    if (selectedForDiff === v.id) { setSelectedForDiff(null); return }
    const first = versions.find((x) => x.id === selectedForDiff)!
    const [older, newer] = first.createdAt < v.createdAt ? [first, v] : [v, first]
    setSelectedForDiff(null)
    onDiffVersions(older, newer)
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-vs-textDim text-xs">
        Нет сохранённых версий
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats */}
      {stats && (
        <div className="flex items-center gap-4 px-3 py-1.5 border-b border-vs-border text-xs text-vs-textDim shrink-0">
          <span>Запусков: <strong className="text-[#9cdcfe]">{stats.runCount}</strong></span>
          {stats.lastRunAt && (
            <span>Последний: <strong className="text-[#9cdcfe]">{fmtDate(stats.lastRunAt)}</strong></span>
          )}
          {stats.errorCount > 0 && (
            <span>Ошибок: <strong className="text-[#f48771]">{stats.errorCount}</strong></span>
          )}
          {selectedForDiff !== null && (
            <span className="ml-auto text-[#ce9178]">Выберите вторую версию для сравнения</span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {versions.map((v, i) => {
          const isCurrent = v.id === currentVersionId
          const isSelectedDiff = selectedForDiff === v.id
          return (
            <div
              key={v.id}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b border-vs-border
                ${isCurrent ? 'bg-vs-selected text-white' : 'hover:bg-vs-hover'}
                ${isSelectedDiff ? 'outline outline-1 outline-[#ce9178]' : ''}
              `}
            >
              <GitBranch size={11} className="text-vs-textDim shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[#9cdcfe] font-mono">v{versions.length - i}</span>
                <span className="ml-2 text-vs-textDim">{fmtDate(v.createdAt)}</span>
                {isCurrent && <span className="ml-2 text-[#4ec9b0] text-[10px]">● активная</span>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  title={selectedForDiff === null ? 'Выбрать для сравнения' : 'Сравнить с выбранной'}
                  onClick={() => handleDiffClick(v)}
                  className={`p-0.5 transition-colors ${isSelectedDiff ? 'text-[#ce9178]' : 'text-vs-textDim hover:text-[#9cdcfe]'}`}
                >
                  <GitCompareArrows size={12} />
                </button>
                {!isCurrent && (
                  <button
                    title="Загрузить эту версию"
                    onClick={() => onLoadVersion(v)}
                    className="p-0.5 text-vs-textDim hover:text-[#4ec9b0] transition-colors"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
