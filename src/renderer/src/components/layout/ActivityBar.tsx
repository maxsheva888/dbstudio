import React, { useState } from 'react'
import { Server, History, ScrollText, Settings } from 'lucide-react'
import SettingsModal from './SettingsModal'

type Panel = 'connections' | 'history'

interface Props {
  activePanel: Panel
  onPanelChange: (panel: Panel) => void
  onOpenLog: () => void
  onOpenDiagram: () => void
}

const items: { id: Panel; icon: React.ReactNode; label: string }[] = [
  { id: 'connections', icon: <Server size={24} />, label: 'Подключения' },
  { id: 'history',     icon: <History size={24} />, label: 'История' }
]

export default function ActivityBar({ activePanel, onPanelChange, onOpenLog, onOpenDiagram }: Props) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <div className="flex flex-col items-center w-12 bg-vs-activityBar border-r border-vs-border shrink-0">
        <div className="flex-1 flex flex-col">
          {items.map((item) => (
            <button
              key={item.id}
              title={item.label}
              onClick={() => onPanelChange(item.id)}
              className={`
                flex items-center justify-center w-12 h-12 mt-1
                text-vs-textDim hover:text-vs-text transition-colors
                ${activePanel === item.id
                  ? 'text-vs-text border-l-2 border-vs-statusBar'
                  : 'border-l-2 border-transparent'
                }
              `}
            >
              {item.icon}
            </button>
          ))}
          <button
            title="Диаграмма схемы"
            onClick={onOpenDiagram}
            className="flex items-center justify-center w-12 h-12 mt-1 text-vs-textDim hover:text-vs-text transition-colors border-l-2 border-transparent"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="10" width="5" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7 4 H9 V12" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            </svg>
          </button>
        </div>
        <button
          title="Лог запросов"
          onClick={onOpenLog}
          className="flex items-center justify-center w-12 h-12 text-vs-textDim hover:text-vs-text transition-colors"
        >
          <ScrollText size={22} />
        </button>
        <button
          title="Настройки"
          onClick={() => setShowSettings(true)}
          className="flex items-center justify-center w-12 h-12 mb-1 text-vs-textDim hover:text-vs-text transition-colors"
        >
          <Settings size={22} />
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )
}

export type { Panel as ActivityPanel }
