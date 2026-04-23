import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { ConnectionConfig } from '../../shared/types'

function getStorePath(): string {
  return join(app.getPath('userData'), 'connections.json')
}

interface StoredConnection extends Omit<ConnectionConfig, 'password'> {
  passwordEncrypted: string
}

function decrypt(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) return encrypted
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) return plain
  return safeStorage.encryptString(plain).toString('base64')
}

export function loadConnections(): ConnectionConfig[] {
  const storePath = getStorePath()
  if (!existsSync(storePath)) return []
  try {
    const stored: StoredConnection[] = JSON.parse(readFileSync(storePath, 'utf-8'))
    return stored.map(({ passwordEncrypted, ...rest }) => ({
      ...rest,
      password: decrypt(passwordEncrypted)
    }))
  } catch {
    return []
  }
}

export function saveConnections(connections: ConnectionConfig[]): void {
  const stored: StoredConnection[] = connections.map(({ password, ...rest }) => ({
    ...rest,
    passwordEncrypted: encrypt(password)
  }))
  writeFileSync(getStorePath(), JSON.stringify(stored, null, 2), 'utf-8')
}
