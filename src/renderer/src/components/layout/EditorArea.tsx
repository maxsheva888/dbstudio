import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import Editor, { type OnMount } from '@monaco-editor/react'
import { X, Play } from 'lucide-react'
import { useConnections } from '@renderer/context/ConnectionsContext'
import ResultsGrid from '@renderer/components/results/ResultsGrid'
import type { QueryResult } from '@shared/types'
import type * as Monaco from 'monaco-editor'

interface Tab {
  id: string
  title: string
  content: string
}

interface TabResult {
  result?: QueryResult
  error?: string
  loading: boolean
}

const DEFAULT_SQL = `-- Добро пожаловать в DBStudio
-- Ctrl+Enter — выполнить запрос

SELECT 1 + 1 AS result;
`

interface Props {
  initialSql?: string
  onInitialSqlConsumed?: () => void
}

export default function EditorArea({ initialSql, onInitialSqlConsumed }: Props) {
  const { activeConnectionId, activeDatabases, activeDatabase, setActiveDatabase } = useConnections()
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', title: 'Query 1', content: DEFAULT_SQL }
  ])
  const [activeTab, setActiveTab] = useState('1')
  const [tabResults, setTabResults] = useState<Record<string, TabResult>>({})
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const activeContent = tabs.find((t) => t.id === activeTab)?.content ?? ''
  const activeResult = tabResults[activeTab]

  function updateContent(value: string | undefined) {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTab ? { ...t, content: value ?? '' } : t))
    )
  }

  function closeTab(id: string) {
    const remaining = tabs.filter((t) => t.id !== id)
    setTabs(remaining)
    if (activeTab === id && remaining.length > 0) {
      setActiveTab(remaining[remaining.length - 1].id)
    }
  }

  function newTab() {
    const id = Date.now().toString()
    setTabs((prev) => [...prev, { id, title: `Query ${prev.length + 1}`, content: '' }])
    setActiveTab(id)
  }

  const executeQuery = useCallback(async () => {
    if (!activeConnectionId) return

    const editor = editorRef.current
    let sql = activeContent

    if (editor) {
      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        sql = editor.getModel()?.getValueInRange(selection) ?? sql
      }
    }

    const tabId = activeTab
    setTabResults((prev) => ({ ...prev, [tabId]: { loading: true } }))

    try {
      const result = await window.api.query.execute(activeConnectionId, activeDatabase, sql.trim())
      setTabResults((prev) => ({ ...prev, [tabId]: { loading: false, result } }))
    } catch (e) {
      setTabResults((prev) => ({
        ...prev,
        [tabId]: { loading: false, error: e instanceof Error ? e.message : String(e) }
      }))
    }
  }, [activeConnectionId, activeDatabase, activeContent, activeTab])

  useEffect(() => {
    if (!initialSql) return
    const id = Date.now().toString()
    setTabs((prev) => [...prev, { id, title: 'Quick Query', content: initialSql }])
    setActiveTab(id)
    onInitialSqlConsumed?.()
  }, [initialSql])

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [2051], // Ctrl+Enter = KeyCode.Enter (3) | CtrlCmd (2048) = 2051
      run: () => { executeQuery() }
    })
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#1e1e1e]">
      {/* Tab Bar */}
      <div className="flex items-center bg-[#2d2d2d] border-b border-[#3c3c3c] shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 h-9 text-sm cursor-pointer shrink-0 border-r border-[#3c3c3c]
              ${activeTab === tab.id
                ? 'bg-[#1e1e1e] text-[#d4d4d4] border-t border-t-[#007acc]'
                : 'bg-[#2d2d2d] text-[#858585] hover:text-[#d4d4d4]'
              }
            `}
          >
            <span>{tab.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              className="hover:text-white opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}
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
        <button
          onClick={executeQuery}
          disabled={!activeConnectionId}
          title="Выполнить (Ctrl+Enter)"
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play size={12} />
          Выполнить
        </button>

        {/* Database selector */}
        {activeDatabases.length > 0 && (
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
          <Editor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={activeContent}
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
        </Panel>

        <PanelResizeHandle className="h-1 bg-[#3c3c3c] hover:bg-[#007acc] transition-colors cursor-row-resize" />

        <Panel defaultSize={35} minSize={15}>
          <div className="flex flex-col h-full bg-[#1e1e1e]">
            <div className="flex items-center px-4 h-8 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#bbb]">Результаты</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <ResultsGrid
                result={activeResult?.result}
                error={activeResult?.error}
                loading={activeResult?.loading}
              />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
