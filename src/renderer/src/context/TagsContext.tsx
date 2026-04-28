import React, { createContext, useContext, useState, useCallback } from 'react'

export interface Tag {
  key: string
  label: string
  color: string
  custom?: boolean
}

export const BUILTIN_TAGS: Tag[] = [
  { key: 'prod',  label: 'PROD',  color: '#a13434' },
  { key: 'dev',   label: 'DEV',   color: '#b88a3e' },
  { key: 'local', label: 'LOCAL', color: '#007acc' },
]

const LS_KEY = 'dbstudio:customTags'

function readCustom(): Tag[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Tag[] }
  catch { return [] }
}

interface TagsCtx {
  tags: Tag[]
  addTag: (label: string, color: string) => Tag
  deleteTag: (key: string) => void
  getTag: (key: string) => Tag | undefined
}

const Ctx = createContext<TagsCtx | null>(null)

export function TagsProvider({ children }: { children: React.ReactNode }) {
  const [custom, setCustom] = useState<Tag[]>(readCustom)

  const all = [...BUILTIN_TAGS, ...custom.map((t) => ({ ...t, custom: true as const }))]

  const addTag = useCallback((label: string, color: string): Tag => {
    const slug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'tag'
    const key = `${slug}-${Date.now().toString(36)}`
    const tag: Tag = { key, label: label.trim(), color, custom: true }
    setCustom((prev) => {
      const next = [...prev, tag]
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
    return tag
  }, [])

  const deleteTag = useCallback((key: string) => {
    setCustom((prev) => {
      const next = prev.filter((t) => t.key !== key)
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const getTag = useCallback((key: string) => all.find((t) => t.key === key), [all])

  return (
    <Ctx.Provider value={{ tags: all, addTag, deleteTag, getTag }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTags() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTags must be used inside TagsProvider')
  return ctx
}
