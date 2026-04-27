import React from 'react'
import type { CanvasTable } from './types'
import type { ERDColumn } from '@shared/types'

const ROW_H = 22
const HEAD_H = 30

// ─── Column kind chip ─────────────────────────────────────────────────────────

const CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  pk:  { bg: 'rgba(220,182,122,0.18)', fg: '#dcb67a', label: 'PK' },
  fk:  { bg: 'rgba(197,134,192,0.18)', fg: '#c586c0', label: 'FK' },
  uq:  { bg: 'rgba(86,156,214,0.18)',  fg: '#569cd6', label: 'UQ' },
  idx: { bg: 'rgba(78,201,176,0.18)',  fg: '#4ec9b0', label: 'IX' },
  dot: { bg: 'transparent',            fg: '#555',    label: '·'  },
}

function ColChip({ col }: { col: ERDColumn }) {
  const k = col.pk ? 'pk' : col.fk ? 'fk' : col.uq ? 'uq' : col.idx ? 'idx' : 'dot'
  const { bg, fg, label } = CHIP[k]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 14, borderRadius: 3, flexShrink: 0,
      background: bg, color: fg,
      fontFamily: 'monospace', fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
      border: k === 'dot' ? '1px solid #3e3e42' : 'none',
    }}>
      {label}
    </span>
  )
}

// ─── Table node ───────────────────────────────────────────────────────────────

interface Props {
  table: CanvasTable
  selected: boolean
  dimmed: boolean
  highlightCols: Set<string>
  hoveredCol: { table: string; col: string } | null
  pinnedCol: { table: string; col: string } | null
  onSelect: () => void
  onHoverCol: (v: { table: string; col: string } | null) => void
  onColClick: (col: { table: string; col: string }) => void
  onHeaderMouseDown: (e: React.MouseEvent) => void
  onDoubleClickHeader: () => void
  onToggleExpand: () => void
}

export default function TableNode({
  table, selected, dimmed, highlightCols, hoveredCol, pinnedCol,
  onSelect, onHoverCol, onColClick, onHeaderMouseDown, onDoubleClickHeader, onToggleExpand,
}: Props) {
  const displayedCols = table.expanded
    ? table.cols
    : table.cols.filter((c) => c.pk || c.fk || c.idx || c.uq)

  const hiddenCount = table.cols.length - displayedCols.length

  return (
    <div
      data-table={table.name}
      onClick={onSelect}
      style={{
        position: 'absolute',
        left: table.x, top: table.y, width: table.w,
        background: '#252526',
        border: `1px solid ${selected ? '#007acc' : '#2d2d30'}`,
        borderRadius: 6,
        boxShadow: selected
          ? '0 0 0 1px #007acc, 0 8px 24px rgba(0,0,0,0.4)'
          : '0 2px 8px rgba(0,0,0,0.35)',
        opacity: dimmed ? 0.3 : 1,
        transition: 'opacity .15s, box-shadow .15s, border-color .15s',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* header */}
      <div
        onMouseDown={onHeaderMouseDown}
        onDoubleClick={onDoubleClickHeader}
        style={{
          height: HEAD_H,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 10px',
          background: selected ? '#2c2f36' : '#2a2a2c',
          borderBottom: '1px solid #2d2d30',
          cursor: 'grab',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="12" height="10" rx="1" stroke={selected ? '#007acc' : '#858585'} strokeWidth="1.1"/>
          <path d="M2 6.5 H14 M2 9.5 H14 M6 6.5 V13 M10 6.5 V13" stroke={selected ? '#007acc' : '#858585'} strokeWidth="1.1"/>
        </svg>
        <span style={{
          color: '#ffffff', fontSize: 12, fontWeight: 600,
          fontFamily: 'monospace', letterSpacing: 0.2,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {table.name}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          title={table.expanded ? 'Свернуть' : 'Развернуть'}
          style={{
            width: 16, height: 16, border: 'none', background: 'transparent',
            color: '#555', cursor: 'pointer', padding: 0, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            {table.expanded
              ? <path d="M2 5 H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              : <path d="M5 2 V8 M2 5 H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>}
          </svg>
        </button>
      </div>

      {/* columns */}
      {displayedCols.map((c, k) => {
        const colKey = `${table.name}.${c.name}`
        const lit = highlightCols.has(colKey)
        const isHov = hoveredCol?.table === table.name && hoveredCol?.col === c.name
        const isPinned = pinnedCol?.table === table.name && pinnedCol?.col === c.name
        const bg = isPinned
          ? 'rgba(220,182,122,0.18)'
          : isHov
          ? '#2a2d2e'
          : lit
          ? 'rgba(220,182,122,0.08)'
          : 'transparent'
        return (
          <div
            key={c.name}
            data-col={c.name}
            data-rowkey={colKey}
            onMouseEnter={() => onHoverCol({ table: table.name, col: c.name })}
            onMouseLeave={() => onHoverCol(null)}
            onClick={(e) => { e.stopPropagation(); onColClick({ table: table.name, col: c.name }) }}
            style={{
              height: ROW_H,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 10px',
              background: bg,
              borderTop: k === 0 ? 'none' : '1px solid #2d2d30',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <ColChip col={c} />
            <span style={{
              fontFamily: 'monospace',
              color: c.pk ? '#dcb67a' : c.fk ? '#c586c0' : '#cccccc',
              fontWeight: c.pk ? 600 : 400,
              flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {c.name}
            </span>
            <span style={{
              fontFamily: 'monospace', fontSize: 10,
              color: '#6a6a6a', whiteSpace: 'nowrap',
              fontStyle: c.nn ? 'normal' : 'italic',
            }}>
              {c.type}{!c.nn && !c.pk ? '?' : ''}
            </span>
            {isPinned && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
                <circle cx="4" cy="4" r="3" fill="#dcb67a"/>
              </svg>
            )}
          </div>
        )
      })}

      {/* hidden cols footer */}
      {hiddenCount > 0 && (
        <div
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          style={{
            padding: '4px 10px',
            borderTop: '1px solid #2d2d30',
            color: '#555', fontSize: 10, fontFamily: 'monospace',
            background: '#202021', cursor: 'pointer',
          }}
        >
          + {hiddenCount} more
        </div>
      )}
    </div>
  )
}

export { ROW_H, HEAD_H }
