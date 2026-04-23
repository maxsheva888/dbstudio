// Strips ELECTRON_RUN_AS_NODE before launching electron-vite.
// Required when developing inside Claude Code (or any Electron host) which
// sets ELECTRON_RUN_AS_NODE=1 in child processes, breaking the electron API.
const { spawn } = require('child_process')
const path = require('path')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const evite = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-vite')
const isWin = process.platform === 'win32'

const child = spawn(isWin ? evite + '.cmd' : evite, ['dev'], { stdio: 'inherit', env })
child.on('close', (code) => process.exit(code ?? 0))
