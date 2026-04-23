import React, { useState, useEffect, useCallback } from 'react'
import { ConnectionsProvider } from './context/ConnectionsContext'
import { ScriptsProvider } from './context/ScriptsContext'
import { SettingsProvider } from './context/SettingsContext'
import ActivityBar from './components/layout/ActivityBar'
import Sidebar from './components/layout/Sidebar'
import EditorArea from './components/layout/EditorArea'
import StatusBar from './components/layout/StatusBar'
import CommandPalette from './components/layout/CommandPalette'
import type { ScriptFile } from '@shared/types'

type Panel = 'connections' | 'scripts' | 'history'

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>('connections')
  const [pendingSql, setPendingSql] = useState<string | undefined>()
  const [scriptToOpen, setScriptToOpen] = useState<ScriptFile | undefined>()
  const [lastQueryMs, setLastQueryMs] = useState<number | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newTabTrigger, setNewTabTrigger] = useState(0)

  // Global Ctrl+Shift+P listener
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

  function handleTableSelect(database: string, table: string) {
    setPendingSql(`SELECT *\nFROM \`${database}\`.\`${table}\`\nLIMIT 100;`)
  }

  function handleOpenScript(script: ScriptFile) {
    setScriptToOpen(script)
    setActivePanel('connections') // keep sidebar visible
  }

  const handlePaletteOpenScript = useCallback((script: ScriptFile) => {
    setScriptToOpen(script)
  }, [])

  return (
    <SettingsProvider>
      <ConnectionsProvider>
        <ScriptsProvider>
          <div className="flex flex-col h-screen overflow-hidden bg-vs-bg text-vs-text">
            <div className="flex flex-1 overflow-hidden">
              <ActivityBar activePanel={activePanel} onPanelChange={setActivePanel} />
              <Sidebar
                activePanel={activePanel}
                onTableSelect={handleTableSelect}
                onOpenScript={handleOpenScript}
              />
              <EditorArea
                initialSql={pendingSql}
                onInitialSqlConsumed={() => setPendingSql(undefined)}
                scriptToOpen={scriptToOpen}
                onScriptOpened={() => setScriptToOpen(undefined)}
                onLastQueryMs={setLastQueryMs}
                onOpenPalette={() => setPaletteOpen(true)}
                newTabTrigger={newTabTrigger}
              />
            </div>
            <StatusBar lastQueryMs={lastQueryMs} />
          </div>

          {paletteOpen && (
            <CommandPalette
              onClose={() => setPaletteOpen(false)}
              onOpenScript={handlePaletteOpenScript}
              onNewTab={() => { setNewTabTrigger((n) => n + 1) }}
            />
          )}
        </ScriptsProvider>
      </ConnectionsProvider>
    </SettingsProvider>
  )
}
