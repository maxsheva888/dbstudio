import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { ConnectionConfig, SSHConfig } from '../../shared/types'

function getStorePath(): string {
  return join(app.getPath('userData'), 'connections.json')
}

interface StoredSSH extends Omit<SSHConfig, 'password'> {
  passwordEncrypted?: string
}

interface StoredConnection extends Omit<ConnectionConfig, 'password' | 'ssh'> {
  passwordEncrypted: string
  ssh?: StoredSSH
}

function decrypt(encrypted: string): string {
  if (!encrypted) return ''
  if (!safeStorage.isEncryptionAvailable()) return encrypted
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')) }
  catch { return encrypted }
}

function encrypt(plain: string): string {
  if (!plain) return ''
  if (!safeStorage.isEncryptionAvailable()) return plain
  return safeStorage.encryptString(plain).toString('base64')
}

export function loadConnections(): ConnectionConfig[] {
  const storePath = getStorePath()
  if (!existsSync(storePath)) return []
  try {
    const stored: StoredConnection[] = JSON.parse(readFileSync(storePath, 'utf-8'))
    return stored.map(({ passwordEncrypted, ssh, ...rest }) => {
      const conn: ConnectionConfig = { ...rest, password: decrypt(passwordEncrypted) }
      if (ssh) {
        const { passwordEncrypted: sshPwEnc, ...sshRest } = ssh
        conn.ssh = { ...sshRest, password: sshPwEnc ? decrypt(sshPwEnc) : undefined }
      }
      // migrate old single tag → tags array
      const legacy = conn as ConnectionConfig & { tag?: string }
      if (!conn.tags && legacy.tag) {
        conn.tags = [legacy.tag]
        delete legacy.tag
      }
      return conn
    })
  } catch {
    return []
  }
}

export function saveConnections(connections: ConnectionConfig[]): void {
  const stored: StoredConnection[] = connections.map(({ password, ssh, ...rest }) => {
    const entry: StoredConnection = { ...rest, passwordEncrypted: encrypt(password) }
    if (ssh) {
      const { password: sshPw, ...sshRest } = ssh
      entry.ssh = { ...sshRest, passwordEncrypted: sshPw ? encrypt(sshPw) : undefined }
    }
    return entry
  })
  writeFileSync(getStorePath(), JSON.stringify(stored, null, 2), 'utf-8')
}
