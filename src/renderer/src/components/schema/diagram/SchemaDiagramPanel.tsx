import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { CanvasTable, ERDEdge } from './types'
import { buildCanvasTables, buildEdges, loadPositions, savePositions } from './layout'
import { HEAD_H, ROW_H } from './TableNode'
import TableNode from './TableNode'
import EdgeLayer from './EdgeLayer'
import Minimap from './Minimap'
import SchemaSidebar from './SchemaSidebar'
import DDLPanel from './DDLPanel'

const CANVAS_W = 4000
const CANVAS_H = 3000

interface Props {
  connectionId: string
  database: string
  onOpenInEditor?: (sql: string) => void
}

function tableHeight(t: CanvasTable): number {
  const rows = t.expanded ? t.cols.length : t.cols.filter((c) => c.pk || c.fk || c.idx || c.uq).length
  return HEAD_H + Math.max(1, rows) * ROW_H + (rows < t.cols.length && !t.expanded ? 20 : 0) + 2
}

export default function SchemaDiagramPanel({ connectionId, database, onOpenInEditor }: Props) {
  const [tables, setTables] = useState<CanvasTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [zoom, setZoom] = useState(0.8)
  const [selected, setSelected] = useState<string | null>(null)
  const [hoveredCol, setHoveredCol] = useState<{ table: string; col: string } | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<
    | { type: 'pan'; sx: number; sy: number; px: number; py: number }
    | { type: 'table'; name: string; sx: number; sy: number; tx: number; ty: number }
    | null
  >(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.api.schema.erd(connectionId, database)
      .then((data) => {
        const saved = loadPositions(connectionId, database)
        setTables(buildCanvasTables(data, saved))
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [connectionId, database])

  // ── Edges ──────────────────────────────────────────────────────────────────

  const edges: ERDEdge[] = useMemo(() => buildEdges(tables), [tables])

  // ── Highlight ──────────────────────────────────────────────────────────────

  const highlight = useMemo(() => {
    const edgeIds = new Set<string>()
    const cols = new Set<string>()
    const tabs = new Set<string>()

    const addEdge = (e: ERDEdge) => {
      edgeIds.add(e.id)
      cols.add(`${e.from.table}.${e.from.col}`)
      cols.add(`${e.to.table}.${e.to.col}`)
      tabs.add(e.from.table)
      tabs.add(e.to.table)
    }

    if (hoveredCol) {
      edges.filter((e) =>
        (e.from.table === hoveredCol.table && e.from.col === hoveredCol.col) ||
        (e.to.table === hoveredCol.table && e.to.col === hoveredCol.col)
      ).forEach(addEdge)
    } else if (selected) {
      edges.filter((e) => e.from.table === selected || e.to.table === selected).forEach(addEdge)
      tabs.add(selected)
    }

    return { edgeIds, cols, tabs, active: !!(hoveredCol || (selected && edgeIds.size > 0)) }
  }, [hoveredCol, selected, edges])

  // ── Pan & zoom interactions ────────────────────────────────────────────────

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => Math.max(0.25, Math.min(2, +(z * (1 - e.deltaY * 0.001)).toFixed(2))))
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return
      const d = dragRef.current
      if (d.type === 'pan') {
        setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) })
      } else {
        const dx = (e.clientX - d.sx) / zoom
        const dy = (e.clientY - d.sy) / zoom
        setTables((prev) =>
          prev.map((t) => t.name === d.name ? { ...t, x: d.tx + dx, y: d.ty + dy } : t)
        )
      }
    }
    const up = () => {
      if (dragRef.current?.type === 'table') {
        setTables((prev) => {
          savePositions(connectionId, database, prev)
          return prev
        })
      }
      dragRef.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [zoom, connectionId, database])

  const onMouseDownBg = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-table]')) return
    dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }

  const onTableHeaderDown = useCallback((e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    const t = tables.find((x) => x.name === name)
    if (!t) return
    dragRef.current = { type: 'table', name, sx: e.clientX, sy: e.clientY, tx: t.x, ty: t.y }
  }, [tables])

  // ── Fit to view ────────────────────────────────────────────────────────────

  const fit = useCallback(() => {
    if (tables.length === 0 || !viewportRef.current) return
    const xs = tables.flatMap((t) => [t.x, t.x + t.w])
    const ys = tables.flatMap((t) => [t.y, t.y + tableHeight(t)])
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const vp = viewportRef.current
    const sw = maxX - minX + 80, sh = maxY - minY + 80
    const z = Math.min(vp.clientWidth / sw, vp.clientHeight / sh, 1.2)
    setZoom(+z.toFixed(2))
    setPan({ x: -minX * z + 40, y: -minY * z + 40 })
  }, [tables])

  // ── Focus on table (from sidebar / search) ─────────────────────────────────

  const focusOn = useCallback((name: string) => {
    const t = tables.find((x) => x.name === name)
    if (!t || !viewportRef.current) return
    setSelected(name)
    const vp = viewportRef.current
    setPan({
      x: -t.x * zoom + vp.clientWidth / 2 - (t.w * zoom) / 2,
      y: -t.y * zoom + vp.clientHeight / 2 - 60,
    })
  }, [tables, zoom])

  // ── Toggle expand ──────────────────────────────────────────────────────────

  const toggleExpand = useCallback((name: string) => {
    setTables((prev) => {
      const next = prev.map((t) => t.name === name ? { ...t, expanded: !t.expanded } : t)
      savePositions(connectionId, database, next)
      return next
    })
  }, [connectionId, database])

  // ── Viewport size ──────────────────────────────────────────────────────────

  const [vpSize, setVpSize] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setVpSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const selectedTable = tables.find((t) => t.name === selected) ?? null

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e1e1e', color: '#555', fontSize: 12 }}>
        Загрузка схемы...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e1e1e', color: '#f48771', fontSize: 12 }}>
        Ошибка: {error}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e' }}>

      {/* ── Toolbar ── */}
      <div style={{
        height: 36, flexShrink: 0,
        background: '#252526', borderBottom: '1px solid #2d2d30',
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        fontSize: 12, color: '#cccccc',
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="2" y="2" width="5" height="4" rx="0.5" stroke="#007acc" strokeWidth="1.2"/>
          <rect x="9" y="10" width="5" height="4" rx="0.5" stroke="#007acc" strokeWidth="1.2"/>
          <path d="M7 4 H9 V12" stroke="#007acc" strokeWidth="1.2" fill="none"/>
        </svg>
        <span style={{ color: '#ffffff', fontWeight: 500 }}>{database}</span>
        <span style={{ color: '#555' }}>·</span>
        <span style={{ color: '#858585' }}>{tables.length} таблиц · {edges.length} связей</span>
        <div style={{ flex: 1 }}/>
        {/* zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
            style={btnStyle} title="Zoom out">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M3 8 H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          <span style={{ width: 40, textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#858585' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
            style={btnStyle} title="Zoom in">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M8 3 V13 M3 8 H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          <button onClick={fit} style={btnStyle} title="Вписать всё">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 6 V3 H6 M10 3 H13 V6 M13 10 V13 H10 M6 13 H3 V10"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SchemaSidebar
          tables={tables}
          selected={selected}
          onSelect={focusOn}
          hoveredTable={hoveredCol?.table ?? null}
        />

        {/* canvas column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* viewport */}
          <div
            ref={viewportRef}
            onMouseDown={onMouseDownBg}
            onClick={(e) => {
              if ((e.target as Element).closest('[data-table]')) return
              setSelected(null)
            }}
            style={{
              flex: 1, position: 'relative', overflow: 'hidden',
              background: '#1e1e1e',
              backgroundImage: 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              cursor: dragRef.current ? 'grabbing' : 'default',
            }}
          >
            <div style={{
              position: 'absolute',
              left: pan.x, top: pan.y,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              width: CANVAS_W, height: CANVAS_H,
            }}>
              <EdgeLayer
                tables={tables}
                edges={edges}
                width={CANVAS_W}
                height={CANVAS_H}
                highlightEdgeIds={highlight.edgeIds}
                hasHighlight={highlight.active}
              />
              {tables.map((t) => (
                <TableNode
                  key={t.name}
                  table={t}
                  selected={selected === t.name}
                  dimmed={highlight.active && !highlight.tabs.has(t.name)}
                  highlightCols={highlight.cols}
                  hoveredCol={hoveredCol}
                  onSelect={() => setSelected(t.name)}
                  onHoverCol={setHoveredCol}
                  onHeaderMouseDown={(e) => onTableHeaderDown(e, t.name)}
                  onDoubleClickHeader={() => {}}
                  onToggleExpand={() => toggleExpand(t.name)}
                />
              ))}
            </div>

            <Minimap
              tables={tables}
              vpW={vpSize.w}
              vpH={vpSize.h}
              zoom={zoom}
              pan={pan}
              highlightTables={highlight.tabs}
            />
          </div>

          {/* DDL panel */}
          <DDLPanel
            table={selectedTable}
            onOpenInEditor={onOpenInEditor}
          />
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: 24, height: 24,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid #333', borderRadius: 3,
  background: 'transparent', color: '#858585',
  cursor: 'pointer',
}
