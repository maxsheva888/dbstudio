import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { X, Play } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import ResultsGrid from '@renderer/components/results/ResultsGrid'
import VersionsPanel from '@renderer/components/scripts/VersionsPanel'
import type { QueryResult, ScriptFile, ScriptVersion } from '@shared/types'
import type * as Monaco from 'monaco-editor'

// ── Types ────────────────────────────────────────────────────────────────────

interface Tab {
  id: string
  title: string
  content: string
  // Script mode
  scriptId?: string
  loadedVersionId?: number
  loadedContent?: string
  // Diff mode
  isDiff?: boolean
  diffOriginal?: string
  diffModified?: string
}

interface TabResult {
  result?: QueryResult
  error?: string
  loading: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SQL = `-- Добро пожаловать в DBStudio
-- Ctrl+Enter — выполнить запрос
-- Ctrl+S — сохранить версию скрипта

SELECT 1 + 1 AS result;
`

// Simple FNV-like hash for dirty detection in renderer (no crypto needed)
function simpleHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialSql?: string
  onInitialSqlConsumed?: () => void
  scriptToOpen?: ScriptFile
  onScriptOpened?: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditorArea({
  initialSql,
  onInitialSqlConsumed,
  scriptToOpen,
  onScriptOpened
}: Props) {
  const { activeConnectionId, activeDatabases, activeDatabase, setActiveDatabase } = useConnections()
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', title: 'Query 1', content: DEFAULT_SQL }
  ])
  const [activeTabId, setActiveTabId] = useState('1')
  const [tabResults, setTabResults] = useState<Record<string, TabResult>>({})
  const [bottomTab, setBottomTab] = useState<'results' | 'versions'>('results')
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeResult = tabResults[activeTabId]
  const isDirty = activeTab?.scriptId != null &&
    activeTab.content !== activeTab.loadedContent

  // ── Open script from sidebar ───────────────────────────────────────────────

  useEffect(() => {
    if (!scriptToOpen) return
    const existing = tabs.find((t) => t.scriptId === scriptToOpen.id)
    if (existing) {
      setActiveTabId(existing.id)
      onScriptOpened?.()
      return
    }
    window.api.scripts.versions(scriptToOpen.id).then((versions) => {
      const latest = versions[0]
      const content = latest?.content ?? ''
      const id = Date.now().toString()
      setTabs((prev) => [...prev, {
        id,
        title: scriptToOpen.name,
        content,
        scriptId: scriptToOpen.id,
        loadedVersionId: latest?.id,
        loadedContent: content
      }])
      setActiveTabId(id)
      setBottomTab('versions')
      onScriptOpened?.()
    })
  }, [scriptToOpen])

  // ── Open initial SQL (table double-click) ──────────────────────────────────

  useEffect(() => {
    if (!initialSql) return
    const id = Date.now().toString()
    setTabs((prev) => [...prev, { id, title: 'Quick Query', content: initialSql }])
    setActiveTabId(id)
    onInitialSqlConsumed?.()
  }, [initialSql])

  // ── Save version (Ctrl+S) ─────────────────────────────────────────────────

  const saveCurrentVersion = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab?.scriptId) return
    const version = await window.api.scripts.saveVersion(tab.scriptId, tab.content)
    setTabs((prev) => prev.map((t) =>
      t.id === tabId
        ? { ...t, loadedVersionId: version.id, loadedContent: tab.content }
        : t
    ))
  }, [tabs])

  // ── Execute query ─────────────────────────────────────────────────────────

  const executeQuery = useCallback(async () => {
    if (!activeConnectionId || !activeTab) return

    let sql = activeTab.content
    const editor = editorRef.current
    if (editor) {
      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        sql = editor.getModel()?.getValueInRange(selection) ?? sql
      }
    }

    const tabId = activeTabId
    setTabResults((prev) => ({ ...prev, [tabId]: { loading: true } }))

    try {
      const result = await window.api.query.execute(activeConnectionId, activeDatabase, sql.trim())
      setTabResults((prev) => ({ ...prev, [tabId]: { loading: false, result } }))

      // Script mode: save version on successful run + log
      if (activeTab.scriptId) {
        const version = await window.api.scripts.saveVersion(activeTab.scriptId, activeTab.content)
        setTabs((prev) => prev.map((t) =>
          t.id === tabId
            ? { ...t, loadedVersionId: version.id, loadedContent: activeTab.content }
            : t
        ))
        await window.api.scripts.logRun(
          activeTab.scriptId, version.id,
          activeConnectionId,
          result.durationMs,
          result.rowCount
        )
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      setTabResults((prev) => ({ ...prev, [tabId]: { loading: false, error: errorMsg } }))

      // Script mode: log error
      if (activeTab.scriptId) {
        const hash = simpleHash(activeTab.content).toString(16)
        await window.api.scripts.logError(
          activeTab.scriptId, hash, errorMsg, activeConnectionId
        )
      }
    }

    setBottomTab('results')
  }, [activeConnectionId, activeDatabase, activeTab, activeTabId])

  // ── Load historical version ───────────────────────────────────────────────

  function handleLoadVersion(version: ScriptVersion) {
    setTabs((prev) => prev.map((t) =>
      t.id === activeTabId
        ? { ...t, content: version.content, loadedVersionId: version.id, loadedContent: version.content }
        : t
    ))
  }

  // ── Open diff tab ─────────────────────────────────────────────────────────

  function handleDiffVersions(older: ScriptVersion, newer: ScriptVersion) {
    const versionNumbers = () => {
      const all = tabs.find((t) => t.id === activeTabId)
      return all?.title ?? 'Скрипт'
    }
    const id = `diff-${older.id}-${newer.id}`
    if (tabs.find((t) => t.id === id)) {
      setActiveTabId(id)
      return
    }
    setTabs((prev) => [...prev, {
      id,
      title: `Diff: ${versionNumbers()}`,
      content: '',
      isDiff: true,
      diffOriginal: older.content,
      diffModified: newer.content
    }])
    setActiveTabId(id)
  }

  // ── Tab management ────────────────────────────────────────────────────────

  function updateContent(value: string | undefined) {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, content: value ?? '' } : t))
    )
  }

  function closeTab(id: string) {
    const remaining = tabs.filter((t) => t.id !== id)
    setTabs(remaining)
    if (activeTabId === id && remaining.length > 0) {
      setActiveTabId(remaining[remaining.length - 1].id)
    }
  }

  function newTab() {
    const id = Date.now().toString()
    setTabs((prev) => [...prev, { id, title: `Query ${prev.length + 1}`, content: '' }])
    setActiveTabId(id)
    setBottomTab('results')
  }

  // ── Monaco mount ──────────────────────────────────────────────────────────

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [2051], // Ctrl+Enter
      run: () => { executeQuery() }
    })
    editor.addAction({
      id: 'save-version',
      label: 'Save Script Version',
      keybindings: [2083], // Ctrl+S
      run: () => { saveCurrentVersion(activeTabId) }
    })
  }

  // ── Switch to versions panel when script tab is active ────────────────────

  useEffect(() => {
    if (!activeTab?.scriptId && bottomTab === 'versions') {
      setBottomTab('results')
    }
  }, [activeTabId])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#1e1e1e]">
      {/* Tab Bar */}
      <div className="flex items-center bg-[#2d2d2d] border-b border-[#3c3c3c] shrink-0 overflow-x-auto">
        {tabs.map((tab) => {
          const dirty = tab.scriptId != null && tab.content !== tab.loadedContent
          return (
            <div
              key={tab.id}
              onClick={() => { setActiveTabId(tab.id); if (tab.scriptId) setBottomTab('versions') }}
              className={`
                flex items-center gap-1.5 px-4 h-9 text-sm cursor-pointer shrink-0 border-r border-[#3c3c3c]
                ${activeTabId === tab.id
                  ? 'bg-[#1e1e1e] text-[#d4d4d4] border-t border-t-[#007acc]'
                  : 'bg-[#2d2d2d] text-[#858585] hover:text-[#d4d4d4]'
                }
              `}
            >
              {tab.isDiff && <span className="text-[#ce9178] text-[10px]">⇄</span>}
              <span>{tab.title}</span>
              {dirty && <span className="text-[#e6db74] text-xs leading-none" title="Несохранённые изменения">●</span>}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="hover:text-white opacity-60 hover:opacity-100 transition-opacity ml-0.5"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        <button
          onClick={newTab}
          className="px-3 h-9 text-[#858585] hover:text-[#d4d4d4] hover:bg-[#2a2d2e] shrink-0 text-lg leading-none"
          title="Новый запрос"
        >
          +
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-[#1e1e1e] border-b border-[#3c3c3c] shrink-0">
        {!activeTab?.isDiff && (
          <button
            onClick={executeQuery}
            disabled={!activeConnectionId}
            title="Выполнить (Ctrl+Enter)"
            className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={12} />
            Выполнить
          </button>
        )}

        {isDirty && activeTab?.scriptId && (
          <button
            onClick={() => saveCurrentVersion(activeTabId)}
            title="Сохранить версию (Ctrl+S)"
            className="px-3 py-1 text-xs bg-[#2d5016] hover:bg-[#3a6b1e] text-[#a8cc8c] rounded transition-colors border border-[#4a7c2f]"
          >
            Сохранить версию
          </button>
        )}

        {activeDatabases.length > 0 && !activeTab?.isDiff && (
          <select
            value={activeDatabase ?? ''}
            onChange={(e) => setActiveDatabase(e.target.value || null)}
            className="px-2 py-1 text-xs bg-[#3c3c3c] text-[#d4d4d4] border border-[#555] rounded outline-none hover:border-[#007acc] focus:border-[#007acc]"
          >
            <option value="">-- база данных --</option>
            {activeDatabases.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
        )}

        {!activeConnectionId && (
          <span className="text-xs text-[#555]">Нет активного подключения</span>
        )}
      </div>

      {/* Editor + Results split */}
      <PanelGroup direction="vertical" className="flex-1">
        <Panel defaultSize={65} minSize={20}>
          {activeTab?.isDiff ? (
            <DiffEditor
              height="100%"
              language="sql"
              theme="vs-dark"
              original={activeTab.diffOriginal ?? ''}
              modified={activeTab.diffModified ?? ''}
              options={{
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false }
              }}
            />
          ) : (
            <Editor
              height="100%"
              language="sql"
              theme="vs-dark"
              value={activeTab?.content ?? ''}
              onChange={updateContent}
              onMount={handleEditorMount}
              options={{
                fontSize: 14,
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

        <PanelResizeHandle className="h-1 bg-[#3c3c3c] hover:bg-[#007acc] transition-colors cursor-row-resize" />

        <Panel defaultSize={35} minSize={15}>
          <div className="flex flex-col h-full bg-[#1e1e1e]">
            {/* Bottom panel tab bar */}
            <div className="flex items-center h-8 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
              <TabBtn active={bottomTab === 'results'} onClick={() => setBottomTab('results')}>
                Результаты
              </TabBtn>
              {activeTab?.scriptId && (
                <TabBtn active={bottomTab === 'versions'} onClick={() => setBottomTab('versions')}>
                  Версии
                </TabBtn>
              )}
            </div>

            {/* Bottom panel content */}
            <div className="flex-1 overflow-hidden">
              {bottomTab === 'results' && (
                <ResultsGrid
                  result={activeResult?.result}
                  error={activeResult?.error}
                  loading={activeResult?.loading}
                />
              )}
              {bottomTab === 'versions' && activeTab?.scriptId && (
                <VersionsPanel
                  scriptId={activeTab.scriptId}
                  currentContent={activeTab.content}
                  currentVersionId={activeTab.loadedVersionId}
                  onLoadVersion={handleLoadVersion}
                  onDiffVersions={handleDiffVersions}
                />
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 h-full text-xs transition-colors ${
        active
          ? 'text-[#d4d4d4] border-t border-t-[#007acc] bg-[#1e1e1e]'
          : 'text-[#858585] hover:text-[#d4d4d4]'
      }`}
    >
      {children}
    </button>
  )
}
