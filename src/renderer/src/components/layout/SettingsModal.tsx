import React from 'react'
import { Sun, Moon, X } from 'lucide-react'
import { useSettings } from '@renderer/context/SettingsContext'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const { theme, setTheme, editorFontSize, setEditorFontSize } = useSettings()

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-96 bg-vs-sidebar border border-vs-border rounded shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-vs-border">
          <span className="text-sm font-semibold text-vs-text">Настройки</span>
          <button onClick={onClose} className="text-vs-textDim hover:text-vs-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-5">
          {/* Theme */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-vs-textDim">
              Тема
            </label>
            <div className="flex gap-2">
              <ThemeBtn
                active={theme === 'dark'}
                icon={<Moon size={14} />}
                label="Тёмная"
                onClick={() => setTheme('dark')}
              />
              <ThemeBtn
                active={theme === 'light'}
                icon={<Sun size={14} />}
                label="Светлая"
                onClick={() => setTheme('light')}
              />
            </div>
          </div>

          {/* Font size */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-vs-textDim">
              Размер шрифта редактора: <span className="text-[#9cdcfe] normal-case font-normal">{editorFontSize}px</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={22}
                step={1}
                value={editorFontSize}
                onChange={(e) => setEditorFontSize(Number(e.target.value))}
                className="flex-1 accent-[#007acc]"
              />
              <div className="flex gap-1">
                {[12, 14, 16, 18].map((size) => (
                  <button
                    key={size}
                    onClick={() => setEditorFontSize(size)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      editorFontSize === size
                        ? 'bg-[#007acc] text-white'
                        : 'bg-vs-input text-vs-textDim hover:text-vs-text'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-vs-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-[#0e7490] hover:bg-[#0c6478] text-white rounded transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}

function ThemeBtn({
  active, icon, label, onClick
}: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded border text-sm transition-colors ${
        active
          ? 'bg-[#007acc] text-white border-[#007acc]'
          : 'bg-vs-input text-vs-textDim border-vs-border hover:text-vs-text hover:border-vs-textDim'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
