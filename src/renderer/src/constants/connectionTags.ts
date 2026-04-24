export interface ConnectionTag {
  key: string
  label: string
  color: string
}

export const CONNECTION_TAGS: ConnectionTag[] = [
  { key: 'prod',  label: 'prod',  color: '#8b2020' },
  { key: 'dev',   label: 'dev',   color: '#1a5c8b' },
  { key: 'local', label: 'local', color: '#2e6b3e' },
]

export function getTagByKey(key: string | undefined): ConnectionTag | undefined {
  if (!key) return undefined
  return CONNECTION_TAGS.find((t) => t.key === key)
}
