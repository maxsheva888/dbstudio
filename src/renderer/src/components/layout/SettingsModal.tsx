import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@renderer/context/SettingsContext'
import { useMcp } from '@renderer/context/McpContext'
import { LANGUAGES } from '@renderer/i18n'

interface Props {
  onClose: () => void
  initialSection?: string
}

// ── Icons ─────────────────────────────────────────────────────────────
function SIcon({ name, size = 14, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none' as const }
  switch (name) {
    case 'gear':
      return <svg {...p}><circle cx="8" cy="8" r="2.5" stroke={color} strokeWidth="1.3"/><path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" stroke={color} strokeWidth="1.3" strokeLinecap="round"/></svg>
    case 'palette':
      return <svg {...p}><path d="M8 2C4.5 2 2 4.5 2 8c0 3 2 5 4.5 5 1 0 1.5-.5 1.5-1.5C8 10.5 8.5 10 9.5 10H11c1.5 0 2.5-1 2.5-2.5C13.5 4.5 11 2 8 2z" stroke={color} strokeWidth="1.3"/><circle cx="5" cy="6" r=".8" fill={color}/><circle cx="8" cy="4.5" r=".8" fill={color}/><circle cx="11" cy="6.5" r=".8" fill={color}/></svg>
    case 'code':
      return <svg {...p}><path d="M5 4L2 8l3 4M11 4l3 4-3 4M9.5 3l-3 10" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'keyboard':
      return <svg {...p}><rect x="1.5" y="4" width="13" height="8" rx="1" stroke={color} strokeWidth="1.3"/><path d="M3.5 7H4M5.5 7H6M7.5 7H8M9.5 7H10M11.5 7H12M3.5 9.5H4M5.5 9.5H10M11.5 9.5H12" stroke={color} strokeWidth="1.3" strokeLinecap="round"/></svg>
    case 'server':
      return <svg {...p}><rect x="2" y="3" width="12" height="4" rx="1" stroke={color} strokeWidth="1.3"/><rect x="2" y="9" width="12" height="4" rx="1" stroke={color} strokeWidth="1.3"/><circle cx="4.5" cy="5" r=".6" fill={color}/><circle cx="4.5" cy="11" r=".6" fill={color}/></svg>
    case 'spark':
      return <svg {...p}><path d="M8 2L9.5 6.5 14 8 9.5 9.5 8 14 6.5 9.5 2 8 6.5 6.5Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/></svg>
    case 'refresh':
      return <svg {...p}><path d="M13 4V7H10M3 12V9H6M3 7C4 4.5 6 3 8.5 3c2.2 0 4 1.4 4.5 3.5M13 9c-1 2.5-3 4-5.5 4-2.2 0-4-1.4-4.5-3.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'shield':
      return <svg {...p}><path d="M8 1.5L13 3.5V8c0 3-2.5 5.5-5 6.5-2.5-1-5-3.5-5-6.5V3.5Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/></svg>
    case 'info':
      return <svg {...p}><circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.3"/><path d="M8 7v4.5M8 5v.5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>
    case 'copy':
      return <svg {...p}><rect x="4" y="4" width="9" height="9" rx="1" stroke={color} strokeWidth="1.3"/><path d="M3 11V4a1 1 0 011-1h6" stroke={color} strokeWidth="1.3"/></svg>
    case 'check':
      return <svg {...p}><path d="M3 8.5L6.5 12 13 4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'search':
      return <svg {...p}><circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.3"/><path d="M10.5 10.5L13 13" stroke={color} strokeWidth="1.3" strokeLinecap="round"/></svg>
    default:
      return <svg {...p}><rect x="3" y="3" width="10" height="10" rx="1" stroke={color} strokeWidth="1.3"/></svg>
  }
}

// ── Setting row ───────────────────────────────────────────────────────
function SRow({ label, hint, children, span = false }: {
  label: string
  hint?: string
  children: React.ReactNode
  span?: boolean
}) {
  return (
    <div className={`py-3.5 border-b border-vs-border last:border-b-0 ${span ? '' : 'flex items-start justify-between gap-6'}`}>
      <div className={span ? '' : 'flex-1 min-w-0'}>
        <div className="text-xs font-medium text-vs-text">{label}</div>
        {hint && <div className="text-2xs text-vs-textDim mt-1 leading-relaxed">{hint}</div>}
        {span && <div className="mt-3">{children}</div>}
      </div>
      {!span && <div className="shrink-0 flex items-center">{children}</div>}
    </div>
  )
}

// ── Copy button ───────────────────────────────────────────────────────
function SCopy({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const doCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }, [text])
  return (
    <button
      onClick={doCopy}
      title={t('common.copy')}
      className="w-6 h-6 flex items-center justify-center text-vs-textDim hover:text-vs-text transition-colors"
    >
      {copied ? <SIcon name="check" size={11} color="#4ec9b0" /> : <SIcon name="copy" size={11} />}
    </button>
  )
}

function SCodeBox({ value }: { value: string }) {
  return (
    <div className="relative bg-vs-bg border border-vs-border rounded p-2.5 font-mono text-2xs text-vs-text whitespace-pre overflow-auto leading-relaxed">
      {value}
      <div className="absolute top-1.5 right-1.5 bg-vs-bg">
        <SCopy text={value} />
      </div>
    </div>
  )
}

// ── Section: General ──────────────────────────────────────────────────
function SecGeneral() {
  const { t } = useTranslation()
  const { language, setLanguage } = useSettings()
  return (
    <SRow label={t('settings.langLabel')} hint={t('settings.langHint')}>
      <div className="flex gap-2">
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors ${
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
    </SRow>
  )
}

// ── Section: Appearance ───────────────────────────────────────────────
function SecAppearance() {
  const { t } = useTranslation()
  const { theme, setTheme } = useSettings()

  const themes = [
    { id: 'dark' as const, label: t('settings.themeDark'), bg: '#1e1e1e', stripe: '#3c3c3c' },
    { id: 'light' as const, label: t('settings.themeLight'), bg: '#fafafa', stripe: '#e0e0e0' },
  ]

  return (
    <SRow label={t('settings.theme')} span>
      <div className="flex gap-3">
        {themes.map(th => {
          const active = theme === th.id
          return (
            <button
              key={th.id}
              onClick={() => setTheme(th.id)}
              style={{
                width: 134,
                padding: 4,
                background: 'transparent',
                border: `2px solid ${active ? '#007acc' : 'var(--vs-border)'}`,
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                transition: 'border-color 120ms',
              }}
            >
              <div style={{ height: 60, borderRadius: 3, background: th.bg, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 7, left: 7, width: 38, height: 4, borderRadius: 1, background: th.stripe }} />
                <div style={{ position: 'absolute', top: 16, left: 7, width: 26, height: 3, borderRadius: 1, background: th.stripe, opacity: 0.6 }} />
                <div style={{ position: 'absolute', bottom: 8, left: 7, width: 28, height: 8, borderRadius: 2, background: '#007acc' }} />
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 4px',
                color: active ? 'var(--vs-text)' : 'var(--vs-text-dim)',
                fontSize: 11, fontWeight: 500,
              }}>
                {th.label}
                {active && <SIcon name="check" size={12} color="#007acc" />}
              </div>
            </button>
          )
        })}
      </div>
    </SRow>
  )
}

// ── Section: Editor ───────────────────────────────────────────────────
function SecEditor() {
  const { t } = useTranslation()
  const { editorFontSize, setEditorFontSize } = useSettings()

  return (
    <SRow label={t('settings.editorFontSize')}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={10}
          max={22}
          step={1}
          value={editorFontSize}
          onChange={e => setEditorFontSize(Number(e.target.value))}
          className="w-32 accent-[#007acc]"
        />
        <span className="min-w-[32px] text-center px-2 py-0.5 bg-vs-input border border-vs-border rounded text-2xs font-mono text-vs-text">
          {editorFontSize}
        </span>
        <div className="flex gap-1">
          {[12, 14, 16, 18].map(size => (
            <button
              key={size}
              onClick={() => setEditorFontSize(size)}
              className={`px-1.5 py-0.5 text-2xs rounded transition-colors ${
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
    </SRow>
  )
}

// ── Section: MCP Server ───────────────────────────────────────────────
function SecMCP() {
  const { t } = useTranslation()
  const { mcpPort, setMcpPort } = useSettings()
  const { serverRunning, serverPort, activeSessions, restartServer } = useMcp()
  const [portInput, setPortInput] = useState(String(mcpPort))
  const [portError, setPortError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)

  const applyPort = useCallback(async () => {
    const p = parseInt(portInput, 10)
    if (isNaN(p) || p < 1024 || p > 65535) {
      setPortError(t('settings.mcpPortError'))
      return
    }
    setPortError(null)
    setRestarting(true)
    const result = await restartServer(p)
    setRestarting(false)
    if (result.success) setMcpPort(p)
    else setPortError(result.error ?? t('settings.mcpPortBusy', { port: p }))
  }, [portInput, restartServer, setMcpPort, t])

  const cliCmd = `claude mcp add --transport http dbstudio http://localhost:${mcpPort}/mcp`
  const jsonSnippet = `"mcpServers": {\n  "dbstudio": {\n    "type": "http",\n    "url": "http://localhost:${mcpPort}/mcp"\n  }\n}`

  return (
    <>
      {/* Status block */}
      <div className={`flex items-center gap-3 p-3 mb-1 rounded border ${
        serverRunning ? 'bg-[#4ec9b0]/[0.06] border-[#4ec9b0]/30' : 'bg-[#f48771]/[0.06] border-[#f48771]/30'
      }`}>
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: serverRunning ? '#4ec9b0' : '#f48771',
            boxShadow: serverRunning ? '0 0 0 3px rgba(78,201,176,0.18)' : 'none',
          }}
        />
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium ${serverRunning ? 'text-[#4ec9b0]' : 'text-[#f48771]'}`}>
            {serverRunning ? t('settings.mcpRunning', { port: serverPort }) : t('settings.mcpStopped')}
          </div>
          <div className="text-2xs text-vs-textDim mt-0.5 font-mono truncate">
            http://localhost:{mcpPort}/mcp
          </div>
        </div>
        {activeSessions.length > 0 && (
          <span className="text-2xs font-mono text-[#c586c0] shrink-0 truncate max-w-[140px]">
            🔌 {activeSessions.flatMap((s) => s.databases.map((d) => d.database)).join(', ')}
          </span>
        )}
        {!serverRunning && (
          <button
            onClick={applyPort}
            disabled={restarting}
            className="px-3 h-7 text-2xs bg-[#007acc] text-white rounded hover:bg-[#0069b0] disabled:opacity-50 transition-colors shrink-0"
          >
            {restarting ? t('settings.mcpStarting') : t('settings.mcpStart')}
          </button>
        )}
      </div>

      {/* Port */}
      <SRow label={t('settings.mcpPort')}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={portInput}
            min={1024}
            max={65535}
            onChange={e => setPortInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyPort()}
            className="w-20 px-2 h-7 text-xs bg-vs-input border border-vs-border rounded text-vs-text outline-none focus:border-[#007acc]"
          />
          <button
            onClick={applyPort}
            disabled={restarting}
            className="px-3 h-7 text-xs bg-vs-input border border-vs-border rounded text-vs-textDim hover:text-vs-text hover:border-vs-textDim transition-colors disabled:opacity-50"
          >
            {restarting ? t('settings.mcpApplying') : serverRunning ? t('settings.mcpRestart') : t('settings.mcpStart')}
          </button>
          {portError && <span className="text-xs text-[#f48771] flex-1">{portError}</span>}
        </div>
      </SRow>

      {/* CLI */}
      <SRow label={t('settings.mcpHowToAdd')} span>
        <SCodeBox value={cliCmd} />
      </SRow>

      {/* JSON */}
      <SRow label={`${t('settings.mcpManual')} ~/.claude/settings.json`} span>
        <SCodeBox value={jsonSnippet} />
      </SRow>

      <div className="mt-4 flex gap-2.5 p-3 rounded text-2xs text-vs-textDim leading-relaxed bg-[#569cd6]/[0.06] border border-[#569cd6]/25">
        <SIcon name="info" size={14} color="#569cd6" />
        <span>{t('settings.mcpAfterRestart')}</span>
      </div>
    </>
  )
}

// ── Section: About ────────────────────────────────────────────────────
function SecAbout() {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.app.getVersion().then(setVersion)
  }, [])

  const links = [t('settings.aboutDocs'), 'Changelog', 'GitHub', t('settings.aboutReportBug')]

  return (
    <div className="py-6 flex flex-col items-center gap-4 text-center">
      <div className="w-14 h-14 rounded-xl bg-[#007acc] flex items-center justify-center text-white text-2xl font-bold select-none">
        D
      </div>
      <div>
        <div className="text-sm font-medium text-vs-text">DBStudio</div>
        {version && <div className="text-2xs text-vs-textDim mt-1 font-mono">v{version}</div>}
      </div>
      <div className="flex gap-5">
        {links.map(label => (
          <span key={label} className="text-2xs text-[#007acc] cursor-pointer hover:underline">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Coming soon placeholder ───────────────────────────────────────────
function SecComingSoon() {
  const { t } = useTranslation()
  return (
    <div className="py-16 text-center">
      <div className="text-sm font-medium text-vs-text mb-2">{t('settings.comingSoon')}</div>
      <div className="text-xs text-vs-textDim leading-relaxed">{t('settings.comingSoonMessage')}</div>
    </div>
  )
}

// ── Search index ─────────────────────────────────────────────────────
type SearchEntry = {
  section: string
  label: string
  hint?: string
  keywords: string[]
}

function buildSearchIndex(t: (k: string) => string): SearchEntry[] {
  return [
    {
      section: 'general',
      label: t('settings.langLabel'),
      hint: t('settings.langHint'),
      keywords: ['language', 'locale', 'ru', 'en', 'pl', 'english', 'russian', 'polish', 'язык', 'język'],
    },
    {
      section: 'appearance',
      label: t('settings.theme'),
      hint: t('settings.descAppearance'),
      keywords: ['dark', 'light', 'color', 'colour', 'тема', 'тёмная', 'светлая', 'dark mode', 'light mode'],
    },
    {
      section: 'editor',
      label: t('settings.editorFontSize'),
      hint: t('settings.descEditor'),
      keywords: ['font', 'size', 'px', '12', '14', '16', '18', 'шрифт', 'размер', 'czcionka'],
    },
    {
      section: 'shortcuts',
      label: t('settings.navShortcuts'),
      hint: t('settings.descShortcuts'),
      keywords: ['keyboard', 'hotkey', 'keybind', 'ctrl', 'cmd', 'клавиши', 'сочетание', 'skrót'],
    },
    {
      section: 'mcp',
      label: t('settings.mcpServer'),
      hint: t('settings.descMcp'),
      keywords: ['mcp', 'server', 'claude', 'ai', 'agent', 'cursor', 'сервер', 'интеграция'],
    },
    {
      section: 'mcp',
      label: t('settings.mcpPort'),
      keywords: ['port', 'порт', '3742', 'localhost', '1024', '65535'],
    },
    {
      section: 'mcp',
      label: t('settings.mcpHowToAdd'),
      keywords: ['install', 'setup', 'claude code', 'command', 'terminal', 'установка'],
    },
    {
      section: 'ai',
      label: t('settings.navAi'),
      hint: t('settings.descAi'),
      keywords: ['ai', 'artificial intelligence', 'assistant', 'autocomplete', 'completion', 'ассистент'],
    },
    {
      section: 'updates',
      label: t('settings.navUpdates'),
      hint: t('settings.descUpdates'),
      keywords: ['update', 'upgrade', 'version', 'release', 'stable', 'beta', 'обновление', 'версия'],
    },
    {
      section: 'privacy',
      label: t('settings.navPrivacy'),
      hint: t('settings.descPrivacy'),
      keywords: ['privacy', 'telemetry', 'analytics', 'data', 'приватность', 'телеметрия', 'данные'],
    },
    {
      section: 'about',
      label: t('settings.navAbout'),
      hint: t('settings.descAbout'),
      keywords: ['version', 'changelog', 'github', 'license', 'bug', 'docs', 'версия', 'лицензия'],
    },
  ]
}

function SearchResults({
  results,
  allItems,
  query,
  onSelect,
}: {
  results: SearchEntry[]
  allItems: NavItem[]
  query: string
  onSelect: (section: string) => void
}) {
  const { t } = useTranslation()

  if (results.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="text-xs text-vs-textDim">{t('settings.nothingFound')}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {results.map((entry, i) => {
        const sectionMeta = allItems.find(item => item.id === entry.section)
        const hiLabel = highlight(entry.label, query)
        const hiHint = entry.hint ? highlight(entry.hint, query) : null
        return (
          <button
            key={i}
            onClick={() => onSelect(entry.section)}
            className="w-full text-left px-4 py-3 rounded-md hover:bg-vs-hover transition-colors border border-transparent hover:border-vs-border"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              {sectionMeta && (
                <>
                  <SIcon name={sectionMeta.icon} size={11} color="var(--vs-text-dim)" />
                  <span className="text-[10px] text-vs-textDim">{sectionMeta.label}</span>
                  <span className="text-[10px] text-vs-textDim opacity-40">›</span>
                </>
              )}
              <span
                className="text-xs text-vs-text font-medium"
                dangerouslySetInnerHTML={{ __html: hiLabel }}
              />
            </div>
            {hiHint && (
              <div
                className="text-2xs text-vs-textDim leading-relaxed"
                dangerouslySetInnerHTML={{ __html: hiHint }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function highlight(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text)
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return escapeHtml(text)
  const before = escapeHtml(text.slice(0, idx))
  const match = escapeHtml(text.slice(idx, idx + query.length))
  const after = escapeHtml(text.slice(idx + query.length))
  return `${before}<mark style="background:#007acc33;color:inherit;border-radius:2px;padding:0 1px">${match}</mark>${after}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Nav type ──────────────────────────────────────────────────────────
type NavItem = { id: string; label: string; icon: string; badge?: string }
type NavGroup = { group: string; items: NavItem[] }

// ── Main modal ────────────────────────────────────────────────────────
export default function SettingsModal({ onClose, initialSection }: Props) {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState(initialSection ?? 'general')
  const [search, setSearch] = useState('')

  const NAV: NavGroup[] = [
    {
      group: t('settings.navWorkspace'),
      items: [
        { id: 'general',    label: t('settings.navGeneral'),    icon: 'gear' },
        { id: 'appearance', label: t('settings.navAppearance'), icon: 'palette' },
        { id: 'editor',     label: t('settings.navEditor'),     icon: 'code' },
        { id: 'shortcuts',  label: t('settings.navShortcuts'),  icon: 'keyboard' },
      ],
    },
    {
      group: t('settings.navIntegrations'),
      items: [
        { id: 'mcp', label: t('settings.mcpServer'), icon: 'server', badge: 'BETA' },
        { id: 'ai',  label: t('settings.navAi'),     icon: 'spark' },
      ],
    },
    {
      group: t('settings.navApplication'),
      items: [
        { id: 'updates', label: t('settings.navUpdates'), icon: 'refresh' },
        { id: 'privacy', label: t('settings.navPrivacy'), icon: 'shield' },
        { id: 'about',   label: t('settings.navAbout'),   icon: 'info' },
      ],
    },
  ]

  const allNavItems = NAV.flatMap(g => g.items)

  const searchIndex = useMemo(() => buildSearchIndex(t), [t])
  const isSearching = search.trim().length > 0

  const searchResults = useMemo(() => {
    if (!isSearching) return []
    const q = search.toLowerCase()
    return searchIndex.filter(entry =>
      entry.label.toLowerCase().includes(q) ||
      (entry.hint?.toLowerCase().includes(q) ?? false) ||
      entry.keywords.some(k => k.toLowerCase().includes(q))
    )
  }, [search, isSearching, searchIndex])

  const activeMeta = allNavItems.find(i => i.id === activeSection)

  const SECTION_DESC: Record<string, string> = {
    general:    t('settings.descGeneral'),
    appearance: t('settings.descAppearance'),
    editor:     t('settings.descEditor'),
    shortcuts:  t('settings.descShortcuts'),
    mcp:        t('settings.descMcp'),
    ai:         t('settings.descAi'),
    updates:    t('settings.descUpdates'),
    privacy:    t('settings.descPrivacy'),
    about:      t('settings.descAbout'),
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'general':    return <SecGeneral />
      case 'appearance': return <SecAppearance />
      case 'editor':     return <SecEditor />
      case 'mcp':        return <SecMCP />
      case 'about':      return <SecAbout />
      default:           return <SecComingSoon />
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col bg-vs-sidebar border border-vs-border rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 900, height: 600 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-11 border-b border-vs-border shrink-0">
          <span className="text-sm font-semibold text-vs-text">{t('settings.title')}</span>
          <div className="flex items-center gap-1.5 h-7 bg-vs-input border border-vs-border rounded px-2 ml-2 w-64">
            <SIcon name="search" size={11} color="var(--vs-text-dim)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('settings.searchSettings')}
              className="flex-1 bg-transparent border-none outline-none text-2xs text-vs-text placeholder:text-vs-textDim min-w-0"
            />
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-vs-textDim hover:text-vs-text hover:bg-vs-hover rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-[200px] bg-vs-bg border-r border-vs-border overflow-y-auto shrink-0 py-2">
            {NAV.map(group => {
              const matchingSections = isSearching
                ? new Set(searchResults.map(r => r.section))
                : null
              return (
                <div key={group.group} className="mb-2">
                  <div className="px-3.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.6px] text-vs-textDim opacity-60 select-none">
                    {group.group}
                  </div>
                  {group.items.map(item => {
                    const isActive = !isSearching && item.id === activeSection
                    const hasMatch = isSearching && matchingSections?.has(item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActiveSection(item.id); setSearch('') }}
                        style={{ borderLeft: `2px solid ${isActive ? '#007acc' : 'transparent'}` }}
                        className={`w-full flex items-center gap-2.5 pl-3 pr-3 py-1.5 text-xs transition-colors ${
                          isActive
                            ? 'bg-[#007acc]/[0.14] text-vs-text'
                            : hasMatch
                              ? 'text-vs-text hover:bg-vs-hover'
                              : 'text-vs-textDim hover:text-vs-text hover:bg-vs-hover'
                        }`}
                      >
                        <SIcon name={item.icon} size={14} color={isActive ? '#007acc' : 'currentColor'} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge && !isSearching && (
                          <span className="px-1 py-0.5 text-[8px] font-bold font-mono tracking-wide bg-[#c586c0]/20 text-[#c586c0] rounded">
                            {item.badge}
                          </span>
                        )}
                        {hasMatch && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#007acc] shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className="px-8 pt-5 pb-8 max-w-[680px]">
              {isSearching ? (
                <>
                  <h2 className="text-sm font-semibold text-vs-text mb-0.5">
                    {t('settings.searchSettings').replace('…', '')} «{search}»
                  </h2>
                  <p className="text-2xs text-vs-textDim mb-4">
                    {searchResults.length > 0
                      ? `${searchResults.length} ${searchResults.length === 1 ? t('settings.searchResultOne') : t('settings.searchResultMany')}`
                      : ''}
                  </p>
                  <SearchResults
                    results={searchResults}
                    allItems={allNavItems}
                    query={search}
                    onSelect={section => { setActiveSection(section); setSearch('') }}
                  />
                </>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-vs-text mb-0.5">
                    {activeMeta?.label ?? t('settings.title')}
                  </h2>
                  <p className="text-2xs text-vs-textDim mb-4 leading-relaxed">
                    {SECTION_DESC[activeSection] ?? ''}
                  </p>
                  {renderSection()}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 h-11 border-t border-vs-border shrink-0 bg-vs-bg">
          <span className="text-[10px] font-mono text-vs-textDim">{t('settings.savedAuto')}</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 h-7 text-xs bg-[#007acc] hover:bg-[#0069b0] text-white rounded transition-colors"
          >
            {t('settings.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
