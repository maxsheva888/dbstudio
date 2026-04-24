import React, { useState, useEffect } from 'react'
import { X, Copy, Check } from 'lucide-react'
import type { QueryResult } from '@shared/types'

interface Props {
  result?: QueryResult
  error?: string
  loading?: boolean
  editMode?: boolean
  pkCols?: string[]
  pendingEdits?: Map<number, Record<string, unknown>>
  onCellChange?: (rowIdx: number, col: string, value: string | null) => void
}

// ─── type helpers ──────────────────────────────────────────────────────────

type ValType = 'null' | 'boolean' | 'number' | 'date' | 'string' | 'json'

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${date} ${time}`
}

function detectType(val: unknown): ValType {
  if (val === null || val === undefined) return 'null'
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'number') return 'number'
  if (val instanceof Date) return 'date'
  if (typeof val === 'object') return 'json'
  if (typeof val === 'string') {
    const t = val.trim()
    if (t[0] === '{' || t[0] === '[') {
      try { JSON.parse(t); return 'json' } catch {}
    }
  }
  return 'string'
}

function toJson(val: unknown): unknown {
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'object') return val
  if (typeof val === 'string') { try { return JSON.parse(val) } catch {} }
  return val
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── JSON raw viewer ───────────────────────────────────────────────────────

function JsonRaw({ value }: { value: unknown }) {
  const raw = escHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  const html = raw.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      if (m[0] === '"') {
        return m.endsWith(':')
          ? `<span style="color:#9cdcfe">${m}</span>`
          : `<span style="color:#ce9178">${m}</span>`
      }
      if (m === 'true' || m === 'false') return `<span style="color:#569cd6">${m}</span>`
      if (m === 'null')                  return `<span style="color:#858585">${m}</span>`
      return `<span style="color:#b5cea8">${m}</span>`
    }
  )
  return (
    <pre
      className="text-xs font-mono p-0 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ─── JSON tree viewer ──────────────────────────────────────────────────────

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2)

  if (value === null)             return <span style={{ color: '#858585' }}>null</span>
  if (typeof value === 'boolean') return <span style={{ color: '#569cd6' }}>{String(value)}</span>
  if (typeof value === 'number')  return <span style={{ color: '#b5cea8' }}>{String(value)}</span>
  if (typeof value === 'string')  return <span style={{ color: '#ce9178' }}>"{value}"</span>

  const isArr = Array.isArray(value)
  const entries: [string, unknown][] = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>)
  const [ob, cb] = isArr ? ['[', ']'] : ['{', '}']

  if (entries.length === 0) return <span className="text-vs-textDim">{ob}{cb}</span>

  return (
    <span>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="text-vs-textDim hover:text-vs-text w-3 inline-block text-left select-none"
      >
        {open ? '▾' : '▸'}
      </button>
      <span className="text-vs-textDim">{ob}</span>
      {open ? (
        <div style={{ paddingLeft: 14 }}>
          {entries.map(([k, v], i) => (
            <div key={k} className="flex gap-1 items-start flex-wrap">
              {isArr
                ? <span className="text-vs-textDim">{k}:{' '}</span>
                : <span><span style={{ color: '#9cdcfe' }}>"{k}"</span><span className="text-vs-textDim">: </span></span>
              }
              <JsonNode value={v} depth={depth + 1} />
              {i < entries.length - 1 && <span className="text-vs-textDim">,</span>}
            </div>
          ))}
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          className="text-vs-textDim text-[10px] px-1 hover:text-vs-text"
        >
          {entries.length} {isArr ? 'items' : 'keys'} …
        </button>
      )}
      <span className="text-vs-textDim">{cb}</span>
    </span>
  )
}

// ─── Cell detail modal ─────────────────────────────────────────────────────

interface CellInfo { column: string; value: unknown }

function CellModal({ cell, onClose }: { cell: CellInfo; onClose: () => void }) {
  const type = detectType(cell.value)
  const isJson = type === 'json'
  const [mode, setMode] = useState<'tree' | 'raw'>('tree')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function copyValue() {
    let text: string
    if (cell.value == null) text = 'NULL'
    else if (cell.value instanceof Date) text = formatDate(cell.value)
    else if (typeof cell.value === 'object') text = JSON.stringify(cell.value, null, 2)
    else text = String(cell.value)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const typeColor: Record<ValType, string> = {
    null: '#858585', boolean: '#569cd6', number: '#b5cea8', date: '#c586c0', string: '#ce9178', json: '#4ec9b0'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex flex-col bg-vs-sidebar border border-vs-border rounded shadow-2xl w-[680px] max-w-[90vw] max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-vs-border shrink-0">
          <span className="font-mono text-sm text-[#9cdcfe] truncate flex-1">{cell.column}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border"
            style={{ color: typeColor[type], borderColor: typeColor[type] + '50' }}
          >
            {type}
          </span>
          <button
            onClick={copyValue}
            title="Скопировать значение"
            className="flex items-center gap-1 text-vs-textDim hover:text-vs-text transition-colors"
          >
            {copied ? <Check size={13} className="text-[#4ec9b0]" /> : <Copy size={13} />}
          </button>
          {isJson && (
            <div className="flex rounded border border-vs-border overflow-hidden text-xs">
              <button
                onClick={() => setMode('tree')}
                className={`px-2 py-0.5 transition-colors ${mode === 'tree' ? 'bg-vs-selected text-white' : 'text-vs-textDim hover:text-vs-text'}`}
              >
                ⊞ tree
              </button>
              <button
                onClick={() => setMode('raw')}
                className={`px-2 py-0.5 transition-colors ${mode === 'raw' ? 'bg-vs-selected text-white' : 'text-vs-textDim hover:text-vs-text'}`}
              >
                {'{ }'} raw
              </button>
            </div>
          )}
          <button onClick={onClose} className="text-vs-textDim hover:text-vs-text transition-colors ml-1">
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 selectable">
          {type === 'null' && (
            <span className="text-vs-textDim italic text-sm">NULL</span>
          )}
          {type === 'boolean' && (
            <span className="font-mono text-sm" style={{ color: '#569cd6' }}>{String(cell.value)}</span>
          )}
          {type === 'number' && (
            <span className="font-mono text-sm" style={{ color: '#b5cea8' }}>{String(cell.value)}</span>
          )}
          {type === 'date' && (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-sm" style={{ color: '#c586c0' }}>{formatDate(cell.value as Date)}</span>
              <span className="text-xs text-vs-textDim">{(cell.value as Date).toISOString()}</span>
            </div>
          )}
          {type === 'string' && (
            <pre className="font-mono text-xs whitespace-pre-wrap break-all" style={{ color: '#ce9178' }}>
              {String(cell.value)}
            </pre>
          )}
          {isJson && mode === 'raw' && (
            <JsonRaw value={toJson(cell.value)} />
          )}
          {isJson && mode === 'tree' && (
            <div className="font-mono text-xs">
              <JsonNode value={toJson(cell.value)} depth={0} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── JSON edit modal ──────────────────────────────────────────────────────

function JsonEditModal({
  column, initialValue, onSave, onClose
}: {
  column: string
  initialValue: unknown
  onSave: (value: string | null) => void
  onClose: () => void
}) {
  function toText(v: unknown): string {
    if (v == null) return ''
    if (typeof v === 'string') { try { return JSON.stringify(JSON.parse(v), null, 2) } catch { return v } }
    return JSON.stringify(v, null, 2)
  }

  const [text, setText] = useState(() => toText(initialValue))
  const [jsonError, setJsonError] = useState<string | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    const trimmed = text.trim()
    if (trimmed === '') { onSave(null); return }
    try { JSON.parse(trimmed) } catch { setJsonError('Невалидный JSON'); return }
    onSave(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex flex-col bg-vs-sidebar border border-vs-border rounded shadow-2xl w-[680px] max-w-[90vw]" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-vs-border shrink-0">
          <span className="font-mono text-sm text-[#9cdcfe] truncate flex-1">{column}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border text-[#4ec9b0] border-[#4ec9b0]/50">json</span>
          <button onClick={onClose} className="text-vs-textDim hover:text-vs-text transition-colors ml-1">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-3 min-h-0">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setJsonError(null) }}
            className="w-full bg-vs-editor font-mono text-xs text-vs-text border border-vs-border rounded p-2 outline-none focus:border-vs-statusBar resize-none"
            style={{ height: '300px' }}
            spellCheck={false}
          />
          {jsonError && <p className="text-xs text-[#f48771] mt-1">{jsonError}</p>}
        </div>
        <div className="flex gap-2 justify-end px-4 py-3 border-t border-vs-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-sm bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline edit cell ─────────────────────────────────────────────────────

function InlineEditCell({
  column, originalVal, pendingVal, isPk,
  onCommit
}: {
  column: string
  originalVal: unknown
  pendingVal: unknown
  isPk: boolean
  onCommit: (value: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [jsonModal, setJsonModal] = useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const isDirty = pendingVal !== undefined
  const displayVal = isDirty ? pendingVal : originalVal
  const isJson = detectType(originalVal) === 'json'

  const displayStr = displayVal == null
    ? null
    : displayVal instanceof Date ? formatDate(displayVal)
    : typeof displayVal === 'object' ? JSON.stringify(displayVal)
    : String(displayVal)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (isPk) {
    return (
      <span className="text-vs-textDim opacity-70 select-none truncate block w-full" title="Первичный ключ — не редактируется">
        {displayStr ?? <em className="italic">NULL</em>}
      </span>
    )
  }

  if (isJson) {
    return (
      <>
        <span
          onDoubleClick={() => setJsonModal(true)}
          className={`block w-full truncate cursor-pointer ${isDirty ? 'text-[#e6db74]' : ''}`}
          title={isDirty ? `Изменено (двойной клик — редактировать)` : 'Двойной клик — редактировать JSON'}
        >
          {displayStr == null
            ? <span className="text-vs-textDim italic">NULL</span>
            : displayStr}
        </span>
        {jsonModal && (
          <JsonEditModal
            column={column}
            initialValue={isDirty ? pendingVal : originalVal}
            onSave={(v) => { onCommit(v); setJsonModal(false) }}
            onClose={() => setJsonModal(false)}
          />
        )}
      </>
    )
  }

  if (!editing) {
    return (
      <span
        onDoubleClick={() => setEditing(true)}
        className={`block w-full truncate cursor-text ${isDirty ? 'text-[#e6db74]' : ''}`}
        title={isDirty ? `Изменено: ${displayStr ?? 'NULL'}` : (displayStr ?? 'NULL')}
      >
        {displayStr == null
          ? <span className="text-vs-textDim italic">NULL</span>
          : displayStr}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      defaultValue={displayStr ?? ''}
      onBlur={(e) => { onCommit(e.target.value === '' ? null : e.target.value); setEditing(false) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onCommit(e.currentTarget.value === '' ? null : e.currentTarget.value); setEditing(false) }
        if (e.key === 'Escape') setEditing(false)
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full min-w-[80px] bg-vs-input border border-vs-statusBar outline-none px-1 text-vs-text font-mono text-xs"
    />
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function ResultsGrid({ result, error, loading, editMode, pkCols = [], pendingEdits, onCellChange }: Props) {
  const [activeCell, setActiveCell] = useState<CellInfo | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-vs-textDim text-sm gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-vs-statusBar border-t-transparent rounded-full" />
        Выполняется запрос…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 overflow-auto h-full selectable">
        <div className="bg-[#3b1919] border border-[#6e2828] rounded p-3 text-sm text-[#f48771] font-mono whitespace-pre-wrap">
          {error}
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-vs-textDim text-sm">
        Выполните запрос чтобы увидеть результаты
      </div>
    )
  }

  const isDml = result.columns.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1 border-b border-vs-border text-xs text-vs-textDim shrink-0">
        {isDml ? (
          <span className="text-[#4ec9b0]">
            Затронуто строк: <strong className="text-[#9cdcfe]">{result.affectedRows ?? 0}</strong>
          </span>
        ) : (
          <span>
            Строк: <strong className="text-[#9cdcfe]">{result.rowCount}</strong>
            {result.rowCount === 2000 && (
              <span className="ml-1 text-[#ce9178]">(лимит 2000)</span>
            )}
          </span>
        )}
        <span>
          Время: <strong className="text-[#9cdcfe]">{result.durationMs} мс</strong>
        </span>
      </div>

      {isDml && (
        <div className="flex items-center justify-center flex-1 text-[#4ec9b0] text-sm">
          Запрос выполнен успешно
        </div>
      )}

      {!isDml && (
        <div className="flex-1 overflow-auto selectable">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-vs-panelHeader">
                <th className="w-10 px-2 py-1.5 text-right text-vs-textDim border-b border-r border-vs-border font-normal select-none">
                  #
                </th>
                {result.columns.map((col) => (
                  <th
                    key={col}
                    className="px-2 py-1.5 text-left text-[#9cdcfe] border-b border-r border-vs-border font-medium whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => {
                const rowEdits = pendingEdits?.get(i)
                const rowDirty = rowEdits && Object.keys(rowEdits).length > 0
                return (
                  <tr key={i} className={`border-b border-vs-border ${rowDirty ? 'bg-[#e6db74]/5' : 'hover:bg-vs-hover'}`}>
                    <td className="px-2 py-1 text-right text-vs-textDim border-r border-vs-border select-none">
                      {i + 1}
                    </td>
                    {result.columns.map((col) => {
                      const val = row[col]
                      const pendingVal = rowEdits?.[col]
                      const isPk = pkCols.includes(col)
                      const display = val == null
                        ? null
                        : val instanceof Date ? formatDate(val)
                        : typeof val === 'object' ? JSON.stringify(val) : String(val)

                      if (editMode) {
                        return (
                          <td
                            key={col}
                            className={`px-2 py-1 border-r border-vs-border max-w-xs overflow-hidden ${isPk ? 'cursor-default' : 'cursor-text'} ${pendingVal !== undefined ? 'bg-[#e6db74]/10' : ''}`}
                          >
                            <InlineEditCell
                              column={col}
                              originalVal={val}
                              pendingVal={pendingVal}
                              isPk={isPk}
                              onCommit={(v) => onCellChange?.(i, col, v)}
                            />
                          </td>
                        )
                      }

                      return (
                        <td
                          key={col}
                          onDoubleClick={() => setActiveCell({ column: col, value: val })}
                          className="px-2 py-1 text-vs-text border-r border-vs-border max-w-xs truncate cursor-default"
                          title={display ?? 'NULL'}
                        >
                          {display == null
                            ? <span className="text-vs-textDim italic">NULL</span>
                            : display
                          }
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeCell && (
        <CellModal cell={activeCell} onClose={() => setActiveCell(null)} />
      )}
    </div>
  )
}
