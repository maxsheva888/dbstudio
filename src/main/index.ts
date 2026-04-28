import { app, BrowserWindow, shell, ipcMain, screen } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { registerConnectionHandlers } from './ipc/connections'
import { registerSchemaHandlers } from './ipc/schema'
import { registerQueryHandlers } from './ipc/query'
import { registerScriptsHandlers } from './ipc/scripts'
import { registerMcpHandlers } from './ipc/mcp'
import { startMcpServer } from './mcp/server'
import { setPushFn, setUpdateFn, getEntries, clearEntries } from './queryLog'
import { startKeepalive } from './connections/keepalive'

const isDev = process.env.NODE_ENV !== 'production'

interface WindowState {
  x: number; y: number; width: number; height: number; maximized: boolean
}

function getWindowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  try {
    if (existsSync(getWindowStatePath())) {
      return JSON.parse(readFileSync(getWindowStatePath(), 'utf-8')) as WindowState
    }
  } catch {}
  return { x: 0, y: 0, width: 1400, height: 900, maximized: false }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const maximized = win.isMaximized()
    const { x, y, width, height } = maximized ? win.getNormalBounds() : win.getBounds()
    writeFileSync(getWindowStatePath(), JSON.stringify({ x, y, width, height, maximized }))
  } catch {}
}

function ensureOnScreen(state: WindowState): Partial<WindowState> {
  const displays = screen.getAllDisplays()
  const onScreen = displays.some((d) => {
    const b = d.workArea
    return state.x < b.x + b.width && state.x + state.width > b.x &&
           state.y < b.y + b.height && state.y + state.height > b.y
  })
  if (!onScreen) return { width: state.width, height: state.height }
  return { x: state.x, y: state.y, width: state.width, height: state.height }
}

function createWindow(): void {
  const saved = loadWindowState()
  const bounds = ensureOnScreen(saved)

  const mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (saved.maximized) mainWindow.maximize()
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
    setPushFn((entry) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('queryLog:entry', entry)
    })
    setUpdateFn((entry) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('queryLog:entryUpdate', entry)
    })
    startKeepalive(mainWindow)
    setupAutoUpdater(mainWindow)
  })

  mainWindow.on('close', () => saveWindowState(mainWindow))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupAutoUpdater(win: BrowserWindow): void {
  if (!app.isPackaged) return  // skip in dev mode

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () =>
    win.webContents.send('update:event', { type: 'checking' }))

  autoUpdater.on('update-available', (info) =>
    win.webContents.send('update:event', { type: 'available', version: info.version }))

  autoUpdater.on('update-not-available', () =>
    win.webContents.send('update:event', { type: 'not-available' }))

  autoUpdater.on('download-progress', (p) =>
    win.webContents.send('update:event', { type: 'downloading', percent: Math.round(p.percent) }))

  autoUpdater.on('update-downloaded', (info) =>
    win.webContents.send('update:event', { type: 'ready', version: info.version }))

  autoUpdater.on('error', (err) =>
    win.webContents.send('update:event', { type: 'error', message: err.message }))

  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().catch(() => {}))
  ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); })
  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates().catch(() => {}))

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.dbstudio')

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('queryLog:get', () => getEntries())
  ipcMain.handle('queryLog:clear', () => clearEntries())

  registerConnectionHandlers()
  registerSchemaHandlers()
  registerQueryHandlers()
  registerScriptsHandlers()
  registerMcpHandlers()
  startMcpServer(3742).catch((err) => console.error('[MCP] Failed to start on default port:', err))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
