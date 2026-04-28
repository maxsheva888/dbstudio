import { Client, type ConnectConfig } from 'ssh2'
import * as net from 'net'
import { readFileSync } from 'fs'
import type { SSHConfig } from '../../shared/types'

export class SSHTunnel {
  private client: Client | null = null
  private server: net.Server | null = null
  public localPort = 0

  async open(sshConfig: SSHConfig, dbHost: string, dbPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const client = new Client()
      this.client = client

      const server = net.createServer((socket) => {
        client.forwardOut('127.0.0.1', 0, dbHost, dbPort, (err, stream) => {
          if (err) { socket.destroy(); return }
          socket.pipe(stream).pipe(socket)
          stream.on('close', () => socket.destroy())
          socket.on('close', () => { try { stream.destroy() } catch {} })
        })
      })
      this.server = server

      server.on('error', (err) => { client.end(); reject(err) })

      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port
        this.localPort = port

        const cfg: ConnectConfig = {
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.user,
          readyTimeout: 15000
        }

        if (sshConfig.authType === 'password') {
          cfg.password = sshConfig.password
        } else if (sshConfig.keyPath) {
          try {
            cfg.privateKey = readFileSync(sshConfig.keyPath)
            if (sshConfig.passphrase) cfg.passphrase = sshConfig.passphrase
          } catch {
            server.close()
            reject(new Error(`Не удалось прочитать SSH ключ: ${sshConfig.keyPath}`))
            return
          }
        }

        client
          .on('ready', () => resolve(port))
          .on('error', (err) => { server.close(); reject(err) })
          .connect(cfg)
      })
    })
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server) { this.server.close(() => resolve()) }
      else resolve()
    })
    this.client?.end()
    this.client = null
    this.server = null
    this.localPort = 0
  }
}
