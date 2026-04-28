import React, { useState, useEffect, useCallback } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { ConnectionsProvider } from './context/ConnectionsContext'
import { ScriptsProvider } from './context/ScriptsContext'
import { SettingsProvider } from './context/SettingsContext'
import { TagsProvider } from './context/TagsContext'
import { McpProvider } from './context/McpContext'
import ActivityBar from './components/layout/ActivityBar'
import Sidebar from './components/layout/Sidebar'
import ScriptsBar from './components/layout/ScriptsBar'
import EditorArea from './components/layout/EditorArea'
import StatusBar from './components/layout/StatusBar'
import CommandPalette from './components/layout/CommandPalette'
import type { ActivityPanel } from './components/layout/ActivityBar'
import type { ScriptFile } from '@shared/types'

export default function App() {
  const [activePanel, setActivePanel] = useState<ActivityPanel>('connections')
  const [pendingSql, setPendingSql] = useState<string | undefined>()
  const [scriptToOpen, setScriptToOpen] = useState<ScriptFile | undefined>()
  const [lastQueryMs, setLastQueryMs] = useState<number | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newTabTrigger, setNewTabTrigger] = useState(0)
  const [activeTable, setActiveTable] = useState<string | null>(null)
  const [pendingRunSql, setPendingRunSql] = useState<string | undefined>()
  const [scriptToRun, setScriptToRun] = useState<ScriptFile | undefined>()
  const [openLogTrigger, setOpenLogTrigger] = useState(0)
  const [openDiagramTrigger, setOpenDiagramTrigger] = useState(0)
  const [tableViewToOpen, setTableViewToOpen] = useState<{ connectionId: string; database: string; table: string } | undefined>()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'P' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleTableSelect(connectionId: string, database: string, table: string) {
    setActiveTable(table)
    setTableViewToOpen({ connectionId, database, table })
  }

  const handleOpenScript = useCallback((script: ScriptFile) => {
    setScriptToOpen(script)
  }, [])

  return (
    <SettingsProvider>
      <TagsProvider>
      <ConnectionsProvider>
        <McpProvider>
        <ScriptsProvider>
          <div className="flex flex-col h-screen overflow-hidden bg-vs-bg text-vs-text">
            <div className="flex flex-1 overflow-hidden min-h-0">
              <ActivityBar
                activePanel={activePanel}
                onPanelChange={setActivePanel}
                onOpenLog={() => setOpenLogTrigger((n) => n + 1)}
                onOpenDiagram={() => setOpenDiagramTrigger((n) => n + 1)}
              />
              <PanelGroup direction="horizontal" autoSaveId="dbstudio-layout" className="flex-1 min-w-0">
                <Panel id="left-sidebar" defaultSize={20} minSize={10} maxSize={40} style={{ minWidth: '250px' }}>
                  <Sidebar
                    activePanel={activePanel}
                    onTableSelect={handleTableSelect}
                    onOpenScript={handleOpenScript}
                    onRunScript={(script) => setScriptToRun(script)}
                    onOpenSql={(sql) => setPendingSql(sql)}
                    onRunSql={(sql) => setPendingRunSql(sql)}
                  />
                </Panel>
                <PanelResizeHandle className="w-[1.5px] bg-vs-border hover:bg-vs-statusBar transition-colors cursor-col-resize shrink-0" />
                <Panel id="editor" minSize={30}>
                  <EditorArea
                    initialSql={pendingSql}
                    onInitialSqlConsumed={() => setPendingSql(undefined)}
                    runSql={pendingRunSql}
                    onRunSqlConsumed={() => setPendingRunSql(undefined)}
                    scriptToOpen={scriptToOpen}
                    onScriptOpened={() => setScriptToOpen(undefined)}
                    scriptToRun={scriptToRun}
                    onScriptRun={() => setScriptToRun(undefined)}
                    onLastQueryMs={setLastQueryMs}
                    onOpenPalette={() => setPaletteOpen(true)}
                    newTabTrigger={newTabTrigger}
                    openLogTrigger={openLogTrigger}
                    openDiagramTrigger={openDiagramTrigger}
                    openTableView={tableViewToOpen}
                    onOpenTableViewConsumed={() => setTableViewToOpen(undefined)}
                  />
                </Panel>
                <PanelResizeHandle className="w-[1.5px] bg-vs-border hover:bg-vs-statusBar transition-colors cursor-col-resize shrink-0" />
                <Panel id="right-sidebar" defaultSize={17} minSize={10} maxSize={40} style={{ minWidth: '250px' }}>
                  <ScriptsBar onOpenScript={handleOpenScript} activeTable={activeTable} />
                </Panel>
              </PanelGroup>
            </div>
            <StatusBar lastQueryMs={lastQueryMs} />
          </div>

          {paletteOpen && (
            <CommandPalette
              onClose={() => setPaletteOpen(false)}
              onOpenScript={handleOpenScript}
              onNewTab={() => setNewTabTrigger((n) => n + 1)}
            />
          )}
        </ScriptsProvider>
        </McpProvider>
      </ConnectionsProvider>
      </TagsProvider>
    </SettingsProvider>
  )
}
