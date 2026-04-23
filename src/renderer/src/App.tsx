import React, { useState } from 'react'
import { ConnectionsProvider } from './context/ConnectionsContext'
import ActivityBar from './components/layout/ActivityBar'
import Sidebar from './components/layout/Sidebar'
import EditorArea from './components/layout/EditorArea'
import StatusBar from './components/layout/StatusBar'

type Panel = 'connections' | 'scripts' | 'history'

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>('connections')

  return (
    <ConnectionsProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-[#1e1e1e] text-[#d4d4d4]">
        <div className="flex flex-1 overflow-hidden">
          <ActivityBar activePanel={activePanel} onPanelChange={setActivePanel} />
          <Sidebar activePanel={activePanel} />
          <EditorArea />
        </div>
        <StatusBar />
      </div>
    </ConnectionsProvider>
  )
}
