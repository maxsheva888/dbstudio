import React, { useState, useEffect, useRef } from 'react'
import type { QueryLogEntry } from '@shared/types'

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export default function QueryLogPanel() {
  const [entries, setEntries] = useState<QueryLogEntry[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    if (!window.api?.queryLog) return
    window.api.queryLog.get().then(setEntries)
    const off = window.api.queryLog.onEntry((entry) => {
      setEntries((prev) => [...prev, entry])
    })
    return off
  }, [])

  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [entries.length])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    autoScrollRef.current = atBottom
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-auto bg-vs-editor font-mono text-xs leading-5 px-3 py-2"
    >
      {entries.length === 0 && (
        <span className="text-vs-textDim italic">Лог пуст — запросы появятся здесь...</span>
      )}
      {entries.map((e) => (
        <div key={e.id} className="flex gap-2 group hover:bg-white/[0.03] rounded px-1 -mx-1">
          {/* timestamp */}
          <span className="shrink-0 text-vs-textDim opacity-50 select-none">{fmtTime(e.ranAt)}</span>

          {/* source badge */}
          {e.source === 'system' && (
            <span className="shrink-0 text-vs-textDim opacity-40 italic">/*sys*/</span>
          )}

          {/* sql */}
          <span
            className={`flex-1 truncate ${e.error ? 'text-[#f48771]' : e.source === 'system' ? 'text-vs-textDim' : 'text-vs-text'}`}
          >
            {e.sql.replace(/\s+/g, ' ').trim()}
          </span>

          {/* right side: duration + rows */}
          <span className="shrink-0 text-vs-textDim opacity-50 text-right whitespace-nowrap">
            {e.error
              ? <span className="text-[#f48771]">{e.error.split('\n')[0].slice(0, 60)}</span>
              : <>
                  {fmtDuration(e.durationMs)}
                  {e.rowCount !== null && e.rowCount >= 0 && (
                    <span className="ml-2 opacity-70">{e.rowCount} rows</span>
                  )}
                </>
            }
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
