import http from 'http'
import { getActiveSession } from './mcpState'
import { checkSafeMode } from './safeMode'
import { getAdapter, getConfig } from '../connections/registry'
import { logEntry, deriveKind, computeGrade, computeHints } from '../queryLog'

// ── Tool definitions (MCP spec) ───────────────────────────────────────────────

const TOOLS = [
  {
    name: 'check_active_db',
    description: 'Check if there is an active database session with MCP enabled. Returns database info or an error if no session is active.',
    inputSchema: { type: 'object', properties: {}, required: [] as string[] },
  },
  {
    name: 'query',
    description: 'Execute a SQL query on the active database. Respects the current safe mode restrictions.',
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'The SQL query to execute' } },
      required: ['sql'],
    },
  },
  {
    name: 'list_tables',
    description: 'List all tables and views in the active database.',
    inputSchema: { type: 'object', properties: {}, required: [] as string[] },
  },
  {
    name: 'describe_table',
    description: 'Get the full schema of a table: columns, types, nullability, keys, foreign keys and indexes.',
    inputSchema: {
      type: 'object',
      properties: { table: { type: 'string', description: 'Table name' } },
      required: ['table'],
    },
  },
  {
    name: 'get_schema',
    description: 'Get the complete database schema — all tables with columns and foreign key relationships.',
    inputSchema: { type: 'object', properties: {}, required: [] as string[] },
  },
]

// ── Tool execution ────────────────────────────────────────────────────────────

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const session = getActiveSession()

  if (name === 'check_active_db') {
    if (!session) {
      return {
        content: [{ type: 'text', text: 'No active MCP session. Enable MCP on a database in DBStudio first.' }],
        isError: true,
      }
    }
    const cfg = getConfig(session.connectionId)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ database: session.database, dialect: cfg?.type ?? 'mysql', safeMode: session.safeMode }, null, 2),
      }],
    }
  }

  if (!session) {
    return {
      content: [{ type: 'text', text: 'No active MCP session. Enable MCP on a database in DBStudio first.' }],
      isError: true,
    }
  }

  const { connectionId, database } = session

  if (name === 'query') {
    const sql = String(args.sql ?? '').trim()
    if (!sql) return { content: [{ type: 'text', text: 'SQL query cannot be empty.' }], isError: true }

    const blocked = checkSafeMode(sql, session.safeMode)
    if (blocked) return { content: [{ type: 'text', text: blocked }], isError: true }

    const cfg = getConfig(connectionId)
    const kind = deriveKind(sql)
    const ranAt = Date.now()

    try {
      const result = await getAdapter(connectionId).query(sql, database)
      const { durationMs, rowCount } = result
      const grade = computeGrade(durationMs, undefined, kind)
      const hints = computeHints(sql, kind, durationMs, rowCount)

      logEntry({ sql, connectionId, database, durationMs, error: null, rowCount, ranAt, kind, status: durationMs > 1000 ? 'slow' : 'ok', sourceLabel: '🤖 MCP', user: cfg?.user ?? null, tx: false, grade, hints })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ columns: result.columns, rows: result.rows, rowCount, durationMs }, null, 2),
        }],
      }
    } catch (err) {
      const durationMs = Date.now() - ranAt
      const message = (err as Error).message
      const grade = computeGrade(durationMs, undefined, kind)
      const hints = computeHints(sql, kind, durationMs, null)

      logEntry({ sql, connectionId, database, durationMs, error: message, rowCount: null, ranAt, kind, status: 'error', sourceLabel: '🤖 MCP', user: getConfig(connectionId)?.user ?? null, tx: false, grade, hints })

      return { content: [{ type: 'text', text: `Query error: ${message}` }], isError: true }
    }
  }

  if (name === 'list_tables') {
    try {
      const tables = await getAdapter(connectionId).getTables(database)
      return { content: [{ type: 'text', text: JSON.stringify(tables.map((t) => ({ name: t.name, type: t.tableType })), null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
    }
  }

  if (name === 'describe_table') {
    const table = String(args.table ?? '').trim()
    if (!table) return { content: [{ type: 'text', text: 'Table name is required.' }], isError: true }

    try {
      const adapter = getAdapter(connectionId)
      const [columns, foreignKeys, indexes] = await Promise.all([
        adapter.getColumns(database, table),
        adapter.getForeignKeys(database, table),
        adapter.getIndexes(database, table),
      ])
      return { content: [{ type: 'text', text: JSON.stringify({ table, columns, foreignKeys, indexes }, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
    }
  }

  if (name === 'get_schema') {
    try {
      const adapter = getAdapter(connectionId)
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
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
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
    const session = getActiveSession()
    send(res, 200, { status: 'ok', service: 'DBStudio MCP', version: '1.0.0', activeSession: session ? { database: session.database, safeMode: session.safeMode } : null })
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

  // Notification — no response needed
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
  } catch (err) {
    send(res, 200, { jsonrpc: '2.0', id, error: { code: -32603, message: `Internal error: ${(err as Error).message}` } })
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startMcpServer(port: number): Promise<void> {
  if (httpServer?.listening) await stopMcpServer()

  httpServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[MCP]', err)
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
