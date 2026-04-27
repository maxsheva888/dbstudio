import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Database } from 'lucide-react'
import type { CanvasTable, ERDEdge } from './types'
import { buildCanvasTables, buildEdges, loadPositions, savePositions, resolveStackOverlaps } from './layout'
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
  const [zoom, setZoom] = useState(0.8)
  const [selected, setSelected] = useState<string | null>(null)
  const [hoveredCol, setHoveredCol] = useState<{ table: string; col: string } | null>(null)
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 })
  const [dragging, setDragging] = useState(false)
  const [pinnedCol, setPinnedCol] = useState<{ table: string; col: string } | null>(null)
  const [zenMode, setZenMode] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)

  // Sync zenMode with actual fullscreen state (Escape key is handled by the browser)
  useEffect(() => {
    const onFsChange = () => setZenMode(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleZen = useCallback(() => {
    if (!document.fullscreenElement) {
      panelRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // key = expanded table name, value = {tableName → y before push}
  const expandHistory = useRef<Map<string, Map<string, number>>>(new Map())

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

    // pin locks the highlight; hover only works when nothing is pinned
    const effectiveCol = pinnedCol ?? hoveredCol

    if (effectiveCol) {
      edges.filter((e) =>
        (e.from.table === effectiveCol.table && e.from.col === effectiveCol.col) ||
        (e.to.table === effectiveCol.table && e.to.col === effectiveCol.col)
      ).forEach(addEdge)
    } else if (selected) {
      edges.filter((e) => e.from.table === selected || e.to.table === selected).forEach(addEdge)
      tabs.add(selected)
    }

    return { edgeIds, cols, tabs, active: edgeIds.size > 0 }
  }, [hoveredCol, pinnedCol, selected, edges])

  // ── Ctrl+wheel → zoom (anchored on cursor) ─────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const oldZoom = zoomRef.current
      const newZoom = Math.max(0.25, Math.min(2, +(oldZoom * (1 - e.deltaY * 0.001)).toFixed(2)))
      if (newZoom === oldZoom) return
      const canvasX = (e.clientX - rect.left + el.scrollLeft) / oldZoom
      const canvasY = (e.clientY - rect.top + el.scrollTop) / oldZoom
      setZoom(newZoom)
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = Math.max(0, canvasX * newZoom - (e.clientX - rect.left))
          scrollRef.current.scrollTop  = Math.max(0, canvasY * newZoom - (e.clientY - rect.top))
        }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Drag to pan & table drag ───────────────────────────────────────────────

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return
      const d = dragRef.current
      if (d.type === 'pan') {
        const el = scrollRef.current
        if (el) {
          el.scrollLeft = d.px - (e.clientX - d.sx)
          el.scrollTop  = d.py - (e.clientY - d.sy)
        }
      } else {
        const dx = (e.clientX - d.sx) / zoomRef.current
        const dy = (e.clientY - d.sy) / zoomRef.current
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
      setDragging(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [connectionId, database])

  const onMouseDownBg = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-table]')) return
    const el = scrollRef.current
    if (!el) return
    setDragging(true)
    dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, px: el.scrollLeft, py: el.scrollTop }
  }

  const onTableHeaderDown = useCallback((e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    const t = tables.find((x) => x.name === name)
    if (!t) return
    dragRef.current = { type: 'table', name, sx: e.clientX, sy: e.clientY, tx: t.x, ty: t.y }
  }, [tables])

  // ── Fit to view ────────────────────────────────────────────────────────────

  const fit = useCallback(() => {
    if (tables.length === 0 || !scrollRef.current) return
    const xs = tables.flatMap((t) => [t.x, t.x + t.w])
    const ys = tables.flatMap((t) => [t.y, t.y + tableHeight(t)])
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const el = scrollRef.current
    const sw = maxX - minX + 80, sh = maxY - minY + 80
    const z = +Math.min(el.clientWidth / sw, el.clientHeight / sh, 1.2).toFixed(2)
    setZoom(z)
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = Math.max(0, (minX - 40) * z)
        scrollRef.current.scrollTop  = Math.max(0, (minY - 40) * z)
      }
    })
  }, [tables])

  // ── Focus on table (from sidebar / search) ─────────────────────────────────

  const focusOn = useCallback((name: string) => {
    const t = tables.find((x) => x.name === name)
    if (!t || !scrollRef.current) return
    setSelected(name)
    const el = scrollRef.current
    const z = zoomRef.current
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = Math.max(0, t.x * z - el.clientWidth  / 2 + (t.w * z) / 2)
        scrollRef.current.scrollTop  = Math.max(0, t.y * z - el.clientHeight / 2 + 60)
      }
    })
  }, [tables])

  // ── Toggle expand ──────────────────────────────────────────────────────────

  const toggleExpand = useCallback((name: string) => {
    setTables((prev) => {
      const target = prev.find((t) => t.name === name)
      if (!target) return prev

      if (!target.expanded) {
        // ── Expanding ──────────────────────────────────────────────────────
        const before = new Map(prev.map((t) => [t.name, t.y]))
        const toggled = prev.map((t) => t.name === name ? { ...t, expanded: true } : t)
        const next = resolveStackOverlaps(toggled)
        // remember original y for every table that got pushed
        const pushed = new Map<string, number>()
        for (const t of next) {
          const origY = before.get(t.name)!
          if (t.name !== name && t.y !== origY) pushed.set(t.name, origY)
        }
        expandHistory.current.set(name, pushed)
        savePositions(connectionId, database, next)
        return next
      } else {
        // ── Collapsing ─────────────────────────────────────────────────────
        const pushed = expandHistory.current.get(name)
        expandHistory.current.delete(name)
        const toggled = prev.map((t) => t.name === name ? { ...t, expanded: false } : t)

        let next = toggled
        if (pushed && pushed.size > 0) {
          // restore every table that was pushed by this expansion
          next = toggled.map((t) => {
            const origY = pushed.get(t.name)
            return origY !== undefined ? { ...t, y: origY } : t
          })
          // re-resolve in case another table is still expanded and creates new overlaps
          if (next.some((t) => t.expanded)) next = resolveStackOverlaps(next)
        }

        savePositions(connectionId, database, next)
        return next
      }
    })
  }, [connectionId, database])

  // ── Viewport size (for minimap) ────────────────────────────────────────────

  const [vpSize, setVpSize] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = scrollRef.current
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
    <div ref={panelRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e' }}>

      {/* ── Toolbar ── */}
      <div style={{
        height: 36, flexShrink: 0,
        background: '#252526', borderBottom: '1px solid #2d2d30',
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        fontSize: 12, color: '#cccccc',
      }}>
        <Database size={14} style={{ flexShrink: 0, color: '#c586c0' }} />
        <span style={{ color: '#ffffff', fontWeight: 500 }}>{database}</span>
        <span style={{ color: '#555' }}>·</span>
        <span style={{ color: '#858585' }}>{tables.length} таблиц · {edges.length} связей</span>
        <div style={{ flex: 1 }}/>
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
          <div style={{ width: 1, height: 14, background: '#333', margin: '0 2px' }}/>
          <button
            onClick={toggleZen}
            title={zenMode ? 'Выйти из Dzen режима (Esc)' : 'Dzen режим'}
            style={{
              ...btnStyle,
              width: 'auto', padding: '0 8px',
              color: zenMode ? '#c586c0' : '#858585',
              border: zenMode ? '1px solid #c586c0' : '1px solid #333',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 0.5 }}>
              {zenMode ? '✕ Dzen' : 'Dzen'}
            </span>
          </button>
          <div style={{ width: 1, height: 14, background: '#333', margin: '0 2px' }}/>
          <button
            onClick={() => {
              localStorage.removeItem(`dbstudio:erd:${connectionId}:${database}`)
              setLoading(true)
              window.api.schema.erd(connectionId, database).then((data) => {
                setTables(buildCanvasTables(data, null))
                setLoading(false)
                expandHistory.current.clear()
              }).catch(() => setLoading(false))
            }}
            style={btnStyle}
            title="Пересчитать расположение"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 8 C2 4.7 4.7 2 8 2 C10.2 2 12.2 3.1 13.3 4.8 M14 8 C14 11.3 11.3 14 8 14 C5.8 14 3.8 12.9 2.7 11.2"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M13 2 L13.3 4.8 L10.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 14 L2.7 11.2 L5.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
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

          {/* viewport wrapper — keeps Minimap overlaid while scroll container scrolls */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

            {/* scroll container — native scroll handles wheel/trackpad */}
            <div
              ref={scrollRef}
              onMouseDown={onMouseDownBg}
              onClick={(e) => {
                if ((e.target as Element).closest('[data-table]')) return
                setSelected(null)
                setPinnedCol(null)
              }}
              onScroll={(e) => {
                const el = e.currentTarget
                setScrollPos({ left: el.scrollLeft, top: el.scrollTop })
              }}
              style={{
                width: '100%', height: '100%',
                overflow: 'auto',
                cursor: dragging ? 'grabbing' : 'default',
                background: '#1e1e1e',
                backgroundImage: 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            >
              {/* sized area — tells browser the scrollable canvas dimensions */}
              <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: 'relative' }}>
                {/* transform layer — actual content scaled by zoom */}
                <div style={{
                  position: 'absolute', left: 0, top: 0,
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
                      pinnedCol={pinnedCol}
                      onSelect={() => { setSelected(t.name); setPinnedCol(null) }}
                      onHoverCol={setHoveredCol}
                      onColClick={(col) => {
                        setPinnedCol((prev) =>
                          prev?.table === col.table && prev?.col === col.col ? null : col
                        )
                        setSelected(null)
                      }}
                      onHeaderMouseDown={(e) => onTableHeaderDown(e, t.name)}
                      onDoubleClickHeader={() => {}}
                      onToggleExpand={() => toggleExpand(t.name)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Minimap stays fixed over the viewport */}
            <Minimap
              tables={tables}
              vpW={vpSize.w}
              vpH={vpSize.h}
              zoom={zoom}
              pan={{ x: -scrollPos.left, y: -scrollPos.top }}
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
