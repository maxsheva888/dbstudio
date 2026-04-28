import type { BrowserWindow } from 'electron'
import { getAdapter, listConnectedIds, closeConnection, getConfig } from './registry'

const PING_INTERVAL_MS = 4 * 60 * 1000

let intervalId: ReturnType<typeof setInterval> | null = null

export function isConnectionLostError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('connection lost') ||
    msg.includes('server closed the connection') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('protocol_connection_lost') ||
    msg.includes('cannot enqueue')
  )
}

export function startKeepalive(win: BrowserWindow): void {
  if (intervalId) return
  intervalId = setInterval(async () => {
    for (const connectionId of listConnectedIds()) {
      const config = getConfig(connectionId)
      if (config?.type === 'sqlite') continue  // SQLite has no network connection
      try {
        await getAdapter(connectionId).query('SELECT 1', undefined)
      } catch (err) {
        if (isConnectionLostError(err)) {
          try { await closeConnection(connectionId) } catch {}
          if (!win.isDestroyed()) win.webContents.send('connection:lost', connectionId)
        }
      }
    }
  }, PING_INTERVAL_MS)
}

export function stopKeepalive(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
