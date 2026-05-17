import http from 'http'
import { getAllSessions, isDbEnabled, getDbSafeMode, hasAnySessions } from './mcpState'
import { checkSafeMode } from './safeMode'
import { getAdapter, getConfig } from '../connections/registry'
import { logEntry, deriveKind, computeGrade, computeHints } from '../queryLog'

// ── Tool definitions (MCP spec) ───────────────────────────────────────────────

const TOOLS = [
  {
    name: 'check_active_db',
    description: 'Returns all databases that have MCP access enabled. Call this first to discover which databases and connections are available.',
    inputSchema: { type: 'object', properties: {}, required: [] as string[] },
  },
  {
    name: 'query',
    description: 'Execute a SQL query on a specific database. The database must be in the list returned by check_active_db.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The SQL query to execute' },
        database: { type: 'string', description: 'Target database name (must be MCP-enabled)' },
        connection_id: { type: 'string', description: 'Connection ID (optional, required only if the same database name exists on multiple connections)' },
      },
      required: ['sql', 'database'],
    },
  },
  {
    name: 'list_tables',
    description: 'List all tables and views in a specific database.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Target database name (must be MCP-enabled)' },
        connection_id: { type: 'string', description: 'Connection ID (optional)' },
      },
      required: ['database'],
    },
  },
  {
    name: 'describe_table',
    description: 'Get the full schema of a table: columns, types, nullability, keys, foreign keys and indexes.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        database: { type: 'string', description: 'Target database name (must be MCP-enabled)' },
        connection_id: { type: 'string', description: 'Connection ID (optional)' },
      },
      required: ['table', 'database'],
    },
  },
  {
    name: 'get_schema',
    description: 'Get the complete database schema — all tables with columns and foreign key relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Target database name (must be MCP-enabled)' },
        connection_id: { type: 'string', description: 'Connection ID (optional)' },
      },
      required: ['database'],
    },
  },
]

// ── Session resolution ────────────────────────────────────────────────────────

type ResolvedSession = { connectionId: string; safeMode: import('./mcpState').McpSafeMode }
type SessionError = { error: string }

function buildAccessDeniedError(database: string): string {
  const sessions = getAllSessions()
  if (sessions.length === 0) {
    return `No active MCP sessions. Enable MCP on a database in DBStudio first.`
  }
  const allowed = sessions
    .flatMap((s) => s.databases.map((d) => `  • ${d.database} (${d.safeMode.replace('_', ' ')})`))
    .join('\n')
  return [
    `Access denied: database '${database}' is not enabled for MCP access.`,
    ``,
    `Databases you can access:`,
    allowed,
    ``,
    `To request access to '${database}', ask the user to enable MCP for it in DBStudio (click the plug icon next to the database name in the left panel).`,
  ].join('\n')
}

function resolveSession(database: string, connectionId?: string): ResolvedSession | SessionError {
  if (!hasAnySessions()) {
    return { error: 'No active MCP sessions. Enable MCP on a database in DBStudio first.' }
  }

  const sessions = getAllSessions()

  if (connectionId) {
    const session = sessions.find((s) => s.connectionId === connectionId)
    if (!session) {
      return { error: `Connection '${connectionId}' not found or has no MCP-enabled databases.` }
    }
    const db = session.databases.find((d) => d.database === database)
    if (!db) return { error: buildAccessDeniedError(database) }
    return { connectionId, safeMode: db.safeMode }
  }

  // Find by database name across all sessions
  const matches: ResolvedSession[] = []
  for (const session of sessions) {
    const db = session.databases.find((d) => d.database === database)
    if (db) matches.push({ connectionId: session.connectionId, safeMode: db.safeMode })
  }

  if (matches.length === 0) return { error: buildAccessDeniedError(database) }
  if (matches.length > 1) {
    return {
      error: `Database '${database}' is enabled on multiple connections. Specify 'connection_id' to disambiguate.\n\nAvailable connections: ${matches.map((m) => m.connectionId).join(', ')}`,
    }
  }
  return matches[0]
}

// ── Cross-database SQL check ──────────────────────────────────────────────────

function checkCrossDbAccess(sql: string, allowedDatabases: string[]): string | null {
  const allowedLower = allowedDatabases.map((d) => d.toLowerCase())

  // Block USE <database> that switches to a non-allowed database
  const useMatch = sql.match(/^\s*USE\s+[`"]?(\w+)[`"]?\s*;?\s*$/i)
  if (useMatch) {
    const target = useMatch[1]
    if (!allowedLower.includes(target.toLowerCase())) {
      return `USE statement denied: switching to database '${target}' is not allowed.\n\n${buildAccessDeniedError(target)}`
    }
  }

  // Block cross-database references: FROM db.table, JOIN db.table, INTO db.table, UPDATE db.table
  const crossDbRe = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+[`"]?(\w+)[`"]?\.[`"]?\w+[`"]?/gi
  let m: RegExpExecArray | null
  while ((m = crossDbRe.exec(sql)) !== null) {
    const dbRef = m[1]
    if (!allowedLower.includes(dbRef.toLowerCase())) {
      return [
        `Cross-database access denied: reference to database '${dbRef}' is not allowed.`,
        ``,
        buildAccessDeniedError(dbRef),
      ].join('\n')
    }
  }

  return null
}

// ── Tool execution ────────────────────────────────────────────────────────────

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

function err(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (name === 'check_active_db') {
    if (!hasAnySessions()) {
      return err('No active MCP sessions. Enable MCP on a database in DBStudio first.')
    }
    const sessions = getAllSessions()
    const output = sessions.map((s) => {
      const cfg = getConfig(s.connectionId)
      return {
        connection_id: s.connectionId,
        dialect: cfg?.type ?? 'unknown',
        databases: s.databases.map((d) => ({ database: d.database, safe_mode: d.safeMode })),
      }
    })
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(output, null, 2),
      }],
    }
  }

  // All other tools require a database parameter
  const database = String(args.database ?? '').trim()
  if (!database) return err('Parameter "database" is required. Call check_active_db first to see available databases.')

  const connectionId = args.connection_id ? String(args.connection_id) : undefined
  const resolved = resolveSession(database, connectionId)
  if ('error' in resolved) return err(resolved.error)

  const { connectionId: connId, safeMode } = resolved

  if (name === 'query') {
    const sql = String(args.sql ?? '').trim()
    if (!sql) return err('SQL query cannot be empty.')

    const blocked = checkSafeMode(sql, safeMode)
    if (blocked) return err(blocked)

    // Get all allowed databases for this connection to check cross-db refs
    const allowedDbs = getAllSessions()
      .filter((s) => s.connectionId === connId)
      .flatMap((s) => s.databases.map((d) => d.database))

    const crossDbError = checkCrossDbAccess(sql, allowedDbs)
    if (crossDbError) return err(crossDbError)

    const cfg = getConfig(connId)
    const kind = deriveKind(sql)
    const ranAt = Date.now()

    try {
      const result = await getAdapter(connId).query(sql, database)
      const { durationMs, rowCount } = result
      const grade = computeGrade(durationMs, undefined, kind)
      const hints = computeHints(sql, kind, durationMs, rowCount)
      logEntry({ sql, connectionId: connId, database, durationMs, error: null, rowCount, ranAt, kind, status: durationMs > 1000 ? 'slow' : 'ok', sourceLabel: '🤖 MCP', user: cfg?.user ?? null, tx: false, grade, hints })
      return {
        content: [{ type: 'text', text: JSON.stringify({ columns: result.columns, rows: result.rows, rowCount, durationMs }, null, 2) }],
      }
    } catch (e) {
      const durationMs = Date.now() - ranAt
      const message = (e as Error).message
      logEntry({ sql, connectionId: connId, database, durationMs, error: message, rowCount: null, ranAt, kind: deriveKind(sql), status: 'error', sourceLabel: '🤖 MCP', user: getConfig(connId)?.user ?? null, tx: false, grade: computeGrade(durationMs, undefined, kind), hints: [] })
      return err(`Query error: ${message}`)
    }
  }

  if (name === 'list_tables') {
    try {
      const tables = await getAdapter(connId).getTables(database)
      return { content: [{ type: 'text', text: JSON.stringify(tables.map((t) => ({ name: t.name, type: t.tableType })), null, 2) }] }
    } catch (e) {
      return err(`Error: ${(e as Error).message}`)
    }
  }

  if (name === 'describe_table') {
    const table = String(args.table ?? '').trim()
    if (!table) return err('Table name is required.')
    try {
      const adapter = getAdapter(connId)
      const [columns, foreignKeys, indexes] = await Promise.all([
        adapter.getColumns(database, table),
        adapter.getForeignKeys(database, table),
        adapter.getIndexes(database, table),
      ])
      return { content: [{ type: 'text', text: JSON.stringify({ table, columns, foreignKeys, indexes }, null, 2) }] }
    } catch (e) {
      return err(`Error: ${(e as Error).message}`)
    }
  }

  if (name === 'get_schema') {
    try {
      const adapter = getAdapter(connId)
      const tables = await adapter.getTables(database)
      const baseTables = tables.filter((t) => t.tableType === 'BASE TABLE')
      const schema = await Promise.all(
        baseTables.map(async (t) => {
          const [columns, foreignKeys] = await Promise.all([
            adapter.getColumns(database, t.name),
            adapter.getForeignKeys(database, t.name),
          ])
          return { table: t.name, columns, foreignKeys }
        })
      )
      return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] }
    } catch (e) {
      return err(`Error: ${(e as Error).message}`)
    }
  }

  return err(`Unknown tool: ${name}`)
}

// ── HTTP server (JSON-RPC 2.0 / MCP protocol) ─────────────────────────────────

let httpServer: http.Server | null = null

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function send(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const path = (req.url ?? '/').split('?')[0]

  if (path === '/health' || path === '/') {
    const sessions = getAllSessions()
    send(res, 200, {
      status: 'ok',
      service: 'DBStudio MCP',
      version: '1.0.0',
      activeSessions: sessions.map((s) => ({
        connectionId: s.connectionId,
        databases: s.databases.map((d) => ({ database: d.database, safeMode: d.safeMode })),
      })),
    })
    return
  }

  if (path !== '/mcp') { send(res, 404, { error: 'Not found' }); return }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return }

  let body: string
  try { body = await readBody(req) }
  catch { send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return }

  let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown }
  try { rpc = JSON.parse(body) }
  catch { send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return }

  const { id, method, params } = rpc

  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) {
    res.writeHead(204); res.end(); return
  }

  try {
    if (method === 'initialize') {
      send(res, 200, {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'DBStudio', version: '1.0.0' },
        },
      })
      return
    }

    if (method === 'ping') {
      send(res, 200, { jsonrpc: '2.0', id, result: {} })
      return
    }

    if (method === 'tools/list') {
      send(res, 200, { jsonrpc: '2.0', id, result: { tools: TOOLS } })
      return
    }

    if (method === 'tools/call') {
      const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined
      if (!p?.name) {
        send(res, 200, { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } })
        return
      }
      const result = await callTool(p.name, p.arguments ?? {})
      send(res, 200, { jsonrpc: '2.0', id, result })
      return
    }

    send(res, 200, { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
  } catch (e) {
    send(res, 200, { jsonrpc: '2.0', id, error: { code: -32603, message: `Internal error: ${(e as Error).message}` } })
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startMcpServer(port: number): Promise<void> {
  if (httpServer?.listening) await stopMcpServer()

  httpServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((e) => {
      console.error('[MCP]', e)
      if (!res.headersSent) { res.writeHead(500); res.end() }
    })
  })

  await new Promise<void>((resolve, reject) => {
    httpServer!.listen(port, '127.0.0.1', resolve)
    httpServer!.once('error', reject)
  })

  console.log(`[MCP] Server listening on http://127.0.0.1:${port}`)
}

export async function stopMcpServer(): Promise<void> {
  if (!httpServer) return
  await new Promise<void>((resolve) => httpServer!.close(() => resolve()))
  httpServer = null
}

export function isMcpRunning(): boolean {
  return !!httpServer?.listening
}

export function getMcpPort(): number | null {
  const addr = httpServer?.address()
  if (!addr || typeof addr === 'string') return null
  return (addr as { port: number }).port
}
