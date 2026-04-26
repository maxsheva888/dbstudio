import type { QueryResult, TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo } from '../../shared/types'

export interface DatabaseAdapter {
  query(sql: string, database?: string): Promise<QueryResult>
  getDatabases(): Promise<string[]>
  getTables(database: string): Promise<TableInfo[]>
  getColumns(database: string, table: string): Promise<ColumnInfo[]>
  getIndexes(database: string, table: string): Promise<IndexInfo[]>
  getForeignKeys(database: string, table: string): Promise<ForeignKeyInfo[]>
  getDdl(database: string, table: string): Promise<string>
  getDbSizes(): Promise<Record<string, number>>
  close(): Promise<void>
}
