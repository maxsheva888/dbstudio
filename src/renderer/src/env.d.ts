/// <reference types="vite/client" />
import type { ConnectionConfig, TestConnectionResult } from '@shared/types'

declare global {
  interface Window {
    api: {
      connections: {
        list: () => Promise<ConnectionConfig[]>
        save: (config: ConnectionConfig) => Promise<void>
        delete: (id: string) => Promise<void>
        test: (config: Omit<ConnectionConfig, 'id' | 'createdAt'>) => Promise<TestConnectionResult>
        getDatabases: (config: ConnectionConfig) => Promise<string[]>
      }
    }
  }
}
