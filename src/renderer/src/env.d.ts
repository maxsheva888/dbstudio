/// <reference types="vite/client" />
import type {
  ConnectionConfig, TestConnectionResult,
  TableInfo, ColumnInfo, QueryResult,
  ScriptFile, ScriptVersion, ScriptStats
} from '@shared/types'

declare global {
  interface Window {
    api: {
      connections: {
        list: () => Promise<ConnectionConfig[]>
        save: (config: ConnectionConfig) => Promise<void>
        delete: (id: string) => Promise<void>
        test: (config: Omit<ConnectionConfig, 'id' | 'createdAt'>) => Promise<TestConnectionResult>
      }
      schema: {
        connect: (connectionId: string) => Promise<string[]>
        disconnect: (connectionId: string) => Promise<void>
        tables: (connectionId: string, database: string) => Promise<TableInfo[]>
        columns: (connectionId: string, database: string, table: string) => Promise<ColumnInfo[]>
      }
      query: {
        execute: (connectionId: string, database: string | null, sql: string) => Promise<QueryResult>
      }
      scripts: {
        list: () => Promise<ScriptFile[]>
        create: (name: string, scope: string) => Promise<ScriptFile>
        rename: (id: string, name: string) => Promise<void>
        delete: (id: string) => Promise<void>
        versions: (scriptId: string) => Promise<ScriptVersion[]>
        getVersion: (versionId: number) => Promise<ScriptVersion | null>
        saveVersion: (scriptId: string, content: string) => Promise<ScriptVersion>
        logRun: (scriptId: string, versionId: number, connectionId: string, durationMs: number, rowCount: number) => Promise<void>
        logError: (scriptId: string, contentHash: string, errorMessage: string, connectionId: string | null) => Promise<void>
        stats: (scriptId: string) => Promise<ScriptStats>
      }
    }
  }
}
