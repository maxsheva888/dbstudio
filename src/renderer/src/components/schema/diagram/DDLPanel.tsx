import React from 'react'
import type { CanvasTable } from './types'

const KW = /\b(CREATE|TABLE|ALTER|ADD|CONSTRAINT|FOREIGN KEY|REFERENCES|PRIMARY KEY|NOT NULL|UNIQUE)\b/g
const TYPE_RE = /\b(uuid|int|bigint|smallint|varchar|char|text|bool|boolean|timestamptz|timestamp|datetime|date|float|double|decimal|serial|integer|real|numeric|json|jsonb)\b/gi

function highlight(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let last = 0
  const combined = new RegExp(`${KW.source}|${TYPE_RE.source}`, 'gi')
  let m: RegExpExecArray | null
  let key = 0
  while ((m = combined.exec(line)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{line.slice(last, m.index)}</span>)
    const word = m[0].toUpperCase()
    const isKw = KW.test(word)
    KW.lastIndex = 0
    parts.push(
      <span key={key++} style={{ color: isKw ? '#569cd6' : '#4ec9b0' }}>{m[0]}</span>
    )
    last = m.index + m[0].length
  }
  if (last < line.length) parts.push(<span key={key++}>{line.slice(last)}</span>)
  return parts
}

function generateDDL(table: CanvasTable): string[] {
  const lines: string[] = [`CREATE TABLE ${table.name} (`]
  table.cols.forEach((c, i) => {
    let line = `  ${c.name.padEnd(22)} ${c.type}`
    if (c.nn) line += ' NOT NULL'
    if (c.uq && !c.pk) line += ' UNIQUE'
    if (i < table.cols.length - 1) line += ','
    lines.push(line)
  })
  const pks = table.cols.filter((c) => c.pk).map((c) => c.name)
  if (pks.length) {
    lines[lines.length - 1] += ','
    lines.push(`  PRIMARY KEY (${pks.join(', ')})`)
  }
  lines.push(');')
  table.cols.filter((c) => c.fk).forEach((c) => {
    const dot = c.fk!.lastIndexOf('.')
    const rt = c.fk!.slice(0, dot)
    const rc = c.fk!.slice(dot + 1)
    lines.push('')
    lines.push(`ALTER TABLE ${table.name}`)
    lines.push(`  ADD CONSTRAINT fk_${table.name}_${c.name}`)
    lines.push(`  FOREIGN KEY (${c.name}) REFERENCES ${rt}(${rc});`)
  })
  return lines
}

interface Props {
  table: CanvasTable | null
  onOpenInEditor?: (sql: string) => void
}

export default function DDLPanel({ table, onOpenInEditor }: Props) {
  if (!table) return null
  const lines = generateDDL(table)

  return (
    <div style={{
      height: 180, flexShrink: 0,
      borderTop: '1px solid #2d2d30',
      background: '#1a1a1a',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* tab bar */}
      <div style={{
        height: 28, flexShrink: 0,
        background: '#252526',
        borderBottom: '1px solid #2d2d30',
        display: 'flex', alignItems: 'center',
        padding: '0 10px', gap: 12, fontSize: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}>
        <span style={{
          color: '#ffffff', padding: '4px 0',
          borderBottom: '2px solid #007acc',
        }}>DDL</span>
        <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace' }}>
          {table.cols.filter((c) => c.fk).length > 0
            ? `${table.cols.filter((c) => c.fk).length} FK`
            : ''}
        </span>
        <div style={{ flex: 1 }}/>
        <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10 }}>{table.name}</span>
        {onOpenInEditor && (
          <button
            onClick={() => onOpenInEditor(lines.join('\n'))}
            style={{
              border: 'none', background: 'transparent',
              color: '#858585', cursor: 'pointer', fontSize: 10,
              fontFamily: 'inherit', padding: '0 4px',
            }}
            title="Открыть в редакторе"
          >
            ↗
          </button>
        )}
      </div>

      {/* code */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '8px 0',
        fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
        color: '#cccccc',
      }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', paddingRight: 16 }}>
            <span style={{
              minWidth: 32, textAlign: 'right', marginRight: 12,
              color: '#555', userSelect: 'none', flexShrink: 0,
            }}>
              {i + 1}
            </span>
            <span>{highlight(l)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
