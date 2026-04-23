/// <reference types="vite/client" />
import type {
  ConnectionConfig, TestConnectionResult,
  TableInfo, ColumnInfo, QueryResult
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
    }
  }
}
