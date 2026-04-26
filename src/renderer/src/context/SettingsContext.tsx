import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type Theme = 'dark' | 'light'

interface Settings {
  theme: Theme
  editorFontSize: number
  safeMode: boolean
}

interface SettingsContextValue extends Settings {
  setTheme: (t: Theme) => void
  setEditorFontSize: (n: number) => void
  setSafeMode: (v: boolean) => void
  monacoTheme: string
}

const DEFAULTS: Settings = { theme: 'dark', editorFontSize: 14, safeMode: true }

function load(): Settings {
  try {
    const raw = localStorage.getItem('dbstudio-settings')
    if (raw) {
      const { safeMode: _ignored, ...saved } = JSON.parse(raw)
      return { ...DEFAULTS, ...saved }
    }
  } catch { /* ignore */ }
  return DEFAULTS
}

function persist(s: Settings) {
  const { safeMode: _ignored, ...toSave } = s
  localStorage.setItem('dbstudio-settings', JSON.stringify(toSave))
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load)

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'light') {
      root.classList.add('light')
    } else {
      root.classList.remove('light')
    }
    persist(settings)
  }, [settings])

  const setTheme = useCallback((theme: Theme) => {
    setSettings((s) => ({ ...s, theme }))
  }, [])

  const setEditorFontSize = useCallback((editorFontSize: number) => {
    setSettings((s) => ({ ...s, editorFontSize }))
  }, [])

  const setSafeMode = useCallback((safeMode: boolean) => {
    setSettings((s) => ({ ...s, safeMode }))
  }, [])

  return (
    <SettingsContext.Provider value={{
      ...settings,
      monacoTheme: settings.theme === 'light' ? 'vs' : 'vs-dark',
      setTheme,
      setEditorFontSize,
      setSafeMode
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
