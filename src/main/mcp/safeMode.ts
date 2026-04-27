import type { McpSafeMode } from './mcpState'

export function checkSafeMode(sql: string, mode: McpSafeMode): string | null {
  if (mode === 'full') return null

  const trimmed = sql.trim()
  const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase() ?? ''

  if (mode === 'read_only') {
    const allowed = new Set(['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'WITH'])
    if (!allowed.has(firstWord)) {
      return `Запрос заблокирован: режим READ_ONLY разрешает только SELECT-запросы. Получен: ${firstWord}`
    }
    return null
  }

  // safe mode — block destructive operations
  if (/\bDROP\b/i.test(trimmed)) {
    return 'Запрос заблокирован: DROP не разрешён в режиме SAFE.'
  }
  if (/\bTRUNCATE\b/i.test(trimmed)) {
    return 'Запрос заблокирован: TRUNCATE не разрешён в режиме SAFE.'
  }
  if (/\bDELETE\b/i.test(trimmed) && !/\bWHERE\b/i.test(trimmed)) {
    return 'Запрос заблокирован: DELETE без WHERE не разрешён в режиме SAFE.'
  }
  if (/\bALTER\s+TABLE\b/i.test(trimmed)) {
    return 'Запрос заблокирован: ALTER TABLE не разрешён в режиме SAFE.'
  }

  return null
}
