/// <reference types="vite/client" />

type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }
import type {
  ConnectionConfig, TestConnectionResult,
  TableInfo, ColumnInfo, QueryResult,
  IndexInfo, ForeignKeyInfo, ERDTableData,
  ScriptFile, ScriptVersion, ScriptStats, ScriptSuggestions, HistoryEntry, QueryLogEntry,
  McpSafeMode, McpServerStatus,
} from '@shared/types'

declare global {
  interface Window {
    api: {
      app: {
        getVersion: () => Promise<string>
      }
      updater?: {
        onEvent?: (cb: (event: UpdaterEvent) => void) => (() => void)
        download: () => Promise<void>
        install: () => Promise<void>
        check: () => Promise<void>
      }
      connections: {
        list: () => Promise<ConnectionConfig[]>
        save: (config: ConnectionConfig) => Promise<void>
        delete: (id: string) => Promise<void>
        test: (config: Omit<ConnectionConfig, 'id' | 'createdAt'>) => Promise<TestConnectionResult>
        pickFile: (mode: 'sqlite' | 'sshkey') => Promise<string | null>
      }
      schema: {
        connect: (connectionId: string) => Promise<string[]>
        disconnect: (connectionId: string) => Promise<void>
        listConnected: () => Promise<string[]>
        tables: (connectionId: string, database: string) => Promise<TableInfo[]>
        columns: (connectionId: string, database: string, table: string) => Promise<ColumnInfo[]>
        dbSizes: (connectionId: string) => Promise<Record<string, number>>
        indexes: (connectionId: string, database: string, table: string) => Promise<IndexInfo[]>
        foreignKeys: (connectionId: string, database: string, table: string) => Promise<ForeignKeyInfo[]>
        ddl: (connectionId: string, database: string, table: string) => Promise<string>
        erd: (connectionId: string, database: string) => Promise<ERDTableData[]>
      }
      query: {
        execute: (connectionId: string, database: string | null, sql: string, sourceLabel?: string, scriptId?: string, skipLog?: boolean) => Promise<QueryResult>
      }
      queryLog: {
        get: () => Promise<QueryLogEntry[]>
        explain: (entryId: number, connectionId: string, database: string | null, sql: string) => Promise<boolean>
        clear: () => Promise<void>
        onEntry: (cb: (entry: QueryLogEntry) => void) => (() => void)
        onEntryUpdate: (cb: (entry: QueryLogEntry) => void) => (() => void)
      }
      connection?: {
        onLost?: (cb: (connectionId: string) => void) => (() => void)
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
        suggestions: (connectionId: string | null, activeDb: string | null, activeTable: string | null, threshold?: number) => Promise<ScriptSuggestions>
        search: (query: string) => Promise<ScriptFile[]>
        logAnonRun: (sql: string, connectionId: string | null, durationMs: number, rowCount: number | null) => Promise<void>
        logTableAccess: (connectionId: string, dbName: string, tableName: string) => Promise<void>
        recentTables: (connectionId: string, dbName: string, limit?: number) => Promise<string[]>
        history: (limit?: number) => Promise<HistoryEntry[]>
      }
      mcp: {
        getStatus: () => Promise<McpServerStatus>
        setEnabled: (connectionId: string, database: string, enabled: boolean) => Promise<void>
        setSafeMode: (connectionId: string, database: string, mode: McpSafeMode) => Promise<void>
        clearConnection: (connectionId: string) => Promise<void>
        startServer: (port: number) => Promise<{ success: boolean; port?: number; error?: string }>
        stopServer: () => Promise<void>
      }
    }
  }
}
