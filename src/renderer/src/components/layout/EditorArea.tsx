import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { X, Play, Save, Eye, GitBranch, ShieldCheck, ShieldOff, Pencil } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import { useScripts } from '@renderer/context/ScriptsContext'
import { useSettings } from '@renderer/context/SettingsContext'
import ResultsGrid from '@renderer/components/results/ResultsGrid'
import VersionsPanel from '@renderer/components/scripts/VersionsPanel'
import NewScriptModal from '@renderer/components/scripts/NewScriptModal'
import QueryLogPanel from './QueryLogPanel'
import type { QueryResult, ScriptFile, ScriptVersion } from '@shared/types'
import type * as Monaco from 'monaco-editor'

// ── Types ────────────────────────────────────────────────────────────────────

interface Tab {
  id: string
  title: string
  content: string
  scriptId?: string
  scriptScope?: string
  loadedVersionId?: number
  loadedContent?: string
  isDiff?: boolean
  diffOriginal?: string
  diffModified?: string
  isLog?: boolean
}

interface TabResult {
  result?: QueryResult
  error?: string
  loading: boolean
  cachedAt?: number  // set only when result is restored from localStorage
}

interface TabMeta {
  versionCount: number
  currentVersionNumber: number
  runCount: number
}

const DEFAULT_SQL = `-- Добро пожаловать в DBStudio
-- Ctrl+Enter — выполнить  |  Ctrl+S — сохранить версию  |  Ctrl+Shift+P — палитра команд

SELECT 1 + 1 AS result;
`

// ── Tab persistence ───────────────────────────────────────────────────────────

const TABS_LS_KEY = 'dbstudio:editorTabs'
const MAX_PERSISTED_ROWS = 1000

interface PersistedTab {
  id: string
  title: string
  content: string
  scriptId?: string
  scriptScope?: string
  loadedVersionId?: number
  loadedContent?: string
}

interface PersistedTabResult {
  result?: QueryResult
  error?: string
  cachedAt: number
}

function loadPersistedTabs(): {
  tabs: Tab[]
  activeTabId: string
  tabResults: Record<string, TabResult>
} | null {
  try {
    const raw = localStorage.getItem(TABS_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const tabs: PersistedTab[] = parsed?.tabs
    const savedActiveId: string = parsed?.activeTabId
    if (!Array.isArray(tabs) || tabs.length === 0) return null
    const validActive = tabs.find((t) => t.id === savedActiveId)?.id ?? tabs[tabs.length - 1].id

    const tabResults: Record<string, TabResult> = {}
    if (parsed?.tabResults && typeof parsed.tabResults === 'object') {
      for (const [id, tr] of Object.entries(parsed.tabResults as Record<string, PersistedTabResult>)) {
        tabResults[id] = {
          result: tr.result as QueryResult | undefined,
          error: tr.error,
          loading: false,
          cachedAt: tr.cachedAt
        }
      }
    }

    return { tabs, activeTabId: validActive, tabResults }
  } catch { return null }
}

function cachedSince(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return 'только что'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} мин`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} ч`
  return `${Math.floor(d / 86_400_000)} дн`
}

function simpleHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function scopeLabel(scope: string): string {
  if (scope === 'global') return 'Глобальный'
  if (scope.startsWith('db:')) return `БД: ${scope.slice(3)}`
  if (scope.startsWith('table:')) return `Таблица: ${scope.slice(6)}`
  return scope
}

function isScopeExecutable(
  scope: string | undefined,
  activeConnectionId: string | null,
  activeDatabase: string | null
): boolean {
  if (!scope || scope === 'global') return true
  if (scope.startsWith('db:')) {
    const rest = scope.slice(3)
    const idx = rest.indexOf(':')
    // Legacy format: db:<dbName>  (no connId)
    if (idx < 0) return activeConnectionId !== null && rest === activeDatabase
    const connId = rest.slice(0, idx)
    const dbName = rest.slice(idx + 1)
    if (connId === '__legacy__') return activeConnectionId !== null && dbName === activeDatabase
    return connId === activeConnectionId && dbName === activeDatabase
  }
  if (scope.startsWith('table:')) {
    const rest = scope.slice(6)
    const idx = rest.indexOf(':')
    // Legacy format: table:<dbName>.<tableName>  (no connId)
    if (idx < 0) {
      const dotIdx = rest.lastIndexOf('.')
      const dbName = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest
      return activeConnectionId !== null && dbName === activeDatabase
    }
    const connId = rest.slice(0, idx)
    const remainder = rest.slice(idx + 1)
    const dotIdx = remainder.lastIndexOf('.')
    const dbName = dotIdx >= 0 ? remainder.slice(0, dotIdx) : remainder
    if (connId === '__legacy__') return activeConnectionId !== null && dbName === activeDatabase
    return connId === activeConnectionId && dbName === activeDatabase
  }
  return true
}

// ── SQL write-op detection ────────────────────────────────────────────────────

const WRITE_OP_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|DROP|TRUNCATE|ALTER|CREATE|RENAME|CALL|EXECUTE|GRANT|REVOKE|LOCK|UNLOCK)\b/i

function detectWriteOp(sql: string): string | null {
  const stripped = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const stmt of stripped.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = stmt.match(WRITE_OP_RE)
    if (m) return m[1].toUpperCase()
  }
  return null
}

// ── Editable-table helpers ────────────────────────────────────────────────────

function parseEditableTable(sql: string): string | null {
  const s = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
  const stmts = s.split(';').map((t) => t.trim()).filter(Boolean)
  if (stmts.length !== 1) return null
  const stmt = stmts[0]
  if (!/^SELECT\b/i.test(stmt)) return null
  if (/\b(JOIN|UNION)\b|\bGROUP\s+BY\b|\bHAVING\b|\(\s*SELECT\b/i.test(stmt)) return null
  const m = stmt.match(/\bFROM\s+`?(\w+)`?/i)
  return m ? m[1] : null
}

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'boolean') return val ? '1' : '0'
  if (typeof val === 'number' || typeof val === 'bigint') return String(val)
  if (val instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `'${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}'`
  }
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialSql?: string
  onInitialSqlConsumed?: () => void
  runSql?: string
  onRunSqlConsumed?: () => void
  scriptToOpen?: ScriptFile
  onScriptOpened?: () => void
  scriptToRun?: ScriptFile
  onScriptRun?: () => void
  onLastQueryMs?: (ms: number) => void
  onOpenPalette?: () => void
  newTabTrigger?: number
  openLogTrigger?: number
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditorArea({
  initialSql, onInitialSqlConsumed,
  runSql, onRunSqlConsumed,
  scriptToOpen, onScriptOpened,
  scriptToRun, onScriptRun,
  onLastQueryMs, onOpenPalette,
  newTabTrigger, openLogTrigger
}: Props) {
  const { activeConnectionId, activeDatabases, activeDatabase, setActiveDatabase } = useConnections()
  const { createScript } = useScripts()
  const { monacoTheme, editorFontSize, safeMode, setSafeMode } = useSettings()
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const saved = loadPersistedTabs()
    return saved?.tabs ?? [{ id: '1', title: 'Query 1', content: DEFAULT_SQL }]
  })
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const saved = loadPersistedTabs()
    return saved?.activeTabId ?? '1'
  })
  const [tabResults, setTabResults] = useState<Record<string, TabResult>>(() =>
    loadPersistedTabs()?.tabResults ?? {}
  )
  const [tabMeta, setTabMeta] = useState<Record<string, TabMeta>>({})
  const [bottomTab, setBottomTab] = useState<'results' | 'versions'>('results')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [blockedOp, setBlockedOp] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editableTable, setEditableTable] = useState<string | null>(null)
  const [pkCols, setPkCols] = useState<string[]>([])
  const [pendingEdits, setPendingEdits] = useState<Map<number, Record<string, unknown>>>(new Map())
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const saveTabsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeResult = tabResults[activeTabId]
  const activeMeta = tabMeta[activeTabId]
  const isDirty = activeTab?.scriptId != null && activeTab.content !== activeTab.loadedContent

  // ── Persist tabs to localStorage (debounced, 500 ms) ─────────────────────

  useEffect(() => {
    if (saveTabsTimerRef.current) clearTimeout(saveTabsTimerRef.current)
    saveTabsTimerRef.current = setTimeout(() => {
      const persistable = tabs.filter((t) => !t.isDiff && !t.isLog)
      const savedActive = persistable.find((t) => t.id === activeTabId)?.id
        ?? persistable[persistable.length - 1]?.id

      // Build results to persist (skip loading states, cap rows)
      const cachedAt = Date.now()
      const savedResults: Record<string, PersistedTabResult> = {}
      for (const tab of persistable) {
        const tr = tabResults[tab.id]
        if (!tr || tr.loading) continue
        if (tr.error) {
          savedResults[tab.id] = { error: tr.error, cachedAt }
        } else if (tr.result) {
          const rows = tr.result.rows.length > MAX_PERSISTED_ROWS
            ? tr.result.rows.slice(0, MAX_PERSISTED_ROWS)
            : tr.result.rows
          savedResults[tab.id] = { result: { ...tr.result, rows }, cachedAt }
        }
      }

      const toSave = {
        tabs: persistable.map(({ id, title, content, scriptId, scriptScope, loadedVersionId, loadedContent }) => ({
          id, title, content, scriptId, scriptScope, loadedVersionId, loadedContent
        })),
        activeTabId: savedActive,
        tabResults: savedResults
      }

      // BigInt replacer + quota fallback
      const replacer = (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v
      try {
        localStorage.setItem(TABS_LS_KEY, JSON.stringify(toSave, replacer))
      } catch {
        // Quota exceeded — retry without results
        try {
          localStorage.setItem(TABS_LS_KEY, JSON.stringify({ ...toSave, tabResults: {} }, replacer))
        } catch {}
      }
    }, 500)
    return () => { if (saveTabsTimerRef.current) clearTimeout(saveTabsTimerRef.current) }
  }, [tabs, activeTabId, tabResults])

  // ── Load tab meta (version count + run count) ─────────────────────────────

  const refreshMeta = useCallback(async (tabId: string, tab: Tab) => {
    if (!tab.scriptId) return
    const [versions, stats] = await Promise.all([
      window.api.scripts.versions(tab.scriptId),
      window.api.scripts.stats(tab.scriptId)
    ])
    const versionIdx = versions.findIndex((v) => v.id === tab.loadedVersionId)
    const versionNumber = versionIdx >= 0 ? versions.length - versionIdx : versions.length
    setTabMeta((prev) => ({
      ...prev,
      [tabId]: { versionCount: versions.length, currentVersionNumber: versionNumber, runCount: stats.runCount }
    }))
  }, [])

  useEffect(() => {
    if (activeTab?.scriptId) refreshMeta(activeTabId, activeTab)
    if (!activeTab?.scriptId && bottomTab === 'versions') setBottomTab('results')
  }, [activeTabId])

  // ── Open script ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!scriptToOpen) return
    const existing = tabs.find((t) => t.scriptId === scriptToOpen.id)
    if (existing) { setActiveTabId(existing.id); setBottomTab('versions'); onScriptOpened?.(); return }
    window.api.scripts.versions(scriptToOpen.id).then((versions) => {
      const latest = versions[0]
      const content = latest?.content ?? ''
      const id = Date.now().toString()
      const newTab: Tab = {
        id, title: scriptToOpen.name, content,
        scriptId: scriptToOpen.id, scriptScope: scriptToOpen.scope,
        loadedVersionId: latest?.id, loadedContent: content
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(id)
      setBottomTab('versions')
      onScriptOpened?.()
      // Fetch meta for the new tab
      Promise.all([
        Promise.resolve(versions),
        window.api.scripts.stats(scriptToOpen.id)
      ]).then(([v, s]) => {
        setTabMeta((prev) => ({
          ...prev,
          [id]: { versionCount: v.length, currentVersionNumber: v.length > 0 ? 1 : 0, runCount: s.runCount }
        }))
      })
    })
  }, [scriptToOpen])

  // ── Open script + run ─────────────────────────────────────────────────────
  // executeQuery is declared later but captured in the effect's closure at call time (after all renders)

  useEffect(() => {
    if (!scriptToRun) return
    const existing = tabs.find((t) => t.scriptId === scriptToRun.id)
    if (existing) {
      setActiveTabId(existing.id)
      onScriptRun?.()
      executeQuery(existing.content, { tabId: existing.id, tab: existing })
      return
    }
    window.api.scripts.versions(scriptToRun.id).then((versions) => {
      const latest = versions[0]
      const content = latest?.content ?? ''
      const id = Date.now().toString()
      const newTab: Tab = {
        id, title: scriptToRun.name, content,
        scriptId: scriptToRun.id, scriptScope: scriptToRun.scope,
        loadedVersionId: latest?.id, loadedContent: content
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(id)
      onScriptRun?.()
      executeQuery(content, { tabId: id, tab: newTab })
      Promise.all([
        Promise.resolve(versions),
        window.api.scripts.stats(scriptToRun.id)
      ]).then(([v, s]) => {
        setTabMeta((prev) => ({
          ...prev,
          [id]: { versionCount: v.length, currentVersionNumber: v.length > 0 ? 1 : 0, runCount: s.runCount }
        }))
      })
    })
  }, [scriptToRun]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open initial SQL ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!initialSql) return
    const id = Date.now().toString()
    setTabs((prev) => [...prev, { id, title: 'Quick Query', content: initialSql }])
    setActiveTabId(id)
    onInitialSqlConsumed?.()
  }, [initialSql])

  // ── New tab trigger ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!newTabTrigger) return
    const id = Date.now().toString()
    setTabs((prev) => [...prev, { id, title: `Query ${prev.length + 1}`, content: '' }])
    setActiveTabId(id)
    setBottomTab('results')
  }, [newTabTrigger])

  // ── Reset edit state on tab switch ───────────────────────────────────────

  useEffect(() => {
    setEditMode(false)
    setPendingEdits(new Map())
    setEditableTable(null)
    setPkCols([])
  }, [activeTabId])

  // ── Open log tab ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!openLogTrigger) return
    setTabs((prev) => {
      const existing = prev.find((t) => t.isLog)
      if (existing) { setActiveTabId(existing.id); return prev }
      const id = '__log__'
      setActiveTabId(id)
      return [...prev, { id, title: 'Лог запросов', content: '', isLog: true }]
    })
  }, [openLogTrigger])

  // ── Save version ──────────────────────────────────────────────────────────

  const saveCurrentVersion = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab?.scriptId) return
    const version = await window.api.scripts.saveVersion(tab.scriptId, tab.content)
    setTabs((prev) => prev.map((t) =>
      t.id === tabId ? { ...t, loadedVersionId: version.id, loadedContent: tab.content } : t
    ))
    refreshMeta(tabId, { ...tab, loadedVersionId: version.id })
  }, [tabs, refreshMeta])

  // ── Execute query (with optional content + explicit tab context overrides) ──

  const executeQuery = useCallback(async (
    sqlOverride?: string,
    tabContext?: { tabId: string; tab: Tab },
    bypassSafeMode = false
  ) => {
    const tabId = tabContext?.tabId ?? activeTabId
    const tabSnap = tabContext?.tab ?? activeTab
    if (!activeConnectionId || !tabSnap) return

    let sql: string
    if (sqlOverride !== undefined) {
      sql = sqlOverride
    } else {
      sql = tabSnap.content
      if (!tabContext) {
        const editor = editorRef.current
        if (editor) {
          const sel = editor.getSelection()
          if (sel && !sel.isEmpty()) sql = editor.getModel()?.getValueInRange(sel) ?? sql
        }
      }
    }

    // Safe mode check — runs after sql is fully determined
    if (safeMode && !bypassSafeMode) {
      const op = detectWriteOp(sql)
      if (op) { setBlockedOp(op); return }
    }

    setTabResults((prev) => ({ ...prev, [tabId]: { loading: true } }))
    setBottomTab('results')

    try {
      const result = await window.api.query.execute(activeConnectionId, activeDatabase, sql.trim())
      setTabResults((prev) => ({ ...prev, [tabId]: { loading: false, result } }))
      onLastQueryMs?.(result.durationMs)
      if (tabId === activeTabId) {
        setEditableTable(result.columns.length > 0 ? parseEditableTable(sql) : null)
        setEditMode(false)
        setPendingEdits(new Map())
        setPkCols([])
      }

      if (tabSnap.scriptId) {
        const version = await window.api.scripts.saveVersion(tabSnap.scriptId, sqlOverride ?? tabSnap.content)
        setTabs((prev) => prev.map((t) =>
          t.id === tabId ? { ...t, loadedVersionId: version.id, loadedContent: sqlOverride ?? tabSnap.content } : t
        ))
        await window.api.scripts.logRun(tabSnap.scriptId, version.id, activeConnectionId, result.durationMs, result.rowCount)
        refreshMeta(tabId, { ...tabSnap, loadedVersionId: version.id })
      } else {
        window.api.scripts.logAnonRun(sql, activeConnectionId, result.durationMs, result.rowCount)
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      setTabResults((prev) => ({ ...prev, [tabId]: { loading: false, error: errorMsg } }))
      if (tabSnap.scriptId) {
        const hash = simpleHash(sqlOverride ?? tabSnap.content).toString(16)
        await window.api.scripts.logError(tabSnap.scriptId, hash, errorMsg, activeConnectionId)
        refreshMeta(tabId, tabSnap)
      }
    }
  }, [activeConnectionId, activeDatabase, activeTab, activeTabId, onLastQueryMs, refreshMeta])

  // ── Run SQL from history (opens new tab + executes) ──────────────────────

  useEffect(() => {
    if (!runSql) return
    const id = Date.now().toString()
    const sql = runSql
    setTabs((prev) => [...prev, { id, title: 'History Query', content: sql }])
    setActiveTabId(id)
    setBottomTab('results')
    onRunSqlConsumed?.()
    setTimeout(() => executeQuery(sql), 0)
  }, [runSql]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load historical version ───────────────────────────────────────────────

  function handleLoadVersion(version: ScriptVersion) {
    setTabs((prev) => prev.map((t) =>
      t.id === activeTabId
        ? { ...t, content: version.content, loadedVersionId: version.id, loadedContent: version.content }
        : t
    ))
  }

  // ── Load + execute version ────────────────────────────────────────────────

  async function handleLoadAndExecute(version: ScriptVersion) {
    setTabs((prev) => prev.map((t) =>
      t.id === activeTabId
        ? { ...t, content: version.content, loadedVersionId: version.id, loadedContent: version.content }
        : t
    ))
    await executeQuery(version.content)
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────

  const handleEnableEditMode = useCallback(async () => {
    if (!editableTable || !activeConnectionId || !activeDatabase) return
    setEditMode(true)
    const cols = await window.api.schema.columns(activeConnectionId, activeDatabase, editableTable)
    setPkCols(cols.filter((c) => c.key === 'PRI').map((c) => c.name))
  }, [editableTable, activeConnectionId, activeDatabase])

  const handleCellChange = useCallback((rowIdx: number, col: string, value: string | null) => {
    setPendingEdits((prev) => {
      const next = new Map(prev)
      next.set(rowIdx, { ...(next.get(rowIdx) ?? {}), [col]: value })
      return next
    })
  }, [])

  const executeApply = useCallback(async () => {
    if (!activeConnectionId || !editableTable || !activeResult?.result) return
    const rows = activeResult.result.rows
    const sqls: string[] = []

    for (const [rowIdx, edits] of pendingEdits.entries()) {
      if (Object.keys(edits).length === 0) continue
      const originalRow = rows[rowIdx]
      if (!originalRow) continue

      const setClause = Object.entries(edits)
        .map(([col, val]) => `\`${col}\` = ${sqlLiteral(val)}`)
        .join(', ')

      let whereClause: string
      if (pkCols.length > 0) {
        whereClause = pkCols
          .map((pk) => `\`${pk}\` = ${sqlLiteral(originalRow[pk])}`)
          .join(' AND ')
      } else {
        const conditions = Object.entries(originalRow)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([col, v]) => `\`${col}\` = ${sqlLiteral(v)}`)
          .join(' AND ')
        whereClause = conditions || '1=0'
      }

      sqls.push(`UPDATE \`${editableTable}\` SET ${setClause} WHERE ${whereClause} LIMIT 1`)
    }
    if (sqls.length === 0) return

    setTabResults((prev) => ({ ...prev, [activeTabId]: { loading: true } }))
    try {
      for (const sql of sqls) {
        await window.api.query.execute(activeConnectionId, activeDatabase, sql)
      }
      setPendingEdits(new Map())
      setEditMode(false)
      await executeQuery()
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      setTabResults((prev) => ({ ...prev, [activeTabId]: { loading: false, error: errorMsg } }))
    }
  }, [activeConnectionId, activeDatabase, activeResult, activeTabId, editableTable, pkCols, pendingEdits, executeQuery])

  // ── Open diff tab ─────────────────────────────────────────────────────────

  function handleDiffVersions(older: ScriptVersion, newer: ScriptVersion) {
    const id = `diff-${older.id}-${newer.id}`
    if (!tabs.find((t) => t.id === id)) {
      setTabs((prev) => [...prev, {
        id, title: 'Diff', content: '', isDiff: true,
        diffOriginal: older.content, diffModified: newer.content
      }])
    }
    setActiveTabId(id)
  }

  // ── Save anonymous tab as script ─────────────────────────────────────────

  const handleSaveAsScript = useCallback(async (name: string, scope: string) => {
    if (!activeTab) return
    const script = await createScript(name, scope)
    const content = activeTab.content
    const version = await window.api.scripts.saveVersion(script.id, content)
    const tabId = activeTabId
    setTabs((prev) => prev.map((t) =>
      t.id === tabId
        ? { ...t, title: name, scriptId: script.id, scriptScope: scope, loadedVersionId: version.id, loadedContent: content }
        : t
    ))
    setShowSaveModal(false)
    setBottomTab('versions')
    refreshMeta(tabId, { ...activeTab, scriptId: script.id, loadedVersionId: version.id })
  }, [activeTab, activeTabId, refreshMeta, createScript])

  // ── Tab management ────────────────────────────────────────────────────────

  function updateContent(value: string | undefined) {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, content: value ?? '' } : t)))
  }

  function closeTab(id: string) {
    const remaining = tabs.filter((t) => t.id !== id)
    setTabs(remaining)
    if (activeTabId === id && remaining.length > 0) setActiveTabId(remaining[remaining.length - 1].id)
  }

  // ── Monaco mount ──────────────────────────────────────────────────────────

  const executeQueryRef = useRef(executeQuery)
  const saveVersionRef = useRef(() => saveCurrentVersion(activeTabId))
  useEffect(() => { executeQueryRef.current = executeQuery }, [executeQuery])
  useEffect(() => { saveVersionRef.current = () => saveCurrentVersion(activeTabId) }, [saveCurrentVersion, activeTabId])

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.addAction({ id: 'run-query', label: 'Run Query',
      keybindings: [2051], run: () => executeQueryRef.current() })
    editor.addAction({ id: 'save-version', label: 'Save Script Version',
      keybindings: [2083], run: () => saveVersionRef.current() })
    editor.addAction({ id: 'command-palette-custom', label: 'Open Command Palette',
      keybindings: [2096], run: () => onOpenPalette?.() })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-vs-bg min-w-0">
      {/* Tab Bar */}
      <div className="flex items-center bg-vs-tab border-b border-vs-border shrink-0 overflow-x-auto">
        {tabs.map((tab) => {
          const dirty = tab.scriptId != null && tab.content !== tab.loadedContent
          return (
            <div
              key={tab.id}
              onClick={() => { setActiveTabId(tab.id); if (tab.scriptId) setBottomTab('versions') }}
              className={`flex items-center gap-1.5 px-4 h-9 text-sm cursor-pointer shrink-0 border-r border-vs-border
                ${activeTabId === tab.id
                  ? 'bg-vs-tabActive text-vs-text border-t border-t-vs-statusBar'
                  : 'bg-vs-tab text-vs-textDim hover:text-vs-text'
                }`}
            >
              {tab.isDiff && <span className="text-[#ce9178] text-[10px]">⇄</span>}
              <span>{tab.title}</span>
              {dirty && <span className="text-[#e6db74] text-xs" title="Несохранённые изменения">●</span>}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="hover:text-vs-text opacity-60 hover:opacity-100 transition-opacity ml-0.5"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        <button
          onClick={() => {
            const id = Date.now().toString()
            setTabs((prev) => [...prev, { id, title: `Query ${prev.length + 1}`, content: '' }])
            setActiveTabId(id)
            setBottomTab('results')
          }}
          className="px-3 h-9 text-vs-textDim hover:text-vs-text hover:bg-vs-hover shrink-0 text-lg leading-none"
          title="Новый запрос"
        >
          +
        </button>
      </div>

      {activeTab?.isLog ? (
        <div className="flex-1 min-h-0 overflow-hidden"><QueryLogPanel /></div>
      ) : <>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-vs-bg border-b border-vs-border shrink-0">
        {!activeTab?.isDiff && (() => {
          const scopeOk = isScopeExecutable(activeTab?.scriptScope, activeConnectionId, activeDatabase)
          const viewOnly = activeTab?.scriptId != null && !scopeOk
          if (viewOnly) {
            return (
              <span className="flex items-center gap-1.5 text-xs text-[#c09030]">
                <Eye size={13} />
                Режим просмотра — скрипт привязан к другой базе данных
              </span>
            )
          }
          return (
            <button
              onClick={() => executeQuery()}
              disabled={!activeConnectionId}
              title={!activeConnectionId ? 'Нет активного подключения' : 'Выполнить (Ctrl+Enter)'}
              className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={12} />
              Выполнить
            </button>
          )
        })()}


        {isDirty && activeTab?.scriptId && (
          <button
            onClick={() => saveCurrentVersion(activeTabId)}
            title="Сохранить версию (Ctrl+S)"
            className="px-3 py-1 text-xs bg-[#2d5016] hover:bg-[#3a6b1e] text-[#a8cc8c] rounded transition-colors border border-[#4a7c2f]"
          >
            Сохранить версию
          </button>
        )}

        {!activeTab?.scriptId && !activeTab?.isDiff && activeTab?.content.trim() && (
          <button
            onClick={() => setShowSaveModal(true)}
            title="Сохранить как скрипт"
            className="flex items-center gap-1.5 px-3 py-1 text-xs text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors border border-vs-border"
          >
            <Save size={12} />
            Сохранить как скрипт
          </button>
        )}

        {activeDatabases.length > 0 && !activeTab?.isDiff && (
          <select
            value={activeDatabase ?? ''}
            onChange={(e) => setActiveDatabase(e.target.value || null)}
            className="px-2 py-1 text-xs bg-vs-input text-vs-text border border-vs-border rounded outline-none hover:border-vs-statusBar focus:border-vs-statusBar"
          >
            <option value="">-- база данных --</option>
            {activeDatabases.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
        )}

        {!activeConnectionId && (
          <span className="text-xs text-vs-textDim">Нет активного подключения</span>
        )}

        <button
          onClick={() => setSafeMode(!safeMode)}
          title={safeMode ? 'Защита включена — только SELECT. Нажмите чтобы разрешить изменения' : 'Защита отключена — изменения разрешены. Нажмите чтобы включить защиту'}
          className={`ml-auto flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
            safeMode
              ? 'text-[#4ec9b0] hover:bg-vs-hover'
              : 'text-[#f48771] bg-[#f48771]/10 hover:bg-[#f48771]/20'
          }`}
        >
          {safeMode
            ? <><ShieldCheck size={14} /><span className="hidden sm:inline">Защита</span></>
            : <><ShieldOff size={14} /><span className="hidden sm:inline">Без защиты</span></>
          }
        </button>
      </div>

      {/* Script info header */}
      {activeTab?.scriptId && !activeTab.isDiff && (
        <div className="flex items-center gap-3 px-3 h-6 bg-vs-panelHeader border-b border-vs-border shrink-0 text-xs text-vs-textDim">
          <span className="text-vs-text truncate font-medium">{activeTab.title}</span>
          {activeMeta && (
            <>
              <span className="opacity-50">·</span>
              <span className="flex items-center gap-1">
                <GitBranch size={11} className="text-vs-textDim opacity-70" />
                v{activeMeta.currentVersionNumber} из {activeMeta.versionCount}
              </span>
              <span className="opacity-50">·</span>
              <span>{activeMeta.runCount} успешных запусков</span>
              <span className="opacity-50">·</span>
              <span>{scopeLabel(activeTab.scriptScope ?? 'global')}</span>
            </>
          )}
        </div>
      )}

      {/* Editor + Results split */}
      <PanelGroup direction="vertical" className="flex-1 min-h-0">
        <Panel defaultSize={65} minSize={20}>
          {activeTab?.isDiff ? (
            <DiffEditor
              height="100%"
              language="sql"
              theme={monacoTheme}
              original={activeTab.diffOriginal ?? ''}
              modified={activeTab.diffModified ?? ''}
              options={{ fontSize: editorFontSize, fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace", readOnly: true, renderSideBySide: true, minimap: { enabled: false } }}
            />
          ) : (
            <Editor
              height="100%"
              language="sql"
              theme={monacoTheme}
              value={activeTab?.content ?? ''}
              onChange={updateContent}
              onMount={handleEditorMount}
              options={{
                fontSize: editorFontSize,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 12, bottom: 12 }
              }}
            />
          )}
        </Panel>

        <PanelResizeHandle className="h-1 bg-vs-border hover:bg-vs-statusBar transition-colors cursor-row-resize" />

        <Panel defaultSize={35} minSize={15}>
          <div className="flex flex-col h-full bg-vs-bg">
            <div className="flex items-center h-8 bg-vs-panelHeader border-b border-vs-border shrink-0">
              <TabBtn active={bottomTab === 'results'} onClick={() => setBottomTab('results')}>
                Результаты
                {activeResult?.cachedAt && !activeResult.loading && (
                  <span className="ml-1.5 text-[10px] text-vs-textDim opacity-70">
                    кэш · {cachedSince(activeResult.cachedAt)}
                  </span>
                )}
              </TabBtn>
              {activeTab?.scriptId && (
                <TabBtn active={bottomTab === 'versions'} onClick={() => setBottomTab('versions')}>Версии</TabBtn>
              )}
              {editableTable && activeResult?.result && !activeResult.loading && bottomTab === 'results' && (
                <button
                  onClick={editMode
                    ? () => { setEditMode(false); setPendingEdits(new Map()) }
                    : handleEnableEditMode
                  }
                  className={`ml-auto mr-2 flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                    editMode
                      ? 'text-[#e6db74] bg-[#e6db74]/10 hover:bg-[#e6db74]/20'
                      : 'text-vs-textDim hover:text-vs-text hover:bg-vs-hover'
                  }`}
                >
                  <Pencil size={11} />
                  {editMode ? 'Редактирование' : 'Редактировать'}
                </button>
              )}
            </div>
            {editMode && pendingEdits.size > 0 && (
              <div className="flex items-center gap-3 px-3 py-1 bg-[#1e3a1e] border-b border-[#3a6b1e] shrink-0 text-xs">
                <span className="text-[#a8cc8c]">
                  {pendingEdits.size} {pendingEdits.size === 1 ? 'строка изменена' : 'строк изменено'}
                </span>
                <button
                  onClick={executeApply}
                  className="px-3 py-0.5 bg-[#3a6b1e] hover:bg-[#4a7c2f] text-[#a8cc8c] rounded transition-colors border border-[#4a7c2f]"
                >
                  Применить
                </button>
                <button
                  onClick={() => { setPendingEdits(new Map()); setEditMode(false) }}
                  className="px-3 py-0.5 text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors"
                >
                  Отменить
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {bottomTab === 'results' && (
                <ResultsGrid
                  result={activeResult?.result}
                  error={activeResult?.error}
                  loading={activeResult?.loading}
                  editMode={editMode}
                  pkCols={pkCols}
                  pendingEdits={pendingEdits}
                  onCellChange={handleCellChange}
                />
              )}
              {bottomTab === 'versions' && activeTab?.scriptId && (
                <VersionsPanel
                  scriptId={activeTab.scriptId}
                  currentContent={activeTab.content}
                  currentVersionId={activeTab.loadedVersionId}
                  onLoadVersion={handleLoadVersion}
                  onLoadAndExecute={handleLoadAndExecute}
                  onDiffVersions={handleDiffVersions}
                />
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {blockedOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-vs-sidebar border border-vs-border rounded-lg shadow-xl w-[420px] p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck size={22} className="text-[#4ec9b0] shrink-0" />
              <span className="text-vs-text font-semibold">Защита от изменений</span>
            </div>
            <p className="text-sm text-vs-textDim leading-relaxed">
              Запрос содержит операцию{' '}
              <span className="font-mono text-[#f48771] font-bold">{blockedOp}</span>,
              которая изменяет данные. Выполнить этот запрос?
            </p>
            <p className="text-xs text-vs-textDim opacity-60">
              Защита останется включённой для следующих запросов.
              Отключить глобально можно кнопкой щита в тулбаре.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setBlockedOp(null)}
                className="px-4 py-1.5 text-sm text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => { setBlockedOp(null); executeQuery(undefined, undefined, true) }}
                className="px-4 py-1.5 text-sm bg-[#f48771]/20 hover:bg-[#f48771]/30 text-[#f48771] rounded transition-colors border border-[#f48771]/40"
              >
                Выполнить
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <NewScriptModal
          onSave={handleSaveAsScript}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      </>}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 h-full text-xs transition-colors ${
        active ? 'text-vs-text border-t border-t-vs-statusBar bg-vs-bg' : 'text-vs-textDim hover:text-vs-text'
      }`}
    >
      {children}
    </button>
  )
}
