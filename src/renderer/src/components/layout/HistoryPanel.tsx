import React, { useEffect, useState, useCallback } from 'react'
import { FileCode2, Terminal, RefreshCw, ExternalLink, Play } from 'lucide-react'
import type { HistoryEntry, ScriptFile } from '@shared/types'

interface Props {
  onOpenScript: (script: ScriptFile) => void
  onRunScript: (script: ScriptFile) => void
  onOpenSql: (sql: string) => void
  onRunSql: (sql: string) => void
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(diff / 86400000)} дн назад`
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function HistoryPanel({ onOpenScript, onRunScript, onOpenSql, onRunSql }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    setLoading(true)
    window.api.scripts.history(300).then((h) => {
      setEntries(h)
      setLoading(false)
    })
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handleOpenScript(entry: HistoryEntry) {
    if (!entry.scriptId) return
    const scripts = await window.api.scripts.list()
    const script = scripts.find((s) => s.id === entry.scriptId)
    if (script) onOpenScript(script)
  }

  async function handleRunScript(entry: HistoryEntry) {
    if (!entry.scriptId) return
    const scripts = await window.api.scripts.list()
    const script = scripts.find((s) => s.id === entry.scriptId)
    if (script) onRunScript(script)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-vs-textDim text-xs">
        Загрузка…
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
        <span className="text-sm text-vs-textDim">История пуста</span>
        <span className="text-xs text-vs-textDim opacity-60">Запросы появятся после выполнения</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-end px-3 py-1 border-b border-vs-border shrink-0">
        <button onClick={reload} title="Обновить" className="text-vs-textDim hover:text-vs-text transition-colors">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <div key={entry.id} className="group border-b border-vs-border px-3 py-2 hover:bg-vs-hover">
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">
                {entry.type === 'script'
                  ? <FileCode2 size={12} className="text-[#4ec9b0]" />
                  : <Terminal size={12} className="text-vs-textDim" />
                }
              </div>

              <div className="flex-1 min-w-0">
                {/* title row */}
                <div className="flex items-center gap-1.5 mb-0.5">
                  {entry.type === 'script' ? (
                    <span className="text-xs text-vs-text font-medium truncate">{entry.scriptName}</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-vs-border text-vs-textDim uppercase tracking-wide shrink-0">SQL</span>
                  )}
                  <span className="text-[10px] text-vs-textDim ml-auto shrink-0">{relativeTime(entry.ranAt)}</span>
                </div>

                {/* sql preview */}
                <pre className="text-[11px] text-vs-textDim font-mono truncate whitespace-nowrap overflow-hidden">
                  {entry.sqlPreview.replace(/\s+/g, ' ').trim()}
                </pre>

                {/* stats + actions */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-vs-textDim">{fmtMs(entry.durationMs)}</span>
                  {entry.rowCount != null && (
                    <span className="text-[10px] text-vs-textDim">{entry.rowCount} строк</span>
                  )}

                  <div className="ml-auto flex gap-2 invisible group-hover:visible">
                    {/* открыть */}
                    {entry.type === 'script' && entry.scriptId ? (
                      <button
                        onClick={() => handleOpenScript(entry)}
                        title="Открыть скрипт"
                        className="flex items-center gap-0.5 text-[10px] text-vs-textDim hover:text-vs-text transition-colors"
                      >
                        <ExternalLink size={10} />
                        открыть
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenSql(entry.sqlPreview)}
                        title="Открыть в редакторе"
                        className="flex items-center gap-0.5 text-[10px] text-vs-textDim hover:text-vs-text transition-colors"
                      >
                        <ExternalLink size={10} />
                        открыть
                      </button>
                    )}

                    {/* запустить */}
                    {entry.type === 'script' && entry.scriptId ? (
                      <button
                        onClick={() => handleRunScript(entry)}
                        title="Открыть и запустить"
                        className="flex items-center gap-0.5 text-[10px] text-vs-textDim hover:text-[#4ec9b0] transition-colors"
                      >
                        <Play size={10} />
                        запустить
                      </button>
                    ) : (
                      <button
                        onClick={() => onRunSql(entry.sqlPreview)}
                        title="Открыть и запустить"
                        className="flex items-center gap-0.5 text-[10px] text-vs-textDim hover:text-[#4ec9b0] transition-colors"
                      >
                        <Play size={10} />
                        запустить
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
