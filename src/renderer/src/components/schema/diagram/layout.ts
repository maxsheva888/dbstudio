import type { ERDTableData } from '@shared/types'
import type { CanvasTable } from './types'

const COL_W = 220
const GAP_X = 60
const GAP_Y = 48
const COLS = 4
const HEAD_H = 30
const ROW_H = 22
const FOOTER_H = 20

function tableHeight(t: ERDTableData): number {
  const keys = t.cols.filter((c) => c.pk || c.fk || c.idx || c.uq)
  const rows = Math.max(1, keys.length)
  const hasHidden = keys.length < t.cols.length
  return HEAD_H + rows * ROW_H + (hasHidden ? FOOTER_H : 0) + 2
}

export function autoLayout(tables: ERDTableData[]): Map<string, { x: number; y: number }> {
  const colHeights: number[] = Array(COLS).fill(60)
  const result = new Map<string, { x: number; y: number }>()
  tables.forEach((t, i) => {
    const col = i % COLS
    result.set(t.name, { x: GAP_X + col * (COL_W + GAP_X), y: colHeights[col] })
    colHeights[col] += tableHeight(t) + GAP_Y
  })
  return result
}

type SavedPos = Record<string, { x: number; y: number; expanded: boolean }>

function key(connectionId: string, db: string): string {
  return `dbstudio:erd:${connectionId}:${db}`
}

export function loadPositions(connectionId: string, db: string): SavedPos | null {
  try {
    const raw = localStorage.getItem(key(connectionId, db))
    return raw ? (JSON.parse(raw) as SavedPos) : null
  } catch { return null }
}

export function savePositions(connectionId: string, db: string, tables: CanvasTable[]): void {
  try {
    const pos: SavedPos = {}
    tables.forEach((t) => { pos[t.name] = { x: t.x, y: t.y, expanded: t.expanded } })
    localStorage.setItem(key(connectionId, db), JSON.stringify(pos))
  } catch {}
}

export function buildCanvasTables(
  tables: ERDTableData[],
  saved: SavedPos | null
): CanvasTable[] {
  const auto = autoLayout(tables)
  return tables.map((t) => {
    const pos = saved?.[t.name] ?? auto.get(t.name) ?? { x: 0, y: 0 }
    return { ...t, x: pos.x, y: pos.y, w: COL_W, expanded: saved?.[t.name]?.expanded ?? false }
  })
}

export function buildEdges(tables: CanvasTable[]) {
  const edges: import('./types').ERDEdge[] = []
  const tableNames = new Set(tables.map((t) => t.name))
  tables.forEach((t) => {
    t.cols.forEach((c) => {
      if (!c.fk) return
      const dot = c.fk.lastIndexOf('.')
      const refTable = c.fk.slice(0, dot)
      const refCol = c.fk.slice(dot + 1)
      if (!tableNames.has(refTable)) return
      edges.push({
        id: `${t.name}.${c.name}->${refTable}.${refCol}`,
        from: { table: t.name, col: c.name },
        to: { table: refTable, col: refCol },
        oneToOne: c.uq || c.pk,
      })
    })
  })
  return edges
}
