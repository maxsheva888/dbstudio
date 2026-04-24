import type { QueryLogEntry } from '../shared/types'

const MAX_ENTRIES = 2000
const entries: QueryLogEntry[] = []
let nextId = 1
let pushFn: ((entry: QueryLogEntry) => void) | null = null

export function setPushFn(fn: (entry: QueryLogEntry) => void): void {
  pushFn = fn
}

export function logEntry(entry: Omit<QueryLogEntry, 'id'>): void {
  const e: QueryLogEntry = { ...entry, id: nextId++ }
  entries.push(e)
  if (entries.length > MAX_ENTRIES) entries.shift()
  pushFn?.(e)
}

export function getEntries(): QueryLogEntry[] {
  return [...entries]
}
