import { ipcMain, BrowserWindow } from 'electron'
import { getAdapter, getConfig, closeConnection } from '../connections/registry'
import { isConnectionLostError } from '../connections/keepalive'
import {
  logEntry, updateEntry, getEntries,
  isTx, trackTx, deriveKind, computeGrade, computeHints,
} from '../queryLog'
import type { QueryResult, QueryLogPlan } from '../../shared/types'

const SLOW_MS = 1000

function parseMysqlExplain(rows: Record<string, unknown>[]): QueryLogPlan | null {
  if (!rows.length) return null
  // Aggregate across all rows (multiple tables in JOIN) — take worst scan type
  const scanOrder = ['full', 'range', 'index', 'pk', 'meta']
  let worstScan: QueryLogPlan['scan'] = 'meta'
  let totalRows = 0

  for (const row of rows) {
    const type = String(row['type'] ?? row['TYPE'] ?? 'ALL').toLowerCase()
    let scan: QueryLogPlan['scan']
    if (type === 'system' || type === 'const') scan = 'pk'
    else if (type === 'eq_ref' || type === 'ref' || type === 'ref_or_null' || type === 'unique_subquery') scan = 'index'
    else if (type === 'range') scan = 'range'
    else if (type === 'index') scan = 'index'
    else if (type === 'all') scan = 'full'
    else scan = 'meta'

    if (scanOrder.indexOf(scan) < scanOrder.indexOf(worstScan)) worstScan = scan
    totalRows += Number(row['rows'] ?? row['ROWS'] ?? 0)
  }

  const cost = parseFloat(Math.max(0.01, Math.log10(totalRows + 1) * 0.5).toFixed(2))
  return { rows: totalRows, scan: worstScan, cost }
}

function parsePostgresExplain(rows: Record<string, unknown>[]): QueryLogPlan | null {
  if (!rows.length) return null
  try {
    const raw = rows[0]['QUERY PLAN'] as string
    const plans = JSON.parse(raw) as Array<{ Plan: { 'Node Type': string; 'Plan Rows': number; 'Total Cost': number } }>
    const plan = plans[0]?.Plan
    if (!plan) return null
    const nodeType = String(plan['Node Type'] ?? '')
    let scan: QueryLogPlan['scan']
    if (nodeType === 'Index Only Scan') scan = 'pk'
    else if (nodeType.includes('Index')) scan = 'index'
    else if (nodeType === 'Seq Scan') scan = 'full'
    else scan = 'meta'
    return {
      rows: plan['Plan Rows'] ?? 0,
      scan,
      cost: parseFloat((plan['Total Cost'] ?? 0).toFixed(2)),
    }
  } catch {
    return null
  }
}

export function registerQueryHandlers(): void {
  ipcMain.handle(
    'query:execute',
    async (
      _e,
      connectionId: string,
      database: string | null,
      sql: string,
      sourceLabel = 'Query',
      scriptId?: string,
      skipLog?: boolean
    ): Promise<QueryResult> => {
      const trimmed = sql.trim()
      if (!trimmed) throw new Error('Empty query')

      const cfg = getConfig(connectionId)
      const user = cfg?.user ?? null
      const kind = deriveKind(trimmed)
      const tx = connectionId ? isTx(connectionId) : false

      if (connectionId) trackTx(connectionId, trimmed)

      const ranAt = Date.now()
      try {
        const result = await getAdapter(connectionId).query(trimmed, database ?? undefined)
        const durationMs = result.durationMs
        const rowCount = result.rowCount
        const status = durationMs > SLOW_MS ? 'slow' : 'ok'
        const grade = computeGrade(durationMs, undefined, kind)
        const hints = computeHints(trimmed, kind, durationMs, rowCount)

        if (!skipLog) {
          logEntry({ sql: trimmed, connectionId, database, durationMs, error: null, rowCount, ranAt, kind, status, sourceLabel, scriptId, user, tx, grade, hints })
        }
        return result
      } catch (err) {
        const durationMs = Date.now() - ranAt
        const grade = computeGrade(durationMs, undefined, kind)
        const hints = computeHints(trimmed, kind, durationMs, null)

        if (!skipLog) {
          logEntry({ sql: trimmed, connectionId, database, durationMs, error: (err as Error).message, rowCount: null, ranAt, kind, status: 'error', sourceLabel, scriptId, user, tx, grade, hints })
        }

        if (isConnectionLostError(err)) {
          try { await closeConnection(connectionId) } catch {}
          const win = BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) win.webContents.send('connection:lost', connectionId)
        }

        throw err
      }
    }
  )

  ipcMain.handle(
    'queryLog:explain',
    async (_e, entryId: number, connectionId: string, database: string | null, sql: string): Promise<boolean> => {
      try {
        const cfg = getConfig(connectionId)
        const dbType = cfg?.type ?? 'mysql'
        const adapter = getAdapter(connectionId)

        const explainSql = dbType === 'postgres'
          ? `EXPLAIN (FORMAT JSON) ${sql}`
          : `EXPLAIN ${sql}`

        const result = await adapter.query(explainSql, database ?? undefined)

        const plan = dbType === 'postgres'
          ? parsePostgresExplain(result.rows)
          : parseMysqlExplain(result.rows)

        if (!plan) return false

        const entry = getEntries().find((e) => e.id === entryId)
        if (!entry) return false

        const grade = computeGrade(entry.durationMs, plan, entry.kind)
        const hints = computeHints(entry.sql, entry.kind, entry.durationMs, entry.rowCount, plan)

        updateEntry(entryId, { plan, grade, hints })

        // Log the background EXPLAIN query itself
        const user = cfg?.user ?? null
        logEntry({
          sql: explainSql, connectionId, database,
          durationMs: result.durationMs, error: null, rowCount: result.rowCount,
          ranAt: Date.now(), kind: 'EXPLAIN', status: 'ok',
          sourceLabel: `auto · explain #${entryId}`,
          user, tx: false, grade: '?', hints: [],
        })

        return true
      } catch {
        return false
      }
    }
  )
}
