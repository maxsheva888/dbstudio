import type { ERDTableData } from '@shared/types'
import type { CanvasTable } from './types'

const COL_W = 220
const HEAD_H = 30
const ROW_H = 22
const FOOTER_H = 20

function tableHeight(t: ERDTableData): number {
  const keys = t.cols.filter((c) => c.pk || c.fk || c.idx || c.uq)
  const rows = Math.max(1, keys.length)
  const hasHidden = keys.length < t.cols.length
  return HEAD_H + rows * ROW_H + (hasHidden ? FOOTER_H : 0) + 2
}

// ── Force-directed layout (Fruchterman-Reingold) ───────────────────────────
// FK edges act as springs pulling connected tables together;
// all table pairs repel each other — produces organic clustered ERD layouts.

export function forceLayout(tables: ERDTableData[]): Map<string, { x: number; y: number }> {
  const n = tables.length
  if (n === 0) return new Map()
  if (n === 1) return new Map([[tables[0].name, { x: 400, y: 400 }]])

  const H = tables.map(tableHeight)          // actual heights
  const HW = COL_W / 2                        // half-width (same for all)
  const GAP = 28                              // minimum gap between table edges

  // Build FK edge list (undirected)
  const nameToIdx = new Map(tables.map((t, i) => [t.name, i]))
  const edges: [number, number][] = []
  tables.forEach((t, i) => {
    t.cols.forEach((c) => {
      if (!c.fk) return
      const ref = c.fk.slice(0, c.fk.lastIndexOf('.'))
      const j = nameToIdx.get(ref)
      if (j !== undefined && j !== i) edges.push([i, j])
    })
  })

  const AW = 3400
  const AH = 2800
  const k = Math.sqrt((AW * AH) / n) * 0.95
  const initR = Math.min(k * Math.sqrt(n) * 0.38, 1200)

  // Track CENTER positions for the simulation
  const cx = tables.map((_, i) => AW / 2 + initR * Math.cos((2 * Math.PI * i) / n - Math.PI / 2))
  const cy = tables.map((_, i) => AH / 2 + initR * Math.sin((2 * Math.PI * i) / n - Math.PI / 2))

  let temp = k * 2.5

  for (let iter = 0; iter < 300; iter++) {
    const dx = new Array(n).fill(0) as number[]
    const dy = new Array(n).fill(0) as number[]

    // Repulsion: size-aware — extra force kicks in when bounding boxes are too close
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ddx = cx[i] - cx[j] || 0.01
        const ddy = cy[i] - cy[j] || 0.01
        const dist = Math.sqrt(ddx * ddx + ddy * ddy)
        // Minimum center-to-center distance for these two table sizes
        const minSep = Math.sqrt(
          Math.pow(HW + HW + GAP, 2) +
          Math.pow(H[i] / 2 + H[j] / 2 + GAP, 2)
        )
        // Base FR repulsion + extra impulse when bboxes overlap
        let f = (k * k) / dist
        if (dist < minSep) f += (minSep - dist) * k * 6
        const ux = ddx / dist, uy = ddy / dist
        dx[i] += ux * f;  dy[i] += uy * f
        dx[j] -= ux * f;  dy[j] -= uy * f
      }
    }

    // Attraction: FK edges pull connected tables together
    for (const [i, j] of edges) {
      const ddx = cx[i] - cx[j] || 0.01
      const ddy = cy[i] - cy[j] || 0.01
      const dist = Math.sqrt(ddx * ddx + ddy * ddy)
      const f = (dist * dist) / k
      const ux = ddx / dist, uy = ddy / dist
      dx[i] -= ux * f;  dy[i] -= uy * f
      dx[j] += ux * f;  dy[j] += uy * f
    }

    // Weak gravity — prevents isolated nodes from drifting to edges
    for (let i = 0; i < n; i++) {
      dx[i] += (AW / 2 - cx[i]) * 0.004
      dy[i] += (AH / 2 - cy[i]) * 0.004
    }

    // Apply displacements capped by temperature
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1
      const s = Math.min(mag, temp) / mag
      cx[i] = Math.max(HW + 60,       Math.min(AW - HW - 60,       cx[i] + dx[i] * s))
      cy[i] = Math.max(H[i] / 2 + 60, Math.min(AH - H[i] / 2 - 60, cy[i] + dy[i] * s))
    }
    temp *= 0.955
  }

  // Convert centers → top-left corners
  const tx = cx.map((x, i) => x - HW)
  const ty = cy.map((y, i) => y - H[i] / 2)

  // Post-process: AABB separation — resolve any remaining overlaps
  // (push apart along the axis of minimum overlap — standard SAT approach)
  for (let pass = 0; pass < 30; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const acx = tx[i] + HW,      acy = ty[i] + H[i] / 2
        const bcx = tx[j] + HW,      bcy = ty[j] + H[j] / 2
        const ox = (COL_W + COL_W) / 2 + GAP - Math.abs(acx - bcx)
        const oy = (H[i] + H[j]) / 2 + GAP - Math.abs(acy - bcy)
        if (ox <= 0 || oy <= 0) continue   // no overlap
        if (ox <= oy) {
          const dir = acx >= bcx ? 1 : -1
          tx[i] += dir * ox / 2
          tx[j] -= dir * ox / 2
        } else {
          const dir = acy >= bcy ? 1 : -1
          ty[i] += dir * oy / 2
          ty[j] -= dir * oy / 2
        }
        moved = true
      }
    }
    if (!moved) break
  }

  return new Map(tables.map((t, i) => [t.name, {
    x: Math.round(Math.max(40, tx[i])),
    y: Math.round(Math.max(40, ty[i])),
  }]))
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
  const auto = forceLayout(tables)
  return tables.map((t) => {
    const pos = saved?.[t.name] ?? auto.get(t.name) ?? { x: 0, y: 0 }
    return { ...t, x: pos.x, y: pos.y, w: COL_W, expanded: saved?.[t.name]?.expanded ?? false }
  })
}

function canvasTableHeight(t: CanvasTable): number {
  const rows = t.expanded
    ? t.cols.length
    : t.cols.filter((c) => c.pk || c.fk || c.idx || c.uq).length
  const display = Math.max(1, rows)
  const hasHidden = rows < t.cols.length && !t.expanded
  return HEAD_H + display * ROW_H + (hasHidden ? FOOTER_H : 0) + 2
}

export function resolveStackOverlaps(tables: CanvasTable[]): CanvasTable[] {
  const GAP = 12
  const pos = new Map(tables.map((t) => [t.name, { x: t.x, y: t.y }]))

  for (let pass = 0; pass < 20; pass++) {
    let moved = false

    const sorted = tables
      .map((t) => ({ ...t, ...pos.get(t.name)! }))
      .sort((a, b) => a.y - b.y)

    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]
      const aH = canvasTableHeight(a)
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j]
        const hOv = b.x < a.x + a.w && b.x + b.w > a.x
        if (!hOv) continue
        const need = a.y + aH + GAP
        if (b.y < need) {
          sorted[j] = { ...sorted[j], y: need }
          pos.set(b.name, { x: b.x, y: need })
          moved = true
        }
      }
    }

    if (!moved) break
  }

  return tables.map((t) => {
    const p = pos.get(t.name)!
    return p.y !== t.y ? { ...t, y: p.y } : t
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
