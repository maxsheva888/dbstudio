import type { QueryLogEntry, QueryLogKind, QueryLogGrade, QueryLogPlan } from '../shared/types'

const MAX_ENTRIES = 2000
const entries: QueryLogEntry[] = []
let nextId = 1
let pushFn: ((entry: QueryLogEntry) => void) | null = null
let updateFn: ((entry: QueryLogEntry) => void) | null = null

// Per-connection transaction state
const txState = new Map<string, boolean>()

export function setPushFn(fn: (entry: QueryLogEntry) => void): void {
  pushFn = fn
}

export function setUpdateFn(fn: (entry: QueryLogEntry) => void): void {
  updateFn = fn
}

export function isTx(connectionId: string): boolean {
  return txState.get(connectionId) ?? false
}

export function trackTx(connectionId: string, sql: string): void {
  const first = sql.trim().toUpperCase().match(/^\S+/)?.[0] ?? ''
  if (first === 'START' || first === 'BEGIN') {
    txState.set(connectionId, true)
  } else if (first === 'COMMIT' || first === 'ROLLBACK') {
    txState.delete(connectionId)
  }
}

export function deriveKind(sql: string): QueryLogKind {
  const first = sql.trim().toUpperCase().match(/^\S+/)?.[0] ?? ''
  if (first === 'SELECT') return 'SELECT'
  if (first === 'UPDATE') return 'UPDATE'
  if (first === 'INSERT') return 'INSERT'
  if (first === 'DELETE') return 'DELETE'
  if (first === 'EXPLAIN') return 'EXPLAIN'
  if (first === 'START' || first === 'BEGIN' || first === 'COMMIT' || first === 'ROLLBACK' || first === 'SAVEPOINT') return 'BEGIN'
  if (['ALTER', 'CREATE', 'DROP', 'TRUNCATE', 'RENAME', 'COMMENT', 'GRANT', 'REVOKE', 'SHOW', 'DESCRIBE', 'DESC', 'USE'].includes(first)) return 'DDL'
  if (first === 'WITH') return 'SELECT'
  if (first === '--') return 'CONNECT'
  return 'OTHER'
}

export function computeGrade(
  durationMs: number | null,
  plan?: QueryLogPlan,
  kind?: QueryLogKind
): QueryLogGrade {
  if (kind === 'CONNECT' || kind === 'BEGIN' || kind === 'EXPLAIN') return '?'
  if (durationMs === null) return '?'

  if (plan) {
    if (plan.scan === 'full' && plan.rows > 50000) return 'F'
    if (plan.scan === 'full' && plan.rows > 5000) return 'D'
    if (plan.scan === 'full') return 'C'
    if (durationMs > 2000) return 'D'
    if (durationMs > 500) return 'C'
    if (durationMs > 50) return 'B'
    return 'A'
  }

  // Duration-only (no EXPLAIN data yet)
  if (durationMs > 5000) return 'F'
  if (durationMs > 2000) return 'D'
  if (durationMs > 500) return 'C'
  if (durationMs > 50) return 'B'
  return 'A'
}

export function computeHints(
  sql: string,
  kind: QueryLogKind,
  durationMs: number | null,
  rowCount: number | null,
  plan?: QueryLogPlan
): string[] {
  const hints: string[] = []
  const upper = sql.toUpperCase()

  const hasWhere     = /\bWHERE\b/.test(upper)
  const hasLimit     = /\bLIMIT\b/.test(upper)
  const hasAggregate = /\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/.test(upper)
  const noDataKind   = (k: QueryLogKind) =>
    k === 'DDL' || k === 'BEGIN' || k === 'CONNECT' || k === 'EXPLAIN' || k === 'OTHER'

  // UPDATE/DELETE without WHERE — always valid warning
  if ((kind === 'UPDATE' || kind === 'DELETE') && !hasWhere) {
    hints.push('Запрос без WHERE — будут затронуты все строки таблицы!')
  }

  // SELECT returned 0 rows — not relevant for aggregates (COUNT(*) = 0 is meaningful)
  if (kind === 'SELECT' && rowCount === 0 && !hasAggregate) {
    hints.push('Запрос не вернул строк — проверьте условия фильтрации')
  }

  if (plan) {
    // Full scan hints — several cases where it's not actionable
    if (plan.scan === 'full') {
      if (plan.rows < 1000) {
        // Small table: full scan is fine, index would add overhead
      } else if (!hasWhere && hasLimit) {
        // No filter + LIMIT: engine reads rows in storage order — no index can help here
      } else {
        hints.push('Полный перебор таблицы — рассмотрите добавление индекса')
      }
    }

    // High checked/returned ratio — meaningless when LIMIT distorts it or aggregates collapse rows
    if (
      rowCount !== null && rowCount > 0 &&
      plan.rows > 0 && plan.rows / rowCount > 100 &&
      !hasLimit && !hasAggregate
    ) {
      hints.push('Высокое соотношение проверенных/возвращённых строк — возможен лишний JOIN или отсутствует индекс')
    }
  } else if (durationMs !== null && durationMs > 500 && !noDataKind(kind)) {
    hints.push('Запустите EXPLAIN для полного анализа производительности')
  }

  // Slow query — not applicable to DDL (ALTER TABLE is slow by nature)
  if (durationMs !== null && durationMs > 2000 && !noDataKind(kind)) {
    hints.push('Медленный запрос (> 2 с) — рассмотрите кэширование или оптимизацию')
  }

  // LIKE with leading wildcard — cannot use B-tree index
  if (/\bLIKE\s*'%[^']+/.test(upper)) {
    hints.push("LIKE с ведущим % не использует индекс — рассмотрите полнотекстовый поиск (FULLTEXT)")
  }

  // Large OFFSET — inefficient keyset pagination
  const offsetMatch = /\bOFFSET\s+(\d+)/.exec(upper)
  if (offsetMatch) {
    const offset = parseInt(offsetMatch[1], 10)
    if (offset > 1000) {
      hints.push(`Большой OFFSET (${offset.toLocaleString('ru-RU')}) замедляет выборку — используйте cursor-based pagination`)
    }
  }

  return hints
}

export function logEntry(entry: Omit<QueryLogEntry, 'id'>): QueryLogEntry {
  const e: QueryLogEntry = { ...entry, id: nextId++ }
  entries.push(e)
  if (entries.length > MAX_ENTRIES) entries.shift()
  pushFn?.(e)
  return e
}

export function updateEntry(id: number, patch: Partial<Omit<QueryLogEntry, 'id'>>): QueryLogEntry | null {
  const idx = entries.findIndex((e) => e.id === id)
  if (idx === -1) return null
  entries[idx] = { ...entries[idx], ...patch }
  updateFn?.(entries[idx])
  return entries[idx]
}

export function getEntries(): QueryLogEntry[] {
  return [...entries]
}

export function clearEntries(): void {
  entries.length = 0
  nextId = 1
  txState.clear()
}
