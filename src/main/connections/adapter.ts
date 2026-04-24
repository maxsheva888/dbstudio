import type { QueryResult, TableInfo, ColumnInfo } from '../../shared/types'

export interface DatabaseAdapter {
  query(sql: string, database?: string): Promise<QueryResult>
  getDatabases(): Promise<string[]>
  getTables(database: string): Promise<TableInfo[]>
  getColumns(database: string, table: string): Promise<ColumnInfo[]>
  getDbSizes(): Promise<Record<string, number>>
  close(): Promise<void>
}
