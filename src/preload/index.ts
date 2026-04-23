import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

contextBridge.exposeInMainWorld('electron', electronAPI)

// DB and script APIs will be added here as IPC handlers are implemented
contextBridge.exposeInMainWorld('api', {})
