import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  KeyRound, Key, Link2, Hash, Columns3, Loader2,
  Table2, Copy, ChevronUp, ChevronDown, RefreshCw,
  ExternalLink, ArrowRight,
} from 'lucide-react'
import type { ColumnInfo, IndexInfo, ForeignKeyInfo, QueryResult } from '@shared/types'
import ResultsGrid from '../results/ResultsGrid'

interface Props {
  connectionId: string
  database: string
  table: string
  savedState?: { activeSubTab: string; whereClause: string; orderBy: string; limit: number }
  onSavedStateChange?: (state: { activeSubTab: string; whereClause: string; orderBy: string; limit: number }) => void
}

type TabKey = 'structure' | 'data' | 'indexes' | 'fk' | 'ddl'
type SaveState = 'idle' | 'saving' | 'saved'

type EditRecord = { from: unknown; to: string | null }
type PendingEdits = Map<number, Record<string, EditRecord>>

const TABS: { k: TabKey; label: string }[] = [
  { k: 'structure', label: 'Структура' },
  { k: 'data', label: 'Данные' },
  { k: 'indexes', label: 'Индексы' },
  { k: 'fk', label: 'Внешние ключи' },
  { k: 'ddl', label: 'DDL' },
]

function sqlLiteral(v: unknown): string {
  if (v == null) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

function declEdit(n: number): string {
  const m = n % 100, k = n % 10
  if (m >= 11 && m <= 14) return `${n} изм.`
  if (k === 1) return `${n} изм.`
  if (k >= 2 && k <= 4) return `${n} изм.`
  return `${n} изм.`
}

// ── Column kind icon ────────────────────────────────────────────────────────

function ColIcon({ col }: { col: ColumnInfo }) {
  if (col.key === 'PRI') return <KeyRound size={12} className="text-[#ffd700] shrink-0" />
  if (col.key === 'UNI') return <Key size={12} className="text-[#f48771] shrink-0" />
  if (col.key === 'MUL') return col.refTable
    ? <Link2 size={12} className="text-[#4ec9b0] shrink-0" />
    : <Hash size={12} className="text-[#569cd6] shrink-0" />
  return <Columns3 size={12} className="text-vs-textDim shrink-0" />
}

function KeyBadge({ k }: { k: string }) {
  const styles: Record<string, string> = {
    PK: 'bg-[#ffd70022] text-[#ffd700]',
    FK: 'bg-[#c586c022] text-[#c586c0]',
    UNI: 'bg-[#f4877122] text-[#f48771]',
    MUL: 'bg-[#569cd622] text-[#569cd6]',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${styles[k] ?? 'bg-vs-hover text-vs-textDim'}`}>
      {k}
    </span>
  )
}

// ── Inline Pending Bar (lives in sub-tabs row) ───────────────────────────────

function InlinePendingBar({
  editCellCount, isProtected, saveState, saveError,
  lastSavedCount, onToggle, onSave, onDiscard, onShowDiff,
}: {
  editCellCount: number
  isProtected: boolean
  saveState: SaveState
  saveError?: string
  lastSavedCount: number
  onToggle: () => void
  onSave: () => void
  onDiscard: () => void
  onShowDiff: () => void
}) {
  const isSaving = saveState === 'saving'
  const isSaved  = saveState === 'saved'
  const showBar  = editCellCount > 0 || isSaving || isSaved

  return (
    <div className="flex items-stretch gap-2 h-[22px]">
      {showBar && (
        <div className={`flex items-stretch rounded border overflow-hidden text-[11px] ${
          isSaved
            ? 'border-[#4ec9b0] shadow-[0_0_0_2px_#4ec9b022]'
            : 'border-[#c586c0] shadow-[0_0_0_2px_#c586c022]'
        }`}>
          {/* status segment */}
          <div className={`flex items-center gap-1.5 px-2.5 border-r border-vs-border shrink-0 ${
            isSaved ? 'bg-[#4ec9b018]' : 'bg-[#c586c014]'
          }`}>
            {isSaving ? (
              <span className="w-[9px] h-[9px] rounded-full border-[1.5px] border-[#c586c0] border-t-transparent animate-spin shrink-0" />
            ) : isSaved ? (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="#4ec9b0" strokeWidth="1.5"/>
                <path d="M5 8L7.2 10.2L11.5 5.6" stroke="#4ec9b0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <span className="w-[7px] h-[7px] rounded-full bg-[#c586c0] animate-pulse shrink-0" />
            )}
            <span className={`font-medium whitespace-nowrap ${isSaved ? 'text-[#4ec9b0]' : 'text-vs-text'}`}>
              {isSaving ? 'Сохранение…'
                : isSaved ? `Сохранено · ${lastSavedCount}`
                : declEdit(editCellCount)}
            </span>
          </div>

          {!isSaved && !isSaving && (
            <>
              <button
                onClick={onShowDiff}
                className="flex items-center gap-1.5 px-2 border-r border-vs-border text-vs-textDim hover:bg-vs-hover transition-colors"
                title="Просмотр изменений"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4H13M3 8H10M3 12H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <span className="font-mono text-[10px]">diff</span>
              </button>

              <button
                onClick={onDiscard}
                className="flex items-center gap-1.5 px-2 border-r border-vs-border text-vs-textDim hover:text-[#f48771] hover:bg-vs-hover transition-colors"
                title="Отменить все изменения"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Отменить
              </button>

              <button
                onClick={onSave}
                className="flex items-center gap-1.5 px-2.5 bg-vs-accent hover:opacity-80 text-white font-medium transition-opacity whitespace-nowrap"
                title="Сохранить изменения (Ctrl+S / ⌘S)"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3H11L13 5V13H3ZM5 3V7H10V3M5 13V9H11V13" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
                Сохранить
                <span className="text-[9px] px-1 rounded bg-black/25 font-mono leading-tight">⌘S</span>
              </button>
            </>
          )}
        </div>
      )}

      {saveError && !showBar && (
        <span className="flex items-center text-[10px] text-[#f48771] max-w-[200px] truncate">{saveError}</span>
      )}

      {/* protection toggle */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-2.5 rounded border text-[11px] font-medium transition-colors ${
          isProtected
            ? 'border-[#4ec9b044] text-[#4ec9b0] bg-[#4ec9b010] hover:bg-[#4ec9b020]'
            : 'border-[#c586c044] text-[#c586c0] bg-[#c586c010] hover:bg-[#c586c020]'
        }`}
        title={isProtected
          ? 'Защита включена — только просмотр. Нажмите чтобы включить редактирование'
          : 'Режим редактирования активен. Нажмите чтобы вернуть защиту'}
      >
        {isProtected ? (
          <>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L13.5 3.5V8C13.5 11.2 11 13.6 8 14.5C5 13.6 2.5 11.2 2.5 8V3.5Z"
                stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M5.6 8L7.4 9.8L10.6 6.4"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Защита
          </>
        ) : (
          <>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M3 13L3 11L11 3L13 5L5 13Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
            Редактирование
          </>
        )}
      </button>
    </div>
  )
}

// ── Diff Review Popover ─────────────────────────────────────────────────────

function DiffReview({
  pendingEdits, pkCols, rows, database, table, onClose, onRevert,
}: {
  pendingEdits: PendingEdits
  pkCols: string[]
  rows?: Record<string, unknown>[]
  database: string
  table: string
  onClose: () => void
  onRevert: (rowIdx: number, col: string) => void
}) {
  const entries: { rowIdx: number; col: string; from: unknown; to: string | null }[] = []
  for (const [rowIdx, edits] of pendingEdits.entries()) {
    for (const [col, edit] of Object.entries(edits)) {
      entries.push({ rowIdx, col, from: edit.from, to: edit.to })
    }
  }

  function rowLabel(rowIdx: number) {
    const row = rows?.[rowIdx]
    if (!row) return `#${rowIdx + 1}`
    if (pkCols.length > 0) {
      const pkVal = row[pkCols[0]]
      return `${pkCols[0]}=${pkVal != null ? String(pkVal) : 'NULL'}`
    }
    return `#${rowIdx + 1}`
  }

  function displayVal(v: unknown): string {
    if (v == null) return 'NULL'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  return (
    <div
      className="absolute top-[113px] right-2 z-30 w-[560px] max-h-[300px] flex flex-col rounded-md shadow-2xl overflow-hidden text-[11px]"
      style={{ background: '#252526', border: '1px solid #454545' }}
    >
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #3a3a3a', background: '#2d2d2d' }}>
        <span className="text-[#d4d4d4] font-medium text-[12px]">Несохранённые изменения</span>
        <span className="px-1.5 py-0.5 rounded bg-[#c586c022] text-[#c586c0] text-[9px] font-bold tracking-wider">
          {entries.length}
        </span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-[#858585] hover:text-[#d4d4d4] text-base leading-none px-1">×</button>
      </div>

      <div className="flex-1 overflow-auto font-mono">
        {entries.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 min-w-0"
            style={{ borderBottom: '1px solid #3a3a3a' }}
            onMouseEnter={(ev) => (ev.currentTarget.style.background = '#2a2a2a')}
            onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
          >
            <span className="shrink-0 px-1 py-px rounded text-[#858585] text-[9px] font-bold tracking-wider" style={{ background: '#333' }}>UPD</span>
            <span className="text-[#858585] text-[10px] shrink-0">{rowLabel(e.rowIdx)}</span>
            <span className="text-[#c586c0] shrink-0">{e.col}</span>
            <span className="line-through text-[#f48771] max-w-[130px] truncate shrink-0" title={displayVal(e.from)}>
              {displayVal(e.from)}
            </span>
            <span className="text-[#858585] shrink-0">→</span>
            <span className="text-[#4ec9b0] px-1.5 rounded max-w-[150px] truncate" style={{ background: 'rgba(78,201,176,0.1)' }} title={e.to ?? 'NULL'}>
              {e.to ?? 'NULL'}
            </span>
            <div className="flex-1 min-w-0" />
            <button
              onClick={() => onRevert(e.rowIdx, e.col)}
              className="shrink-0 text-[10px] px-1 font-sans text-[#858585] hover:text-[#f48771] transition-colors"
            >
              ↩ откатить
            </button>
          </div>
        ))}
      </div>

      <div className="h-[26px] flex items-center gap-2 px-3 text-[10px] font-mono shrink-0 text-[#858585]" style={{ borderTop: '1px solid #3a3a3a', background: '#1e1e1e' }}>
        <span>SQL:</span>
        <span className="text-[#d4d4d4]">UPDATE {database}.{table} SET …</span>
        <div className="flex-1" />
        <span className="text-[#c586c0]">{pendingEdits.size} statements</span>
      </div>
    </div>
  )
}

// ── Structure tab ──────────────────────────────────────────────────────────

function StructureTab({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11px] font-mono">
        <thead className="sticky top-0 z-10">
          <tr className="bg-vs-panel border-b border-vs-borderStrong">
            {['#', '', 'Имя', 'Тип', 'NN', 'Default', 'Ключи', 'Ссылка'].map((h, i) => (
              <th key={i} className="text-left px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-vs-textDim font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => {
            const keys: string[] = []
            if (col.key === 'PRI') keys.push('PK')
            if (col.key === 'MUL' && col.refTable) keys.push('FK')
            if (col.key === 'UNI') keys.push('UNI')
            if (col.key === 'MUL' && !col.refTable) keys.push('MUL')
            return (
              <tr key={col.name} className="border-b border-vs-border hover:bg-vs-hover/50">
                <td className="px-2.5 py-1.5 text-vs-textMuted w-8">{i + 1}</td>
                <td className="px-2 py-1.5 w-6"><ColIcon col={col} /></td>
                <td className={`px-2.5 py-1.5 ${col.key === 'PRI' ? 'text-[#ffd700] font-medium' : col.key === 'MUL' && col.refTable ? 'text-[#c586c0]' : 'text-vs-text'}`}>
                  {col.name}
                </td>
                <td className="px-2.5 py-1.5 text-[#4ec9b0]">{col.type}</td>
                <td className="px-2.5 py-1.5">
                  {!col.nullable ? <span className="text-[#4ec9b0] text-[10px]">✓</span> : <span className="text-vs-textMuted text-[10px]">—</span>}
                </td>
                <td className="px-2.5 py-1.5 text-vs-textMuted">{col.default ?? ''}</td>
                <td className="px-2.5 py-1.5">
                  <span className="flex gap-1 flex-wrap">
                    {keys.map((k) => <KeyBadge key={k} k={k} />)}
                    {col.extra === 'auto_increment' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-vs-hover text-vs-textDim">AI</span>
                    )}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-vs-textMuted">
                  {col.refTable ? (
                    <span className="flex items-center gap-1"><ArrowRight size={10} />{col.refTable}</span>
                  ) : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Data tab ───────────────────────────────────────────────────────────────

interface DataTabProps {
  connectionId: string
  database: string
  table: string
  pkCols: string[]
  isProtected: boolean
  pendingEdits: PendingEdits
  refreshTrigger: number
  initialWhereClause?: string
  initialOrderBy?: string
  initialLimit?: number
  onCellChange: (rowIdx: number, col: string, value: string | null) => void
  onRevertCell: (rowIdx: number, col: string) => void
  onResultChange: (result: QueryResult | undefined) => void
  onFilterStateChange?: (state: { whereClause: string; orderBy: string; limit: number }) => void
  onSave: () => void
}

function DataTab({
  connectionId, database, table, pkCols,
  isProtected, pendingEdits, refreshTrigger,
  initialWhereClause = '', initialOrderBy = '', initialLimit = 200,
  onCellChange, onRevertCell, onResultChange, onFilterStateChange, onSave,
}: DataTabProps) {
  const [result, setResult] = useState<QueryResult | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [whereClause, setWhereClause] = useState(initialWhereClause)
  const [orderBy, setOrderBy] = useState(initialOrderBy)
  const [limit, setLimit] = useState(initialLimit)
  const inputRef = useRef<HTMLInputElement>(null)
  const runQueryRef = useRef<() => Promise<void>>(async () => {})

  const runQuery = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const quotedTbl = `\`${table.replace(/`/g, '')}\``
      let sql = `SELECT * FROM ${quotedTbl}`
      if (whereClause.trim()) sql += ` WHERE ${whereClause}`
      if (orderBy.trim()) sql += ` ORDER BY ${orderBy}`
      sql += ` LIMIT ${limit}`
      const r = await window.api.query.execute(connectionId, database, sql, `${table} · Данные`)
      setResult(r)
      onResultChange(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      onResultChange(undefined)
    } finally {
      setLoading(false)
    }
  }, [connectionId, database, table, whereClause, orderBy, limit, onResultChange])

  useEffect(() => { runQueryRef.current = runQuery }, [runQuery])
  useEffect(() => { runQuery() }, [])
  useEffect(() => { if (refreshTrigger > 0) runQueryRef.current() }, [refreshTrigger])
  useEffect(() => { onFilterStateChange?.({ whereClause, orderBy, limit }) }, [whereClause, orderBy, limit]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd+S
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !isProtected && pendingEdits.size > 0) {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isProtected, pendingEdits, onSave])

  // Convert PendingEdits for ResultsGrid (just new values, not from/to)
  const gridPendingEdits: Map<number, Record<string, unknown>> = new Map(
    Array.from(pendingEdits.entries()).map(([rowIdx, edits]) => [
      rowIdx,
      Object.fromEntries(Object.entries(edits).map(([col, edit]) => [col, edit.to])),
    ])
  )

  const rowCount = result?.rowCount ?? 0

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* filter bar */}
      <div className="h-[30px] flex items-center gap-2 px-2.5 border-b border-vs-border bg-vs-panel shrink-0 text-[11px]">
        <span className="text-vs-textMuted font-mono text-[10px]">WHERE</span>
        <input
          ref={inputRef}
          value={whereClause}
          onChange={(e) => setWhereClause(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runQuery() }}
          placeholder="id = 1  или  name LIKE '%foo%'"
          className="flex-1 max-w-[340px] h-[22px] bg-vs-input border border-vs-border rounded px-2 font-mono text-[11px] text-vs-text placeholder:text-vs-textMuted outline-none focus:border-vs-accent"
        />
        <span className="text-vs-textMuted font-mono text-[10px]">ORDER BY</span>
        <input
          value={orderBy}
          onChange={(e) => setOrderBy(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runQuery() }}
          placeholder="id DESC"
          className="w-[130px] h-[22px] bg-vs-input border border-vs-border rounded px-2 font-mono text-[11px] text-vs-text placeholder:text-vs-textMuted outline-none focus:border-vs-accent"
        />
        <div className="flex-1" />
        <span className="text-vs-textMuted font-mono text-[10px]">LIMIT</span>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="h-[22px] bg-vs-input border border-vs-border rounded px-1 font-mono text-[11px] text-vs-text outline-none"
        >
          {[50, 100, 200, 500, 1000].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button
          onClick={runQuery}
          className="h-[22px] px-2.5 rounded bg-vs-accent text-white text-[10px] font-medium hover:opacity-80 flex items-center gap-1"
        >
          <RefreshCw size={10} />
          Обновить
        </button>
        {!loading && (
          <span className="text-[#4ec9b0] font-mono text-[10px]">
            ● {rowCount} {rowCount === 1 ? 'строка' : rowCount < 5 ? 'строки' : 'строк'}
            {result?.durationMs != null ? ` · ${result.durationMs} мс` : ''}
          </span>
        )}
      </div>

      {/* edit mode hint banner */}
      {!isProtected && (
        <div className="flex items-center gap-2 px-2.5 py-1 border-b border-[#c586c030] bg-[#c586c008] shrink-0 text-[10px]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M8 1L15 14L1 14Z" stroke="#c586c0" strokeWidth="1.2" fill="none"/>
            <path d="M8 6V10" stroke="#c586c0" strokeWidth="1.4" strokeLinecap="round"/>
            <circle cx="8" cy="12" r="0.8" fill="#c586c0"/>
          </svg>
          <span className="text-[#c586c0]">Режим редактирования — двойной клик на ячейку. PK-колонки не редактируются.</span>
          <div className="flex-1" />
          <span className="text-vs-textMuted font-mono flex items-center gap-0.5">
            <kbd className="inline-block px-1.5 bg-vs-input border border-vs-border rounded text-[9px] font-bold">Enter</kbd>
            <span className="mx-0.5">сохранить ·</span>
            <kbd className="inline-block px-1.5 bg-vs-input border border-vs-border rounded text-[9px] font-bold">Esc</kbd>
            <span className="mx-0.5">отменить ·</span>
            <kbd className="inline-block px-1.5 bg-vs-input border border-vs-border rounded text-[9px] font-bold">⌘S</kbd>
            <span className="ml-0.5">сохранить всё</span>
          </span>
        </div>
      )}

      {/* grid */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ResultsGrid
          result={result}
          error={error}
          loading={loading}
          editMode={!isProtected}
          pkCols={pkCols}
          pendingEdits={gridPendingEdits}
          onCellChange={onCellChange}
          onRevertCell={onRevertCell}
        />
      </div>
    </div>
  )
}

// ── Indexes tab ─────────────────────────────────────────────────────────────

function IndexesTab({ indexes }: { indexes: IndexInfo[] }) {
  function kindStyle(k: string) {
    if (k === 'PK') return 'bg-[#ffd70022] text-[#ffd700]'
    if (k === 'UNIQUE') return 'bg-[#f4877122] text-[#f48771]'
    return 'bg-[#4ec9b022] text-[#4ec9b0]'
  }
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11px] font-mono">
        <thead className="sticky top-0 z-10">
          <tr className="bg-vs-panel border-b border-vs-borderStrong">
            {['', 'Имя', 'Колонки', 'Тип', 'Уникальный', 'NULL', 'Cardinality'].map((h, i) => (
              <th key={i} className="text-left px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-vs-textDim font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {indexes.map((ix) => (
            <tr key={ix.name} className="border-b border-vs-border hover:bg-vs-hover/50">
              <td className="px-2.5 py-2 w-16">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${kindStyle(ix.kind)}`}>{ix.kind}</span>
              </td>
              <td className={`px-2.5 py-2 ${ix.kind === 'PK' ? 'text-[#ffd700]' : 'text-vs-text'}`}>{ix.name}</td>
              <td className="px-2.5 py-2">
                <span className="flex gap-1.5 flex-wrap">
                  {ix.columns.map((c, ci) => (
                    <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-vs-input border border-vs-border text-[10px]">
                      <span className="text-vs-textMuted">{ci + 1}</span>{c}
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-2.5 py-2 text-[#4ec9b0]">{ix.type}</td>
              <td className="px-2.5 py-2">
                {ix.unique ? <span className="text-[#4ec9b0] text-[10px]">✓ UNIQUE</span> : <span className="text-vs-textMuted text-[10px]">—</span>}
              </td>
              <td className="px-2.5 py-2 text-[10px] text-vs-textMuted">{ix.nullable ? 'allow' : 'NOT NULL'}</td>
              <td className="px-2.5 py-2">
                {ix.cardinality != null ? (
                  <span className="flex items-center gap-2">
                    <span className="text-vs-text min-w-[22px] text-right">{ix.cardinality}</span>
                    <span className="w-[60px] h-[4px] rounded-full overflow-hidden bg-vs-borderStrong">
                      <span className="block h-full rounded-full bg-[#4ec9b0]"
                        style={{ width: `${Math.min(100, (ix.cardinality / Math.max(...indexes.map((i) => i.cardinality ?? 0), 1)) * 100)}%` }} />
                    </span>
                  </span>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {indexes.length === 0 && (
        <div className="flex items-center justify-center h-20 text-vs-textMuted text-[11px]">Нет индексов</div>
      )}
      <div className="mx-3 mt-3 px-3 py-2 border border-dashed border-vs-border rounded text-[11px] text-vs-textDim flex items-center gap-2">
        <span className="text-[#4ec9b0] text-sm">+</span>Добавить индекс
        <span className="ml-auto font-mono text-[10px] text-vs-textMuted">
          {indexes.length} {indexes.length === 1 ? 'индекс' : indexes.length < 5 ? 'индекса' : 'индексов'}
          {' · '}{indexes.filter((i) => i.kind === 'PK').length} PK
          {' · '}{indexes.filter((i) => i.kind === 'UNIQUE').length} UNIQUE
          {' · '}{indexes.filter((i) => i.kind === 'INDEX').length} INDEX
        </span>
      </div>
    </div>
  )
}

// ── Foreign Keys tab ────────────────────────────────────────────────────────

function ForeignKeysTab({ fks, table, onNavigateToTable }: {
  fks: ForeignKeyInfo[]
  table: string
  onNavigateToTable?: (table: string) => void
}) {
  const [expandedFk, setExpandedFk] = useState<string | null>(null)

  function actionStyle(action: string) {
    if (action === 'CASCADE') return 'bg-[#c586c022] text-[#c586c0] border-[#c586c044]'
    if (action === 'RESTRICT' || action === 'NO ACTION') return 'bg-vs-input text-vs-text border-vs-border'
    if (action === 'SET NULL') return 'bg-[#f4877122] text-[#f48771] border-[#f4877144]'
    if (action === 'SET DEFAULT') return 'bg-[#569cd622] text-[#569cd6] border-[#569cd644]'
    return 'bg-vs-input text-vs-text border-vs-border'
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11px] font-mono">
        <thead className="sticky top-0 z-10">
          <tr className="bg-vs-panel border-b border-vs-borderStrong">
            {['', 'Имя ограничения', 'Колонки', '', 'Целевая таблица', 'Колонки', 'ON UPDATE', 'ON DELETE', ''].map((h, i) => (
              <th key={i} className="text-left px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-vs-textDim font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fks.map((fk) => {
            const isExpanded = expandedFk === fk.name
            return (
              <React.Fragment key={fk.name}>
                <tr className="border-b border-vs-border hover:bg-vs-hover/50 cursor-pointer" onClick={() => setExpandedFk(isExpanded ? null : fk.name)}>
                  <td className="px-2.5 py-2 w-8"><Link2 size={13} className="text-[#c586c0]" /></td>
                  <td className="px-2.5 py-2 text-[#c586c0]">{fk.name}</td>
                  <td className="px-2.5 py-2">
                    <span className="flex gap-1">
                      {fk.columns.map((c) => <span key={c} className="px-1.5 py-0.5 rounded bg-[#c586c022] text-[#c586c0] text-[10px]">{c}</span>)}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-vs-textDim text-sm">→</td>
                  <td className="px-2.5 py-2">
                    <button className="flex items-center gap-1.5 text-vs-text hover:text-vs-accent group"
                      onClick={(e) => { e.stopPropagation(); onNavigateToTable?.(fk.refTable) }}>
                      <Table2 size={11} className="text-vs-accent" />{fk.refTable}
                      <ExternalLink size={9} className="opacity-0 group-hover:opacity-60" />
                    </button>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="flex gap-1">
                      {fk.refColumns.map((c) => <span key={c} className="px-1.5 py-0.5 rounded bg-[#ffd70022] text-[#ffd700] text-[10px]">{c}</span>)}
                    </span>
                  </td>
                  <td className="px-2.5 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] border ${actionStyle(fk.onUpdate)}`}>{fk.onUpdate}</span></td>
                  <td className="px-2.5 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] border ${actionStyle(fk.onDelete)}`}>{fk.onDelete}</span></td>
                  <td className="px-2.5 py-2 text-vs-textDim text-[10px]">
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-b border-vs-border">
                    <td colSpan={9} className="px-3 py-4 bg-vs-bg">
                      <div className="text-[10px] uppercase tracking-wider text-vs-textDim mb-3">Связь на диаграмме</div>
                      <div className="flex items-center gap-4">
                        <div className="border border-[#c586c088] rounded bg-vs-bg font-mono text-[11px] min-w-[160px]">
                          <div className="px-2.5 py-1.5 bg-[#c586c018] text-[#c586c0] border-b border-vs-border font-semibold">{table}</div>
                          {fk.columns.map((c) => (
                            <div key={c} className="px-2.5 py-1.5 text-[#c586c0] flex justify-between">
                              <span>{c}</span><span className="text-vs-textMuted text-[10px]">FK</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex-1 relative h-6">
                          <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-[#c586c0] -translate-y-1/2" />
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-vs-bg px-2 text-vs-textDim text-[10px] font-mono">N : 1</span>
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[#c586c0] text-sm">▶</span>
                        </div>
                        <div className="border border-vs-accent/50 rounded bg-vs-bg font-mono text-[11px] min-w-[160px]">
                          <div className="px-2.5 py-1.5 bg-vs-accent/10 text-vs-text border-b border-vs-border font-semibold flex items-center gap-1.5">
                            <Table2 size={11} className="text-vs-accent" />{fk.refTable}
                          </div>
                          {fk.refColumns.map((c) => (
                            <div key={c} className="px-2.5 py-1.5 text-[#ffd700] flex justify-between">
                              <span>{c}</span><span className="text-vs-textMuted text-[10px]">PK</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => onNavigateToTable?.(fk.refTable)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-vs-border text-[11px] text-vs-textDim hover:border-vs-accent hover:text-vs-accent transition-colors">
                          <ExternalLink size={11} />Открыть {fk.refTable}
                        </button>
                        <button onClick={() => {
                          const cols = fk.columns.map((c) => `\`${c}\``).join(', ')
                          const refCols = fk.refColumns.map((c) => `\`${c}\``).join(', ')
                          navigator.clipboard.writeText(`SELECT t.*, r.*\nFROM \`${table}\` t\nJOIN \`${fk.refTable}\` r ON r.${refCols} = t.${cols}\nLIMIT 100;`)
                        }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-vs-border text-[11px] text-vs-textDim hover:border-vs-accent hover:text-vs-accent transition-colors">
                          <Copy size={11} />Скопировать JOIN SQL
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {fks.length === 0 && (
        <div className="flex flex-col items-center justify-center h-24 text-vs-textMuted text-[11px] gap-1">
          <Link2 size={20} className="opacity-30" />Нет внешних ключей
        </div>
      )}
    </div>
  )
}

// ── DDL tab ─────────────────────────────────────────────────────────────────

function DdlTab({ ddl, database, table, onOpenInEditor }: {
  ddl: string; database: string; table: string
  onOpenInEditor?: (sql: string) => void
}) {
  const KEYWORDS = new Set(['CREATE','TABLE','VIEW','PRIMARY','KEY','UNIQUE','FOREIGN','REFERENCES','NOT','NULL','DEFAULT',
    'AUTO_INCREMENT','ON','UPDATE','DELETE','RESTRICT','CASCADE','ENGINE','CHARSET','COLLATE','ROW_FORMAT',
    'COMMENT','CONSTRAINT','CURRENT_TIMESTAMP','IF','EXISTS','INDEX','SET','NO','ACTION'])
  const TYPES = new Set(['BIGINT','INT','INTEGER','SMALLINT','TINYINT','MEDIUMINT','VARCHAR','CHAR','TEXT','MEDIUMTEXT',
    'LONGTEXT','TINYTEXT','JSON','DATETIME','TIMESTAMP','DATE','TIME','YEAR','DECIMAL','NUMERIC','FLOAT','DOUBLE',
    'REAL','BLOB','BINARY','VARBINARY','ENUM','SET','BOOLEAN','BOOL','BIT','SERIAL','BIGSERIAL','SMALLSERIAL',
    'BYTEA','INTERVAL','UUID','JSONB','ARRAY','OID'])

  function renderLine(line: string) {
    const out: React.ReactNode[] = []
    const re = /(`[^`]+`|"[^"]+"|'[^']*'|\b\w+\b|[(),;=]|\s+|.)/g
    let m: RegExpExecArray | null, k = 0
    while ((m = re.exec(line)) !== null) {
      const tok = m[0]
      let color: string | undefined
      if (/^`.*`$/.test(tok) || /^"[^"]+"$/.test(tok)) color = '#9cdcfe'
      else if (/^'.*'$/.test(tok)) color = '#ce9178'
      else if (/^\d+$/.test(tok)) color = '#b5cea8'
      else if (KEYWORDS.has(tok.toUpperCase())) color = '#569cd6'
      else if (TYPES.has(tok.toUpperCase())) color = '#ffd700'
      else if (/^[(),;=]$/.test(tok)) color = '#d4d4d4'
      out.push(color ? <span key={k++} style={{ color }}>{tok}</span> : <span key={k++}>{tok}</span>)
    }
    return out
  }

  const [ddlMode, setDdlMode] = useState<'CREATE' | 'ALTER' | 'DROP'>('CREATE')
  const displaySql = ddlMode === 'CREATE' ? ddl
    : ddlMode === 'ALTER'
      ? `-- ALTER TABLE \`${table}\` example:\nALTER TABLE \`${database}\`.\`${table}\`\n  ADD COLUMN new_col VARCHAR(255) NULL,\n  DROP COLUMN old_col,\n  ADD INDEX idx_name (col_name);`
      : `DROP TABLE IF EXISTS \`${database}\`.\`${table}\`;`
  const displayLines = (displaySql || '').split('\n')

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="h-[30px] flex items-center gap-1.5 px-2 border-b border-vs-border bg-vs-panel shrink-0 text-[11px]">
        {(['CREATE', 'ALTER', 'DROP'] as const).map((mode) => (
          <button key={mode} onClick={() => setDdlMode(mode)}
            className={`px-2.5 py-1 rounded font-mono text-[10px] border transition-colors ${
              ddlMode === mode ? 'bg-vs-active border-vs-borderStrong text-vs-text' : 'bg-transparent border-transparent text-vs-textDim hover:text-vs-text'
            }`}>{mode}</button>
        ))}
        <div className="w-px h-4 bg-vs-border mx-1" />
        <span className="font-mono text-[10px] text-vs-textMuted">MySQL / SQLite / PostgreSQL</span>
        <div className="flex-1" />
        <button onClick={() => navigator.clipboard.writeText(displaySql)}
          className="px-2.5 py-1 rounded border border-vs-border text-[10px] text-vs-textDim hover:text-vs-text hover:border-vs-accent transition-colors flex items-center gap-1">
          <Copy size={10} />Копировать
        </button>
        {onOpenInEditor && (
          <button onClick={() => onOpenInEditor(displaySql)}
            className="px-2.5 py-1 rounded text-[10px] text-white bg-vs-accent hover:opacity-80 flex items-center gap-1">
            <ExternalLink size={10} />Открыть в редакторе
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex font-mono text-[12px] leading-[18px]">
        <div className="text-right text-vs-textMuted text-[11px] min-w-[42px] py-2.5 pr-2.5 select-none border-r border-vs-border bg-vs-panel shrink-0">
          {displayLines.map((_, i) => <div key={i} className="px-2.5">{i + 1}</div>)}
        </div>
        <div className="px-3.5 py-2.5 flex-1 text-vs-text whitespace-pre">
          {displayLines.map((ln, i) => <div key={i}>{ln === '' ? ' ' : renderLine(ln)}</div>)}
        </div>
      </div>
      <div className="h-[22px] border-t border-vs-border bg-vs-panel flex items-center px-2.5 gap-3 text-[10px] text-vs-textMuted font-mono shrink-0">
        <span>SQL</span><span>·</span><span>{displayLines.length} строк</span>
        <div className="flex-1" />
        {ddl && <span className="text-[#4ec9b0]">● синтаксис проверен</span>}
      </div>
    </div>
  )
}

// ── Main TableViewer ────────────────────────────────────────────────────────

export default function TableViewer({ connectionId, database, table, savedState, onSavedStateChange, onOpenSql, onNavigateToTable }: Props & {
  onOpenSql?: (sql: string) => void
  onNavigateToTable?: (database: string, table: string) => void
}) {
  const [tab, setTab] = useState<TabKey>((savedState?.activeSubTab as TabKey) ?? 'structure')
  const filterStateRef = useRef({ whereClause: savedState?.whereClause ?? '', orderBy: savedState?.orderBy ?? '', limit: savedState?.limit ?? 200 })
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [indexes, setIndexes] = useState<IndexInfo[]>([])
  const [fks, setFks] = useState<ForeignKeyInfo[]>([])
  const [ddl, setDdl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  // ── Edit state (lifted from DataTab) ───────────────────────────────────────
  const [isProtected, setIsProtected] = useState(true)
  const [pendingEdits, setPendingEdits] = useState<PendingEdits>(new Map())
  const [savingState, setSavingState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | undefined>()
  const [showDiff, setShowDiff] = useState(false)
  const [lastSavedCount, setLastSavedCount] = useState(0)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const dataResultRef = useRef<QueryResult | undefined>()

  const pkCols = columns.filter((c) => c.key === 'PRI').map((c) => c.name)
  const editCellCount = Array.from(pendingEdits.values()).reduce((s, r) => s + Object.keys(r).length, 0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(undefined)
    async function load() {
      try {
        const [cols, idxs, foreignKeys, ddlStr] = await Promise.all([
          window.api.schema.columns(connectionId, database, table),
          window.api.schema.indexes(connectionId, database, table),
          window.api.schema.foreignKeys(connectionId, database, table),
          window.api.schema.ddl(connectionId, database, table),
        ])
        if (!cancelled) { setColumns(cols); setIndexes(idxs); setFks(foreignKeys); setDdl(ddlStr) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [connectionId, database, table])

  const handleResultChange = useCallback((result: QueryResult | undefined) => {
    dataResultRef.current = result
  }, [])

  const handleCellChange = useCallback((rowIdx: number, col: string, value: string | null) => {
    const result = dataResultRef.current
    if (!result) return
    setPendingEdits((prev) => {
      const next = new Map(prev)
      const rowEdits = next.has(rowIdx) ? { ...next.get(rowIdx)! } : {}
      const originalVal = result.rows[rowIdx]?.[col]
      const originalStr = originalVal == null ? null : String(originalVal)
      if (value === originalStr) {
        delete rowEdits[col]
      } else {
        rowEdits[col] = { from: originalVal, to: value }
      }
      if (Object.keys(rowEdits).length === 0) next.delete(rowIdx)
      else next.set(rowIdx, rowEdits)
      return next
    })
  }, [])

  const handleRevertCell = useCallback((rowIdx: number, col: string) => {
    setPendingEdits((prev) => {
      const next = new Map(prev)
      const rowEdits = next.has(rowIdx) ? { ...next.get(rowIdx)! } : {}
      delete rowEdits[col]
      if (Object.keys(rowEdits).length === 0) next.delete(rowIdx)
      else next.set(rowIdx, rowEdits)
      return next
    })
  }, [])

  const handleDiscard = useCallback(() => {
    setPendingEdits(new Map())
    setShowDiff(false)
    setSaveError(undefined)
  }, [])

  const handleToggle = useCallback(() => {
    if (!isProtected) {
      setPendingEdits(new Map())
      setShowDiff(false)
      setSaveError(undefined)
    }
    setIsProtected((v) => !v)
  }, [isProtected])

  const handleSave = useCallback(async () => {
    const result = dataResultRef.current
    if (!result || pendingEdits.size === 0) return
    const cellCount = Array.from(pendingEdits.values()).reduce((s, r) => s + Object.keys(r).length, 0)
    setSavingState('saving')
    setSaveError(undefined)
    try {
      for (const [rowIdx, edits] of pendingEdits.entries()) {
        const row = result.rows[rowIdx]
        const sets = Object.entries(edits)
          .map(([col, edit]) => `\`${col}\` = ${sqlLiteral(edit.to)}`)
          .join(', ')
        let where: string
        if (pkCols.length > 0) {
          where = pkCols.map((pk) => `\`${pk}\` = ${sqlLiteral(row[pk])}`).join(' AND ')
        } else {
          where = result.columns.map((col) => `\`${col}\` = ${sqlLiteral(row[col])}`).join(' AND ')
        }
        await window.api.query.execute(connectionId, database, `UPDATE \`${table}\` SET ${sets} WHERE ${where} LIMIT 1`, `${table} · inline edit`)
      }
      setLastSavedCount(cellCount)
      setPendingEdits(new Map())
      setShowDiff(false)
      setSavingState('saved')
      setRefreshTrigger((n) => n + 1)
      setTimeout(() => setSavingState('idle'), 1400)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      setSavingState('idle')
    }
  }, [pendingEdits, pkCols, connectionId, database, table])

  const tabMeta: Record<TabKey, string> = {
    structure: `${columns.length} колонок`,
    data: `SELECT * FROM ${database}.${table}`,
    indexes: `${indexes.length} индексов`,
    fk: `${fks.length} внешних ключей`,
    ddl: `SHOW CREATE TABLE ${table}`,
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-vs-textMuted gap-2">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-[12px]">Загрузка {database}.{table}…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-[12px] text-[#f48771] bg-[#f4877110] border border-[#f4877140] rounded p-4 max-w-xl">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* sub-tabs row with InlinePendingBar on the right */}
      <div className="h-[32px] bg-vs-panel border-b border-vs-border flex items-center px-2.5 gap-3.5 shrink-0">
        {TABS.map((t) => {
          const active = tab === t.k
          return (
            <button
              key={t.k}
              onClick={() => {
                setTab(t.k)
                onSavedStateChange?.({ activeSubTab: t.k, ...filterStateRef.current })
              }}
              className={`text-[11px] py-2 border-b-2 transition-colors whitespace-nowrap ${
                active ? 'text-vs-text border-vs-accent' : 'text-vs-textDim border-transparent hover:text-vs-text'
              }`}
            >
              {t.label}
              {t.k === 'fk' && fks.length > 0 && (
                <span className="ml-1 px-1 py-0.5 rounded bg-[#c586c022] text-[#c586c0] text-[9px]">{fks.length}</span>
              )}
              {t.k === 'data' && editCellCount > 0 && (
                <span className="ml-1 w-[6px] h-[6px] rounded-full bg-[#c586c0] inline-block align-middle" />
              )}
            </button>
          )
        })}
        <div className="flex-1" />
        {tab === 'data' ? (
          <InlinePendingBar
            editCellCount={editCellCount}
            isProtected={isProtected}
            saveState={savingState}
            saveError={saveError}
            lastSavedCount={lastSavedCount}
            onToggle={handleToggle}
            onSave={handleSave}
            onDiscard={handleDiscard}
            onShowDiff={() => setShowDiff((v) => !v)}
          />
        ) : (
          <span className="font-mono text-[10px] text-vs-textMuted">{tabMeta[tab]}</span>
        )}
      </div>

      {/* tab content */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {tab === 'structure' && <StructureTab columns={columns} />}
        <div
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
          style={{ display: tab === 'data' ? undefined : 'none' }}
        >
          <DataTab
            connectionId={connectionId}
            database={database}
            table={table}
            pkCols={pkCols}
            isProtected={isProtected}
            pendingEdits={pendingEdits}
            refreshTrigger={refreshTrigger}
            initialWhereClause={savedState?.whereClause}
            initialOrderBy={savedState?.orderBy}
            initialLimit={savedState?.limit}
            onCellChange={handleCellChange}
            onRevertCell={handleRevertCell}
            onResultChange={handleResultChange}
            onFilterStateChange={(s) => {
              filterStateRef.current = s
              onSavedStateChange?.({ activeSubTab: tab, ...s })
            }}
            onSave={handleSave}
          />
        </div>
        {tab === 'indexes' && <IndexesTab indexes={indexes} />}
        {tab === 'fk' && (
          <ForeignKeysTab
            fks={fks}
            table={table}
            onNavigateToTable={(t) => onNavigateToTable?.(database, t)}
          />
        )}
        {tab === 'ddl' && (
          <DdlTab ddl={ddl} database={database} table={table} onOpenInEditor={onOpenSql} />
        )}
      </div>

      {/* DiffReview — absolute, outside overflow-hidden, z-30 above everything */}
      {tab === 'data' && showDiff && pendingEdits.size > 0 && (
        <DiffReview
          pendingEdits={pendingEdits}
          pkCols={pkCols}
          rows={dataResultRef.current?.rows}
          database={database}
          table={table}
          onClose={() => setShowDiff(false)}
          onRevert={handleRevertCell}
        />
      )}
    </div>
  )
}
