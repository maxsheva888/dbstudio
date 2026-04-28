import React from 'react'
import type { CanvasTable, ERDEdge } from './types'
import { ROW_H, HEAD_H } from './TableNode'

function colAnchor(
  table: CanvasTable,
  colName: string,
  side: 'left' | 'right'
): { x: number; y: number } {
  const cols = table.expanded
    ? table.cols
    : table.cols.filter((c) => c.pk || c.fk || c.idx || c.uq)
  const row = Math.max(0, cols.findIndex((c) => c.name === colName))
  return {
    x: side === 'right' ? table.x + table.w : table.x,
    y: table.y + HEAD_H + row * ROW_H + ROW_H / 2,
  }
}

function decideSides(from: CanvasTable, to: CanvasTable): ['left' | 'right', 'left' | 'right'] {
  return to.x + to.w / 2 >= from.x + from.w / 2 ? ['right', 'left'] : ['left', 'right']
}

function buildPath(
  ax: number, ay: number,
  bx: number, by: number,
  aSide: 'left' | 'right',
  bSide: 'left' | 'right'
): string {
  const gut = 18
  const r = 8
  const ax2 = ax + (aSide === 'right' ? gut : -gut)
  const bx2 = bx + (bSide === 'right' ? gut : -gut)
  const midX = (ax2 + bx2) / 2
  const sgnA = Math.sign(midX - ax) || 1
  const sgnB = Math.sign(bx - midX) || 1
  const vSgn = Math.sign(by - ay) || 1
  const rr = Math.max(2, Math.min(r,
    Math.abs(midX - ax) / 2,
    Math.abs(bx - midX) / 2,
    Math.abs(by - ay) / 2
  ))
  if (Math.abs(by - ay) < 2) {
    return `M ${ax} ${ay} L ${bx} ${by}`
  }
  return [
    `M ${ax} ${ay}`,
    `L ${midX - sgnA * rr} ${ay}`,
    `Q ${midX} ${ay} ${midX} ${ay + vSgn * rr}`,
    `L ${midX} ${by - vSgn * rr}`,
    `Q ${midX} ${by} ${midX + sgnB * rr} ${by}`,
    `L ${bx} ${by}`,
  ].join(' ')
}

interface Props {
  tables: CanvasTable[]
  edges: ERDEdge[]
  width: number
  height: number
  highlightEdgeIds: Set<string>
  hasHighlight: boolean
}

export default function EdgeLayer({ tables, edges, width, height, highlightEdgeIds, hasHighlight }: Props) {
  const tableMap = new Map(tables.map((t) => [t.name, t]))

  return (
    <svg
      width={width} height={height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      {edges.map((e) => {
        const fromT = tableMap.get(e.from.table)
        const toT = tableMap.get(e.to.table)
        if (!fromT || !toT) return null

        const isActive = highlightEdgeIds.has(e.id)
        const isDim = hasHighlight && !isActive
        const stroke = isActive ? '#dcb67a' : isDim ? '#3a3a3a' : '#4a4a4a'
        const strokeW = isActive ? 1.6 : 1

        // Self-loop
        if (e.from.table === e.to.table) {
          const cols = fromT.expanded ? fromT.cols : fromT.cols.filter((c) => c.pk || c.fk || c.idx || c.uq)
          const r1 = Math.max(0, cols.findIndex((c) => c.name === e.from.col))
          const r2 = Math.max(0, cols.findIndex((c) => c.name === e.to.col))
          const y1 = fromT.y + HEAD_H + r1 * ROW_H + ROW_H / 2
          const y2 = fromT.y + HEAD_H + r2 * ROW_H + ROW_H / 2
          const x = fromT.x + fromT.w
          const out = x + 26
          const path = `M ${x} ${y1} L ${out - 6} ${y1} Q ${out} ${y1} ${out} ${y1 - 6} L ${out} ${y2 + 6} Q ${out} ${y2} ${out - 6} ${y2} L ${x} ${y2}`
          return (
            <g key={e.id} opacity={isDim ? 0.4 : 1}>
              <path d={path} fill="none" stroke={stroke} strokeWidth={strokeW} strokeDasharray="3 3"/>
              <circle cx={x} cy={y1} r="2.5" fill={stroke}/>
              <circle cx={x} cy={y2} r="2.5" fill={stroke}/>
            </g>
          )
        }

        const [sA, sB] = decideSides(fromT, toT)
        const a = colAnchor(fromT, e.from.col, sA)
        const b = colAnchor(toT, e.to.col, sB)
        const path = buildPath(a.x, a.y, b.x, b.y, sA, sB)

        return (
          <g key={e.id} opacity={isDim ? 0.4 : 1}>
            <path d={path} fill="none" stroke={stroke}
              strokeWidth={strokeW}
              strokeDasharray={isActive ? '0' : '3 3'}/>
            {/* "many" dot on FK side */}
            <circle cx={a.x} cy={a.y} r="2.5" fill={stroke}/>
            {/* "one" bar on PK side */}
            {e.oneToOne
              ? <circle cx={b.x} cy={b.y} r="2.5" fill={stroke}/>
              : <line
                  x1={b.x + (sB === 'right' ? -5 : 5)} y1={b.y - 4}
                  x2={b.x + (sB === 'right' ? -5 : 5)} y2={b.y + 4}
                  stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
            }
          </g>
        )
      })}
    </svg>
  )
}
