import React, { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import Editor from '@monaco-editor/react'
import { X, Play } from 'lucide-react'

interface Tab {
  id: string
  title: string
  content: string
}

const DEFAULT_SQL = `-- Добро пожаловать в DBStudio
-- Ctrl+Enter — выполнить запрос

SELECT 1 + 1 AS result;
`

export default function EditorArea() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', title: 'Query 1', content: DEFAULT_SQL }
  ])
  const [activeTab, setActiveTab] = useState('1')

  const activeContent = tabs.find((t) => t.id === activeTab)?.content ?? ''

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
          title="Выполнить (Ctrl+Enter)"
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors"
        >
          <Play size={12} />
          Выполнить
        </button>
        <span className="text-xs text-[#555]">Нет активного подключения</span>
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
          <ResultsPane />
        </Panel>
      </PanelGroup>
    </div>
  )
}

function ResultsPane() {
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center px-4 h-8 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#bbb]">Результаты</span>
      </div>
      <div className="flex items-center justify-center flex-1 text-[#555] text-sm selectable">
        Выполните запрос чтобы увидеть результаты
      </div>
    </div>
  )
}
