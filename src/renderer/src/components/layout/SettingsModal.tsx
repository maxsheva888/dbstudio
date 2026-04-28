import React, { useState, useCallback } from 'react'
import { Sun, Moon, X, Copy, Check } from 'lucide-react'
import { useSettings } from '@renderer/context/SettingsContext'
import { useMcp } from '@renderer/context/McpContext'
import { LANGUAGES } from '@renderer/i18n'

interface Props {
  onClose: () => void
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])
  return (
    <button onClick={copy} title="Копировать" className="shrink-0 text-vs-textDim hover:text-vs-text transition-colors">
      {copied ? <Check size={11} className="text-[#4ec9b0]" /> : <Copy size={11} />}
    </button>
  )
}

export default function SettingsModal({ onClose }: Props) {
  const { theme, setTheme, editorFontSize, setEditorFontSize, mcpPort, setMcpPort, language, setLanguage } = useSettings()
  const { serverRunning, serverPort, activeSession, restartServer } = useMcp()
  const [portInput, setPortInput] = useState(String(mcpPort))
  const [portError, setPortError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)

  const applyPort = useCallback(async () => {
    const p = parseInt(portInput, 10)
    if (isNaN(p) || p < 1024 || p > 65535) {
      setPortError('Порт должен быть от 1024 до 65535')
      return
    }
    setPortError(null)
    setRestarting(true)
    const result = await restartServer(p)
    setRestarting(false)
    if (result.success) {
      setMcpPort(p)
    } else {
      setPortError(result.error ?? 'Не удалось запустить сервер')
    }
  }, [portInput, restartServer, setMcpPort])

  const cliCmd = `claude mcp add --transport http dbstudio http://localhost:${mcpPort}/mcp`
  const jsonSnippet = `"mcpServers": {\n  "dbstudio": {\n    "type": "http",\n    "url": "http://localhost:${mcpPort}/mcp"\n  }\n}`

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[460px] bg-vs-sidebar border border-vs-border rounded shadow-2xl">
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

          {/* Language */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-vs-textDim">
              Language / Язык / Język
            </label>
            <div className="flex gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded border text-sm transition-colors ${
                    language === lang.code
                      ? 'bg-[#007acc] text-white border-[#007acc]'
                      : 'bg-vs-input text-vs-textDim border-vs-border hover:text-vs-text hover:border-vs-textDim'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
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

          {/* MCP Server */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-vs-textDim">
              MCP Server
            </label>

            {/* Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`w-2 h-2 rounded-full shrink-0 ${serverRunning ? 'bg-[#4ec9b0]' : 'bg-[#f48771]'}`} />
              <span className="text-xs text-vs-textDim">
                {serverRunning ? `Запущен · порт ${serverPort}` : 'Остановлен'}
              </span>
              {!serverRunning && (
                <button
                  onClick={applyPort}
                  disabled={restarting}
                  className="text-xs text-[#569cd6] hover:underline disabled:opacity-50"
                >
                  {restarting ? 'Запуск...' : 'Запустить'}
                </button>
              )}
              {activeSession && (
                <span className="text-xs font-mono text-[#c586c0] ml-auto truncate max-w-[160px]">
                  🔌 {activeSession.database}
                </span>
              )}
            </div>
            {!serverRunning && (
              <div className="text-[10px] text-[#f48771]">
                Порт {mcpPort} занят другим процессом или произошла ошибка запуска. Измените порт или нажмите «Запустить».
              </div>
            )}

            {/* Port */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-vs-textDim shrink-0">Порт:</label>
              <input
                type="number"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyPort()}
                min={1024}
                max={65535}
                className="w-20 px-2 py-1 text-xs bg-vs-input border border-vs-border rounded text-vs-text outline-none focus:border-[#007acc]"
              />
              <button
                onClick={applyPort}
                disabled={restarting}
                className="px-2 py-1 text-xs bg-vs-input border border-vs-border rounded text-vs-textDim hover:text-vs-text hover:border-vs-textDim transition-colors disabled:opacity-50"
              >
                {restarting ? 'Применяю...' : serverRunning ? 'Перезапустить' : 'Запустить'}
              </button>
              {portError && <span className="text-xs text-[#f48771] flex-1">{portError}</span>}
            </div>

            {/* Claude Code instructions */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-vs-textDim">Как добавить в Claude Code:</span>

              <div className="flex items-center gap-2 bg-vs-input rounded p-2 border border-vs-border">
                <code className="text-[10px] font-mono text-vs-text flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {cliCmd}
                </code>
                <CopyButton text={cliCmd} />
              </div>

              <div className="text-[10px] text-vs-textDim">Или вручную в <code className="font-mono">~/.claude/settings.json</code>:</div>
              <div className="relative bg-vs-input rounded p-2 border border-vs-border">
                <pre className="text-[10px] font-mono text-vs-text overflow-auto leading-relaxed">{jsonSnippet}</pre>
                <div className="absolute top-2 right-2">
                  <CopyButton text={jsonSnippet} />
                </div>
              </div>

              <div className="text-[10px] text-vs-textDim leading-relaxed">
                После добавления перезапустите Claude Code. Перед использованием включите MCP на нужной базе в левом дереве.
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
