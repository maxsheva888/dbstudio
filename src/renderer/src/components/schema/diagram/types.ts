import type { ERDTableData } from '@shared/types'

export interface CanvasTable extends ERDTableData {
  x: number
  y: number
  w: number
  expanded: boolean
}

export interface ERDEdge {
  id: string
  from: { table: string; col: string }
  to: { table: string; col: string }
  oneToOne: boolean
}

export interface ColHighlight {
  table: string
  col: string
}
