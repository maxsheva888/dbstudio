import React from 'react'
import { useTranslation } from 'react-i18next'
import ScriptPanel from '@renderer/components/scripts/ScriptPanel'
import type { ScriptFile } from '@shared/types'

interface Props {
  onOpenScript: (script: ScriptFile) => void
  activeTable?: string | null
}

export default function ScriptsBar({ onOpenScript, activeTable }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col h-full bg-vs-sidebar border-l border-vs-border overflow-hidden">
      <div className="flex items-center px-4 h-9 shrink-0 border-b border-vs-border">
        <span className="text-xs font-semibold uppercase tracking-widest text-vs-textDim">{t('scripts.title')}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScriptPanel onOpenScript={onOpenScript} activeTable={activeTable} />
      </div>

    </div>
  )
}
