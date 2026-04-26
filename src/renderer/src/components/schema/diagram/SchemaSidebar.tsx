import React, { useState } from 'react'
import type { CanvasTable } from './types'

interface Props {
  tables: CanvasTable[]
  selected: string | null
  onSelect: (name: string) => void
  hoveredTable: string | null
}

export default function SchemaSidebar({ tables, selected, onSelect, hoveredTable }: Props) {
  const [query, setQuery] = useState('')
  const filtered = query
    ? tables.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : tables

  return (
    <div style={{
      width: 210, flexShrink: 0,
      background: '#252526',
      borderRight: '1px solid #2d2d30',
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      color: '#cccccc',
    }}>
      {/* header */}
      <div style={{
        height: 32, padding: '0 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        textTransform: 'uppercase', fontSize: 10, color: '#858585',
        letterSpacing: 0.6, fontWeight: 600, flexShrink: 0,
        borderBottom: '1px solid #2d2d30',
      }}>
        Таблицы
        <span style={{ fontFamily: 'monospace', color: '#555' }}>{tables.length}</span>
      </div>

      {/* search */}
      <div style={{ padding: '6px 8px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#3c3c3c', borderRadius: 3, padding: '4px 8px',
          border: '1px solid #2d2d30',
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="#666" strokeWidth="1.3"/>
            <path d="M10.5 10.5 L13 13" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск таблиц..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#cccccc', fontFamily: 'monospace', fontSize: 11, minWidth: 0,
            }}
          />
        </div>
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 8px' }}>
        {filtered.map((t) => {
          const isSel = selected === t.name
          const isHov = hoveredTable === t.name
          const fkCount = t.cols.filter((c) => c.fk).length
          const pkCols = t.cols.filter((c) => c.pk)
          return (
            <div
              key={t.name}
              onClick={() => onSelect(t.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 8px 3px 12px',
                background: isSel ? '#37373d' : isHov ? '#2a2d2e' : 'transparent',
                borderLeft: isSel ? '2px solid #007acc' : '2px solid transparent',
                cursor: 'pointer', fontSize: 11, borderRadius: '0 3px 3px 0',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <rect x="2" y="3" width="12" height="10" rx="1"
                  stroke={isSel ? '#007acc' : '#858585'} strokeWidth="1.1"/>
                <path d="M2 6.5 H14 M2 9.5 H14 M6 6.5 V13 M10 6.5 V13"
                  stroke={isSel ? '#007acc' : '#858585'} strokeWidth="1.1"/>
              </svg>
              <span style={{
                fontFamily: 'monospace', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: isSel ? '#ffffff' : '#cccccc',
              }}>
                {t.name}
              </span>
              <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                {pkCols.length > 0 && (
                  <span style={{
                    fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
                    color: '#dcb67a', background: 'rgba(220,182,122,0.12)',
                    padding: '1px 3px', borderRadius: 2,
                  }}>PK</span>
                )}
                {fkCount > 0 && (
                  <span style={{
                    fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
                    color: '#c586c0', background: 'rgba(197,134,192,0.12)',
                    padding: '1px 3px', borderRadius: 2,
                  }}>{fkCount}FK</span>
                )}
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '12px 12px', color: '#555', fontSize: 11 }}>
            Нет совпадений
          </div>
        )}
      </div>
    </div>
  )
}
