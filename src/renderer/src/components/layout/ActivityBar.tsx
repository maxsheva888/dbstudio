import React from 'react'
import { Server, FileCode, History } from 'lucide-react'

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
  return (
    <div className="flex flex-col items-center w-12 bg-[#333333] border-r border-[#3c3c3c] shrink-0">
      {items.map((item) => (
        <button
          key={item.id}
          title={item.label}
          onClick={() => onPanelChange(item.id)}
          className={`
            flex items-center justify-center w-12 h-12 mt-1
            text-[#858585] hover:text-[#d4d4d4] transition-colors
            ${activePanel === item.id ? 'text-[#d4d4d4] border-l-2 border-[#007acc]' : 'border-l-2 border-transparent'}
          `}
        >
          {item.icon}
        </button>
      ))}
    </div>
  )
}
