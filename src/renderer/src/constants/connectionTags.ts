export interface ConnectionTag {
  key: string
  label: string
  color: string
}

export const CONNECTION_TAGS: ConnectionTag[] = [
  { key: 'prod',  label: 'prod',  color: '#a13434' },
  { key: 'dev',   label: 'dev',   color: '#b88a3e' },
  { key: 'local', label: 'local', color: '#007acc' },
]

export function getTagByKey(key: string | undefined): ConnectionTag | undefined {
  if (!key) return undefined
  return CONNECTION_TAGS.find((t) => t.key === key)
}
