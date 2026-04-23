import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ScriptFile } from '@shared/types'

interface ScriptsContextValue {
  scripts: ScriptFile[]
  reload: () => Promise<void>
  createScript: (name: string, scope: string) => Promise<ScriptFile>
  renameScript: (id: string, name: string) => Promise<void>
  deleteScript: (id: string) => Promise<void>
}

const ScriptsContext = createContext<ScriptsContextValue | null>(null)

export function ScriptsProvider({ children }: { children: React.ReactNode }) {
  const [scripts, setScripts] = useState<ScriptFile[]>([])

  const reload = useCallback(async () => {
    setScripts(await window.api.scripts.list())
  }, [])

  const createScript = useCallback(async (name: string, scope: string) => {
    const script = await window.api.scripts.create(name, scope)
    await reload()
    return script
  }, [reload])

  const renameScript = useCallback(async (id: string, name: string) => {
    await window.api.scripts.rename(id, name)
    await reload()
  }, [reload])

  const deleteScript = useCallback(async (id: string) => {
    await window.api.scripts.delete(id)
    await reload()
  }, [reload])

  useEffect(() => { reload() }, [reload])

  return (
    <ScriptsContext.Provider value={{ scripts, reload, createScript, renameScript, deleteScript }}>
      {children}
    </ScriptsContext.Provider>
  )
}

export function useScripts() {
  const ctx = useContext(ScriptsContext)
  if (!ctx) throw new Error('useScripts must be used inside ScriptsProvider')
  return ctx
}
