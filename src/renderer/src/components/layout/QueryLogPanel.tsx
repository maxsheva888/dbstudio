import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { QueryLogEntry, QueryLogKind, QueryLogStatus, QueryLogGrade, QueryLogPlan } from '@shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function fmtTimeShort(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function fmtDur(ms: number | null): string {
  if (ms === null || ms === 0) return '—'
  if (ms < 1000) return `${ms} мс`
  return `${(ms / 1000).toFixed(2)} с`
}

function sessionDuration(entries: QueryLogEntry[]): string {
  if (entries.length === 0) return '0 м'
  const first = entries[entries.length - 1].ranAt
  const ms = Date.now() - first
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours} ч ${minutes % 60} м`
  return `${minutes} м`
}

// ─── Kind chip ────────────────────────────────────────────────────────────────

const KIND_STYLE: Record<QueryLogKind, { bg: string; fg: string }> = {
  SELECT:  { bg: '#4ec9b018', fg: '#4ec9b0' },
  UPDATE:  { bg: '#c586c018', fg: '#c586c0' },
  INSERT:  { bg: '#569cd618', fg: '#569cd6' },
  DELETE:  { bg: '#f4877118', fg: '#f48771' },
  DDL:     { bg: '#e0af6818', fg: '#e0af68' },
  EXPLAIN: { bg: '#ffd70018', fg: '#ffd700' },
  BEGIN:   { bg: '#ffffff0a', fg: '#666' },
  CONNECT: { bg: '#ffffff0a', fg: '#666' },
  OTHER:   { bg: '#ffffff0a', fg: '#666' },
}

function KindChip({ kind }: { kind: QueryLogKind }) {
  const { bg, fg } = KIND_STYLE[kind] ?? KIND_STYLE.OTHER
  return (
    <span style={{ background: bg, color: fg }}
      className="shrink-0 px-[5px] py-[1px] rounded text-[9px] font-bold tracking-wider">
      {kind}
    </span>
  )
}

// ─── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<QueryLogStatus, string> = {
  ok: '#4ec9b0',
  slow: '#e0af68',
  error: '#f48771',
  cancelled: '#666',
}
const STATUS_LABEL: Record<QueryLogStatus, string> = {
  ok: 'OK', slow: 'SLOW', error: 'ERROR', cancelled: 'CANCELLED',
}

function StatusBadge({ status }: { status: QueryLogStatus }) {
  const c = STATUS_COLOR[status]
  return (
    <span className="inline-flex items-center gap-1.5 px-[7px] py-[2px] rounded text-[10px] font-semibold tracking-wider"
      style={{ background: `${c}18`, color: c }}>
      <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: c }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

// ─── Grade badge ──────────────────────────────────────────────────────────────

const GRADE_STYLE: Record<QueryLogGrade, { bg: string; fg: string; label: string }> = {
  A: { bg: '#4ec9b018', fg: '#4ec9b0', label: 'Отлично' },
  B: { bg: '#569cd618', fg: '#569cd6', label: 'Хорошо' },
  C: { bg: '#e0af6818', fg: '#e0af68', label: 'Умеренно' },
  D: { bg: '#f4877118', fg: '#f48771', label: 'Медленно' },
  F: { bg: '#f4877130', fg: '#f48771', label: 'Критично' },
  '?': { bg: '#ffffff0a', fg: '#666', label: 'Нет данных' },
}

function GradeBadge({ grade }: { grade: QueryLogGrade }) {
  const { bg, fg, label } = GRADE_STYLE[grade]
  return (
    <span className="inline-flex items-center gap-1.5 px-[7px] py-[2px] rounded text-[10px] font-bold"
      style={{ background: bg, color: fg, border: `1px solid ${fg}33` }}>
      <span className="text-[13px] leading-none">{grade}</span>
      <span className="font-normal text-[9px] tracking-wider uppercase">{label}</span>
    </span>
  )
}

// ─── Row SQL preview (first word colored by kind) ────────────────────────────

function SqlRowPreview({ sql, kind }: { sql: string; kind: QueryLogKind }) {
  const flat = sql.replace(/\s+/g, ' ').trim()
  const spaceIdx = flat.indexOf(' ')
  const first = spaceIdx >= 0 ? flat.slice(0, spaceIdx) : flat
  const rest = spaceIdx >= 0 ? flat.slice(spaceIdx, 160) : ''
  const { fg } = KIND_STYLE[kind] ?? KIND_STYLE.OTHER
  return (
    <>
      <span style={{ color: fg, fontWeight: 700 }}>{first}</span>
      <span style={{ color: '#c0c0c0' }}>{rest}</span>
    </>
  )
}

// ─── SQL syntax highlight ─────────────────────────────────────────────────────

const KW = new Set([
  'SELECT','FROM','WHERE','UPDATE','SET','INSERT','INTO','VALUES','DELETE','JOIN','LEFT','RIGHT',
  'INNER','OUTER','ON','ORDER','BY','GROUP','LIMIT','HAVING','AND','OR','NOT','NULL','AS','IS',
  'IN','LIKE','EXPLAIN','ALTER','TABLE','ADD','COLUMN','VARCHAR','DEFAULT','START','TRANSACTION',
  'COMMIT','ROLLBACK','SHOW','INDEX','COUNT','INTERVAL','NOW','DAY','DISTINCT','CASE','WHEN',
  'THEN','ELSE','END','CREATE','DROP','TRUNCATE','BETWEEN','EXISTS','UNION','ALL','TOP','OFFSET',
])

function SqlHighlight({ sql }: { sql: string }) {
  const parts: React.ReactNode[] = []
  const re = /(`[^`]+`|'[^']*'|"[^"]*"|\b\d+\b|--[^\n]*|\b[A-Za-z_]\w*\b|[(),;.*=<>!?]|\s+|.)/g
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(sql)) !== null) {
    const t = m[0]
    let color = '#d4d4d4'
    if (/^`.*`$/.test(t) || /^"[^"]+"$/.test(t)) color = '#9cdcfe'
    else if (/^'.*'$/.test(t)) color = '#ce9178'
    else if (/^--/.test(t)) color = '#6a9955'
    else if (/^\d+$/.test(t)) color = '#b5cea8'
    else if (KW.has(t.toUpperCase())) color = '#569cd6'
    parts.push(<span key={key++} style={{ color }}>{t}</span>)
  }
  return <>{parts}</>
}

// ─── Plan timeline ─────────────────────────────────────────────────────────────

const SCAN_COLOR: Record<string, string> = {
  pk: '#4ec9b0', index: '#4ec9b0', range: '#e0af68', full: '#f48771', meta: '#666',
}
const SCAN_LABEL: Record<string, string> = {
  pk: 'pk scan', index: 'index scan', range: 'range scan', full: 'full scan', meta: 'meta',
}

function PlanTimeline({ plan }: { plan: QueryLogPlan }) {
  const scanColor = SCAN_COLOR[plan.scan] ?? '#666'
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-mono" style={{ color: '#858585' }}>
      <span className="text-[9px] uppercase tracking-wider font-sans font-medium" style={{ color: '#555' }}>План</span>
      <span style={{ color: '#c586c0' }}>parse</span>
      <span>→</span>
      <span style={{ color: '#569cd6' }}>plan</span>
      <span>→</span>
      <span style={{ color: scanColor }}>{SCAN_LABEL[plan.scan] ?? plan.scan}</span>
      <span>→</span>
      <span style={{ color: '#d4d4d4' }}>fetch · {plan.rows.toLocaleString('ru-RU')} строк</span>
      <div className="flex-1" />
      <span style={{ color: '#555' }}>cost</span>
      <span style={{ color: '#4ec9b0' }}>{plan.cost.toFixed(2)}</span>
    </div>
  )
}

// ─── Query detail pane ────────────────────────────────────────────────────────

function QueryDetail({
  entry, onOpenSql, onExplain, explaining,
}: {
  entry: QueryLogEntry
  onOpenSql?: (sql: string) => void
  onExplain?: () => void
  explaining?: boolean
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(entry.sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const canExplain = entry.connectionId !== null
    && !entry.plan
    && !['EXPLAIN', 'CONNECT', 'BEGIN', 'OTHER'].includes(entry.kind ?? 'OTHER')

  const meta = [
    { label: 'Длительность', value: fmtDur(entry.durationMs), color: entry.status === 'slow' ? '#e0af68' : '#d4d4d4', mono: true },
    { label: 'Строк', value: entry.rowCount !== null ? entry.rowCount.toLocaleString('ru-RU') : '—', color: '#d4d4d4', mono: true },
    { label: 'База данных', value: entry.database ?? '—', color: '#4ec9b0', mono: true },
    { label: 'Пользователь', value: entry.user ?? '—', color: '#c586c0', mono: true },
    { label: 'Источник', value: entry.sourceLabel, color: '#d4d4d4', mono: false },
    { label: 'Транзакция', value: entry.tx ? 'TX' : '—', color: (entry.tx ?? false) ? '#c586c0' : '#555', mono: true },
    { label: 'Метод', value: entry.plan ? `${entry.plan.scan} scan` : '—', color: '#d4d4d4', mono: true },
    { label: 'Cost', value: entry.plan ? entry.plan.cost.toFixed(2) : '—', color: '#4ec9b0', mono: true },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: '#252526' }}>
      {/* header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 shrink-0" style={{ borderBottom: '1px solid #333' }}>
        <KindChip kind={entry.kind ?? 'OTHER'} />
        <StatusBadge status={entry.status ?? 'ok'} />
        <span className="font-mono text-[11px]" style={{ color: '#858585' }}>{fmtTime(entry.ranAt)}</span>
        <div className="flex-1" />
        {canExplain && (
          <button
            onClick={onExplain}
            disabled={explaining}
            className="flex items-center gap-1.5 px-2.5 py-[3px] rounded text-[10px] font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#2d2d2d', border: '1px solid #444', color: '#e0af68' }}
          >
            {explaining ? (
              <span className="w-[9px] h-[9px] rounded-full border-[1.5px] border-[#e0af68] border-t-transparent animate-spin" />
            ) : (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6 5.5 L11 8 L6 10.5 Z" fill="currentColor"/>
              </svg>
            )}
            Объяснить
          </button>
        )}
        {onOpenSql && (
          <button
            onClick={() => onOpenSql(entry.sql)}
            className="flex items-center gap-1.5 px-2.5 py-[3px] rounded text-[10px] font-medium text-white transition-opacity hover:opacity-80"
            style={{ background: '#0e7490' }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M4 3 L13 8 L4 13 Z" fill="currentColor"/>
            </svg>
            Открыть в редакторе
          </button>
        )}
      </div>

      {/* metadata grid */}
      <div className="px-3.5 py-2.5 shrink-0 grid grid-cols-4 gap-x-4 gap-y-2.5" style={{ borderBottom: '1px solid #333' }}>
        {meta.map((f) => (
          <div key={f.label}>
            <div className="text-[9px] uppercase tracking-wider mb-[3px]" style={{ color: '#555' }}>{f.label}</div>
            <div className="text-[12px] font-medium truncate" style={{ color: f.color, fontFamily: f.mono ? 'var(--mono, monospace)' : 'inherit' }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      {/* SQL block */}
      <div className="relative flex-1 overflow-auto px-3.5 py-3" style={{ background: '#1e1e1e', borderBottom: '1px solid #333' }}>
        <div className="text-[9px] uppercase tracking-wider mb-2 font-sans font-medium" style={{ color: '#555' }}>SQL</div>
        <button
          onClick={handleCopy}
          title="Копировать SQL"
          className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ background: '#2d2d2d', border: '1px solid #444', color: copied ? '#4ec9b0' : '#858585' }}
        >
          {copied ? (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M6 3V2H13V9H12" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          )}
        </button>
        <div className="font-mono text-[12px] leading-5 whitespace-pre-wrap break-words pr-8">
          <SqlHighlight sql={entry.sql} />
        </div>

        {entry.error && (
          <div className="mt-3 p-3 rounded flex gap-2.5 text-[11px]"
            style={{ background: '#f4877114', border: '1px solid #f4877144', color: '#f48771' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-px">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 4V9M8 11.5V11.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <div>
              <div className="font-semibold mb-1">{entry.status === 'cancelled' ? 'Запрос отменён' : 'Ошибка выполнения'}</div>
              <div className="font-mono text-[11px] leading-relaxed">{entry.error}</div>
            </div>
          </div>
        )}
      </div>

      {/* plan + grade + hints footer */}
      <div className="shrink-0 px-3.5 py-2 flex flex-col gap-2" style={{ background: '#252526' }}>
        {entry.plan && <PlanTimeline plan={entry.plan} />}
        <div className="flex items-start gap-3">
          <GradeBadge grade={entry.grade ?? '?'} />
          {(entry.hints?.length ?? 0) > 0 && (
            <ul className="flex flex-col gap-1 min-w-0">
              {entry.hints.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px]" style={{ color: '#858585' }}>
                  <span className="shrink-0 mt-px" style={{ color: '#e0af68' }}>›</span>
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ entries }: { entries: QueryLogEntry[] }) {
  const last = entries.slice(-20)
  const maxDur = Math.max(...last.map((e) => e.durationMs ?? 0), 1)
  return (
    <div className="flex items-end gap-px h-5 shrink-0">
      {last.map((e, i) => {
        const dur = e.durationMs ?? 0
        const h = Math.max(2, (Math.log(dur + 1) / Math.log(maxDur + 1)) * 20)
        const slow = dur > 1000
        return (
          <span key={i} title={fmtDur(e.durationMs)}
            style={{ width: 3, height: h, borderRadius: 1, opacity: 0.8,
              background: e.status === 'error' ? '#f48771' : slow ? '#e0af68' : '#4ec9b0' }} />
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Filter = 'all' | 'errors' | 'slow' | 'writes'
type Layout = 'vertical' | 'horizontal'

export default function QueryLogPanel({ onOpenSql }: { onOpenSql?: (sql: string) => void }) {
  const [entries, setEntries] = useState<QueryLogEntry[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<Layout>('vertical')
  const [explaining, setExplaining] = useState(false)
  const listEndRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.api?.queryLog) return
    window.api.queryLog.get().then((all) => {
      setEntries(all)
      if (all.length > 0) setSelectedId(all[all.length - 1].id)
    })
    const offEntry = window.api.queryLog.onEntry((entry) => {
      setEntries((prev) => [...prev, entry])
      const isAutoExplain = (entry.sourceLabel ?? '').startsWith('auto · explain')
      if (!isAutoExplain) setSelectedId(entry.id)
    })
    const offUpdate = window.api.queryLog.onEntryUpdate?.((updated) => {
      setEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e))
    })
    return () => { offEntry(); offUpdate?.() }
  }, [])

  // Auto-scroll list when new entry arrives
  useEffect(() => {
    if (autoScrollRef.current) listEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [entries.length])

  function handleListScroll() {
    const el = listRef.current
    if (!el) return
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter === 'errors' && e.status !== 'error' && e.status !== 'cancelled') return false
      if (filter === 'slow' && e.status !== 'slow') return false
      if (filter === 'writes' && !['UPDATE', 'INSERT', 'DELETE', 'DDL'].includes(e.kind)) return false
      if (search && !e.sql.toLowerCase().includes(search.toLowerCase()) && !(e.sourceLabel ?? '').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [entries, filter, search])

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? filtered[filtered.length - 1] ?? null,
    [entries, selectedId, filtered]
  )

  const counts = useMemo(() => ({
    all: entries.length,
    errors: entries.filter((e) => e.status === 'error' || e.status === 'cancelled').length,
    slow: entries.filter((e) => e.status === 'slow').length,
    writes: entries.filter((e) => ['UPDATE', 'INSERT', 'DELETE', 'DDL'].includes(e.kind)).length,
  }), [entries])

  const handleExplain = useCallback(async () => {
    if (!selected || !selected.connectionId || explaining) return
    setExplaining(true)
    try {
      await window.api.queryLog.explain(selected.id, selected.connectionId, selected.database, selected.sql)
    } finally {
      setExplaining(false)
    }
  }, [selected, explaining])

  async function handleClear() {
    if (!confirm('Очистить весь лог запросов?')) return
    await window.api.queryLog.clear()
    setEntries([])
    setSelectedId(null)
  }

  function handleExport() {
    const SEP = ';'
    const cell = (v: string) => (v.includes(SEP) || v.includes('"') || v.includes('\n'))
      ? `"${v.replace(/"/g, '""')}"` : v
    const headers = ['time', 'kind', 'status', 'duration_ms', 'row_count', 'database', 'source', 'tx', 'sql', 'error']
    const rows = filtered.map((e) => [
      fmtTime(e.ranAt),
      e.kind ?? 'OTHER',
      e.status ?? 'ok',
      String(e.durationMs ?? ''),
      String(e.rowCount ?? ''),
      e.database ?? '',
      e.sourceLabel ?? '',
      e.tx ? 'true' : 'false',
      e.sql.replace(/\s+/g, ' '),
      e.error ?? '',
    ].map(cell).join(SEP))
    const csv = [headers.join(SEP), ...rows].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `query-log-${Date.now()}.csv`
    a.click()
  }

  const FILTERS: { k: Filter; label: string; color?: string }[] = [
    { k: 'all',    label: 'Все' },
    { k: 'errors', label: 'Ош.',  color: '#f48771' },
    { k: 'slow',   label: 'Медл.', color: '#e0af68' },
    { k: 'writes', label: 'Зап.',  color: '#c586c0' },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'var(--sans, sans-serif)' }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 px-2 py-[5px] shrink-0 flex-wrap" style={{ borderBottom: '1px solid #333', background: '#1e1e1e' }}>

        {/* filter chips */}
        {FILTERS.map((f) => {
          const active = filter === f.k
          return (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className="flex items-center gap-1 px-[7px] h-[22px] rounded text-[10px] transition-colors"
              style={{
                background: active ? '#2d2d2d' : 'transparent',
                border: `1px solid ${active ? '#555' : '#333'}`,
                color: active ? '#d4d4d4' : '#858585',
              }}>
              {f.color && <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: f.color }} />}
              {f.label}
              <span className="px-1 rounded text-[9px] font-bold font-mono" style={{ background: '#333', color: '#666' }}>
                {counts[f.k]}
              </span>
            </button>
          )
        })}

        {/* search */}
        <div className="flex items-center gap-1.5 h-[22px] flex-1 min-w-[100px] max-w-[260px] px-2 rounded"
          style={{ background: '#2d2d2d', border: '1px solid #333' }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="#666" strokeWidth="1.3"/>
            <path d="M10.5 10.5 L13 13" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по SQL…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#d4d4d4', fontFamily: 'monospace', fontSize: 10 }}
          />
        </div>

        {/* sparkline */}
        <Sparkline entries={entries} />

        <div className="flex-1" />

        {/* layout toggle */}
        <button onClick={() => setLayout((l) => l === 'vertical' ? 'horizontal' : 'vertical')}
          title={layout === 'vertical' ? 'Side-by-side' : 'List + Detail'}
          className="w-[22px] h-[22px] flex items-center justify-center rounded transition-colors hover:bg-[#2d2d2d]"
          style={{ border: '1px solid #333', color: '#858585' }}>
          {layout === 'vertical' ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="2" y="9" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          )}
        </button>

        {/* export */}
        <button onClick={handleExport} title="Экспорт"
          className="w-[22px] h-[22px] flex items-center justify-center rounded transition-colors hover:bg-[#2d2d2d]"
          style={{ border: '1px solid #333', color: '#858585' }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M8 3V11M5 8L8 11L11 8M3 13H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>

        {/* clear */}
        <button onClick={handleClear} title="Очистить лог"
          className="w-[22px] h-[22px] flex items-center justify-center rounded transition-colors hover:bg-[#2d2d2d]"
          style={{ border: '1px solid #333', color: '#f48771' }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M3 4H13M5 4V13H11V4M6 4V2H10V4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0" style={{ flexDirection: layout === 'vertical' ? 'column' : 'row' }}>

        {/* LIST */}
        <div className="flex flex-col min-h-0 min-w-0"
          style={{
            flex: '1 1 0',
            borderRight: layout === 'horizontal' ? '1px solid #333' : 'none',
            borderBottom: layout === 'vertical' ? '1px solid #333' : 'none',
          }}>

          {/* list header */}
          <div className="grid shrink-0 px-2.5 py-[5px]"
            style={{ gridTemplateColumns: '68px 1fr', borderBottom: '1px solid #3a3a3a', background: '#252526' }}>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>Время</span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: '#666' }}>SQL</span>
          </div>

          {/* rows */}
          <div ref={listRef} onScroll={handleListScroll} className="flex-1 overflow-auto" style={{ fontFamily: 'monospace' }}>
            {filtered.length === 0 && (
              <div className="flex items-center justify-center h-16 text-[11px]" style={{ color: '#555' }}>
                {entries.length === 0 ? 'Лог пуст — запросы появятся здесь…' : 'Нет совпадений'}
              </div>
            )}
            {filtered.map((e) => {
              const sel = e.id === selected?.id
              return (
                <div key={e.id} onClick={() => setSelectedId(e.id)}
                  className="grid cursor-pointer text-[11px]"
                  style={{
                    gridTemplateColumns: '68px 1fr',
                    padding: '5px 10px',
                    borderBottom: '1px solid #2a2a2a',
                    borderLeft: sel ? '2px solid #0e7490' : '2px solid transparent',
                    background: sel ? '#0e395820' : 'transparent',
                  }}
                  onMouseEnter={(ev) => { if (!sel) ev.currentTarget.style.background = '#2a2a2a' }}
                  onMouseLeave={(ev) => { if (!sel) ev.currentTarget.style.background = 'transparent' }}>
                  {/* time */}
                  <div className="select-none leading-5 shrink-0" style={{ color: (e.status ?? 'ok') === 'error' ? '#f48771' : '#555' }}>
                    <span className="text-[10.5px] font-mono">{fmtTimeShort(e.ranAt)}</span>
                  </div>
                  {/* SQL + meta */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {e.tx && (
                      <span className="shrink-0 px-[4px] py-[1px] rounded text-[8px] font-bold tracking-wider"
                        style={{ background: '#ffffff0a', color: '#666' }}>TX</span>
                    )}
                    <span className="flex-1 truncate font-mono">
                      <SqlRowPreview sql={e.sql} kind={e.kind ?? 'OTHER'} />
                    </span>
                    {e.sourceLabel && (
                      <span className="shrink-0 text-[10px]" style={{ color: '#555' }}>· {e.sourceLabel}</span>
                    )}
                    {e.durationMs !== null && (
                      <span className="shrink-0 text-[10px] font-mono"
                        style={{ color: (e.status ?? 'ok') === 'slow' ? '#e0af68' : '#555' }}>
                        {fmtDur(e.durationMs)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={listEndRef} />
          </div>

          {/* list footer */}
          <div className="flex items-center gap-2 px-2.5 shrink-0 text-[10px]"
            style={{ height: 24, borderTop: '1px solid #2a2a2a', background: '#252526', color: '#555', fontFamily: 'monospace' }}>
            <span>{filtered.length} записей</span>
            <span>·</span>
            <span>сессия {sessionDuration(entries)}</span>
            <div className="flex-1" />
            <span className="flex items-center gap-1.5" style={{ color: '#4ec9b0' }}>
              <span className="w-[5px] h-[5px] rounded-full" style={{ background: '#4ec9b0' }} />
              live
            </span>
          </div>
        </div>

        {/* DETAIL PANE */}
        <div className="flex flex-col min-h-0 min-w-0" style={{ flex: '1 1 0' }}>
          {selected ? (
            <QueryDetail
              entry={selected}
              onOpenSql={onOpenSql}
              onExplain={handleExplain}
              explaining={explaining}
            />
          ) : (
            <div className="flex items-center justify-center flex-1 text-[11px]" style={{ color: '#555', background: '#252526' }}>
              Выберите запрос для просмотра деталей
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
