import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'

// CJS/ESM interop
const monacoEditorPlugin =
  (monacoEditorPluginModule as unknown as { default: typeof monacoEditorPluginModule }).default ??
  monacoEditorPluginModule

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      react(),
      monacoEditorPlugin({
        languageWorkers: ['editorWorkerService']
      })
    ]
  }
})
