import React, { useEffect, useState, useMemo } from 'react'
import { GitBranch, GitCompareArrows, Play } from 'lucide-react'
import type { ScriptVersion, ScriptStats } from '@shared/types'

interface Props {
  scriptId: string
  currentContent: string
  currentVersionId: number | undefined
  onLoadVersion: (version: ScriptVersion) => void
  onLoadAndExecute: (version: ScriptVersion) => void
  onDiffVersions: (original: ScriptVersion, modified: ScriptVersion) => void
}

// ── Diff utilities ─────────────────────────────────────────────────────────

function lcsLength(a: string[], b: string[]): number {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return 0
  const dp = new Uint32Array((n + 1) * (m + 1))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i * (m + 1) + j] = a[i - 1] === b[j - 1]
        ? dp[(i - 1) * (m + 1) + (j - 1)] + 1
        : Math.max(dp[(i - 1) * (m + 1) + j], dp[i * (m + 1) + (j - 1)])
    }
  }
  return dp[n * (m + 1) + m]
}

function diffStat(oldContent: string, newContent: string): { added: number; removed: number } {
  const oldLines = oldContent.length > 0 ? oldContent.split('\n') : []
  const newLines = newContent.length > 0 ? newContent.split('\n') : []
  if (oldLines.length > 600 || newLines.length > 600) {
    return { added: newLines.length, removed: oldLines.length }
  }
  const lcs = lcsLength(oldLines, newLines)
  return { added: newLines.length - lcs, removed: oldLines.length - lcs }
}

function DiffIndicator({ added, removed, dim }: { added: number; removed: number; dim: boolean }) {
  if (added === 0 && removed === 0) return null
  const total = added + removed
  const BLOCKS = 5
  const greenCount = Math.round((added / total) * BLOCKS)
  const redCount = BLOCKS - greenCount
  const opacity = dim ? 'opacity-60' : ''
  return (
    <div className={`flex items-center gap-1 shrink-0 ${opacity}`}>
      {added > 0 && (
        <span className="text-[#4ec9b0] text-[10px] font-mono leading-none">+{added}</span>
      )}
      {removed > 0 && (
        <span className="text-[#f48771] text-[10px] font-mono leading-none">-{removed}</span>
      )}
      <div className="flex gap-[2px]">
        {Array.from({ length: greenCount }).map((_, i) => (
          <div key={`g${i}`} className="w-[7px] h-[7px] rounded-[1px] bg-[#4ec9b0]" />
        ))}
        {Array.from({ length: redCount }).map((_, i) => (
          <div key={`r${i}`} className="w-[7px] h-[7px] rounded-[1px] bg-[#f48771]" />
        ))}
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function VersionsPanel({
  scriptId, currentVersionId, onLoadVersion, onLoadAndExecute, onDiffVersions
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

  const diffs = useMemo(() =>
    versions.map((v, i) => {
      const prevContent = i < versions.length - 1 ? versions[i + 1].content : ''
      return diffStat(prevContent, v.content)
    }),
    [versions]
  )

  function handleDiffClick(e: React.MouseEvent, v: ScriptVersion) {
    e.stopPropagation()
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
          const versionNumber = versions.length - i

          return (
            <div
              key={v.id}
              title="Двойной клик — загрузить версию"
              onDoubleClick={() => onLoadVersion(v)}
              className={`flex items-center gap-2 px-2 py-1.5 text-xs border-b border-vs-border cursor-pointer
                ${isCurrent ? 'bg-vs-selected text-white' : 'hover:bg-vs-hover text-vs-text'}
                ${isSelectedDiff ? 'outline outline-1 outline-[#ce9178]' : ''}
              `}
            >
              {/* ▶ Load + Execute */}
              <button
                title="Загрузить и выполнить"
                onClick={(e) => { e.stopPropagation(); onLoadAndExecute(v) }}
                className={`shrink-0 flex items-center justify-center w-5 h-5 rounded transition-colors
                  ${isCurrent
                    ? 'text-white/80 hover:bg-white/20'
                    : 'text-[#4ec9b0] hover:bg-[#4ec9b0]/20'
                  }`}
              >
                <Play size={11} fill="currentColor" />
              </button>

              <GitBranch size={11} className={`shrink-0 ${isCurrent ? 'text-white/60' : 'text-vs-textDim'}`} />

              <div className="flex-1 min-w-0">
                <span className={`font-mono ${isCurrent ? 'text-white' : 'text-[#9cdcfe]'}`}>
                  v{versionNumber}
                </span>
                <span className={`ml-2 ${isCurrent ? 'text-white/70' : 'text-vs-textDim'}`}>
                  {fmtDate(v.createdAt)}
                </span>
                {isCurrent && <span className="ml-2 text-[#4ec9b0] text-[10px]">● активная</span>}
              </div>

              <DiffIndicator
                added={diffs[i].added}
                removed={diffs[i].removed}
                dim={isCurrent}
              />

              {/* Diff button */}
              <button
                title={selectedForDiff === null ? 'Выбрать для сравнения' : 'Сравнить с выбранной'}
                onClick={(e) => handleDiffClick(e, v)}
                className={`shrink-0 p-0.5 transition-colors ${
                  isSelectedDiff
                    ? 'text-[#ce9178]'
                    : isCurrent
                      ? 'text-white/50 hover:text-white'
                      : 'text-vs-textDim hover:text-[#9cdcfe]'
                }`}
              >
                <GitCompareArrows size={12} />
              </button>
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
