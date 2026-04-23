import React from 'react'
import { Server, Database, Table, ChevronRight, ChevronDown, Plus } from 'lucide-react'

type Panel = 'connections' | 'scripts' | 'history'

interface Props {
  activePanel: Panel
}

export default function Sidebar({ activePanel }: Props) {
  return (
    <div className="flex flex-col w-64 bg-[#252526] border-r border-[#3c3c3c] shrink-0 overflow-hidden">
      <PanelHeader title={panelTitle(activePanel)} />
      <div className="flex-1 overflow-y-auto">
        {activePanel === 'connections' && <ConnectionsPanel />}
        {activePanel === 'scripts' && <ScriptsPanel />}
        {activePanel === 'history' && <HistoryPanel />}
      </div>
    </div>
  )
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 h-9 shrink-0">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#bbb]">{title}</span>
      <button
        title="Новое подключение"
        className="text-[#858585] hover:text-[#d4d4d4] transition-colors"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

function ConnectionsPanel() {
  return (
    <div className="px-2">
      <EmptyState text="Нет подключений" sub="Нажмите + чтобы добавить" />
    </div>
  )
}

function ScriptsPanel() {
  return (
    <div className="px-2">
      <EmptyState text="Нет скриптов" sub="Будет добавлено в Фазе 2" />
    </div>
  )
}

function HistoryPanel() {
  return (
    <div className="px-2">
      <EmptyState text="История пуста" sub="Запросы появятся после выполнения" />
    </div>
  )
}

function EmptyState({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-1">
      <span className="text-sm text-[#858585]">{text}</span>
      <span className="text-xs text-[#555]">{sub}</span>
    </div>
  )
}

function panelTitle(panel: Panel): string {
  switch (panel) {
    case 'connections': return 'Подключения'
    case 'scripts':     return 'Скрипты'
    case 'history':     return 'История'
  }
}
