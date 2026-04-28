import React, { useMemo } from 'react'
import type { CanvasTable } from './types'
import { ROW_H, HEAD_H } from './TableNode'

const W = 180
const H = 120

function tableHeight(t: CanvasTable): number {
  const rows = t.expanded ? t.cols.length : t.cols.filter((c) => c.pk || c.fk || c.idx || c.uq).length
  return HEAD_H + Math.max(1, rows) * ROW_H + 2
}

interface Props {
  tables: CanvasTable[]
  vpW: number
  vpH: number
  zoom: number
  pan: { x: number; y: number }
  highlightTables: Set<string>
}

export default function Minimap({ tables, vpW, vpH, zoom, pan, highlightTables }: Props) {
  const bounds = useMemo(() => {
    if (tables.length === 0) return { minX: 0, maxX: 800, minY: 0, maxY: 600 }
    const xs = tables.flatMap((t) => [t.x, t.x + t.w])
    const ys = tables.flatMap((t) => [t.y, t.y + tableHeight(t)])
    return {
      minX: Math.min(...xs) - 30,
      maxX: Math.max(...xs) + 30,
      minY: Math.min(...ys) - 30,
      maxY: Math.max(...ys) + 30,
    }
  }, [tables])

  const sw = bounds.maxX - bounds.minX
  const sh = bounds.maxY - bounds.minY
  const scale = Math.min(W / sw, H / sh)

  const vw = vpW / zoom
  const vh = vpH / zoom
  const vx = -pan.x / zoom
  const vy = -pan.y / zoom

  return (
    <div style={{
      position: 'absolute', right: 12, bottom: 12,
      width: W, height: H,
      background: 'rgba(18,18,18,0.92)',
      border: '1px solid #3e3e42',
      borderRadius: 4, overflow: 'hidden',
      boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
    }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <g transform={`translate(${-bounds.minX * scale} ${-bounds.minY * scale}) scale(${scale})`}>
          {tables.map((t) => {
            const h = tableHeight(t)
            const lit = highlightTables.has(t.name)
            return (
              <rect key={t.name}
                x={t.x} y={t.y} width={t.w} height={h}
                fill={lit ? '#dcb67a' : '#37373d'}
                opacity={lit ? 0.8 : 0.55}
                stroke="#2d2d30" strokeWidth={1 / scale}
                rx={2 / scale}
              />
            )
          })}
          <rect
            x={vx} y={vy} width={vw} height={vh}
            fill="rgba(0,122,204,0.08)"
            stroke="#007acc" strokeWidth={1.5 / scale}
          />
        </g>
      </svg>
      <span style={{
        position: 'absolute', top: 4, left: 6,
        color: '#555', fontSize: 9, fontFamily: 'monospace',
        textTransform: 'uppercase', letterSpacing: 0.5,
        pointerEvents: 'none',
      }}>
        minimap
      </span>
    </div>
  )
}
