import React, { useState } from 'react'
import { Server, FileCode, History, Settings } from 'lucide-react'
import SettingsModal from './SettingsModal'

type Panel = 'connections' | 'scripts' | 'history'

interface Props {
  activePanel: Panel
  onPanelChange: (panel: Panel) => void
}

const items: { id: Panel; icon: React.ReactNode; label: string }[] = [
  { id: 'connections', icon: <Server size={24} />, label: 'Подключения' },
  { id: 'scripts',     icon: <FileCode size={24} />, label: 'Скрипты' },
  { id: 'history',     icon: <History size={24} />, label: 'История' }
]

export default function ActivityBar({ activePanel, onPanelChange }: Props) {
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
        </div>

        {/* Settings at bottom */}
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
