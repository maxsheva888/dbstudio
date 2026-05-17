import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

interface Toast {
  id: number
  message: string
  type: 'info' | 'warning' | 'error'
  action?: { label: string; onClick: () => void }
}

interface ToastContextValue {
  showToast: (message: string, options?: { type?: Toast['type']; action?: Toast['action'] }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, options?: { type?: Toast['type']; action?: Toast['action'] }) => {
    const id = ++idRef.current
    const toast: Toast = { id, message, type: options?.type ?? 'info', action: options?.action }
    setToasts((prev) => [...prev.slice(-2), toast])
    setTimeout(() => dismiss(id), 6000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded shadow-2xl text-xs max-w-[480px] border"
              style={{
                background: toast.type === 'warning' ? 'rgba(206,154,56,0.15)' : toast.type === 'error' ? 'rgba(244,135,113,0.15)' : 'rgba(0,0,0,0.75)',
                borderColor: toast.type === 'warning' ? 'rgba(206,154,56,0.4)' : toast.type === 'error' ? 'rgba(244,135,113,0.4)' : 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <span
                className="shrink-0 text-sm"
                style={{ color: toast.type === 'warning' ? '#ce9a38' : toast.type === 'error' ? '#f48771' : '#9cdcfe' }}
              >
                {toast.type === 'warning' ? '⚠' : toast.type === 'error' ? '✕' : 'ℹ'}
              </span>
              <span className="text-vs-text flex-1 leading-snug">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => { toast.action!.onClick(); dismiss(toast.id) }}
                  className="shrink-0 px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                  style={{ background: 'rgba(0,122,204,0.25)', color: '#4fc3f7', border: '1px solid rgba(0,122,204,0.4)' }}
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-vs-textDim hover:text-vs-text transition-colors ml-1 text-base leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
