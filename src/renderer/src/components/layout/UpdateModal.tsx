import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, X } from 'lucide-react'

export default function UpdateModal() {
  const { t } = useTranslation()
  const [event, setEvent] = useState<UpdaterEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsub = window.api.updater?.onEvent?.((e) => {
      setEvent(e)
      if (e.type === 'available') setDismissed(false)
    })
    return unsub
  }, [])

  if (dismissed || !event || event.type === 'checking' || event.type === 'not-available' || event.type === 'error') {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-[400px] rounded-lg border border-vs-border shadow-2xl"
        style={{ background: 'var(--vs-panel)' }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="text-sm font-semibold text-vs-text">
            {t('update.title')}
          </span>
          {event.type === 'available' && (
            <button
              onClick={() => setDismissed(true)}
              className="text-vs-textDim hover:text-vs-text transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* body */}
        <div className="px-5 pb-5 space-y-4">
          {event.type === 'available' && (
            <>
              <p className="text-sm text-vs-textDim">
                {t('update.message', { version: event.version })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDismissed(true)}
                  className="px-3 py-1.5 text-xs rounded border border-vs-border text-vs-textDim hover:text-vs-text hover:border-vs-textDim transition-colors"
                >
                  {t('update.later')}
                </button>
                <button
                  onClick={() => window.api.updater?.download()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#0e7490] hover:bg-[#0c6478] text-white transition-colors"
                >
                  <Download size={12} />
                  {t('update.download')}
                </button>
              </div>
            </>
          )}

          {event.type === 'downloading' && (
            <>
              <p className="text-sm text-vs-textDim">
                {t('update.downloading', { percent: event.percent })}
              </p>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${event.percent}%`, background: '#4ec9b0' }}
                />
              </div>
            </>
          )}

          {event.type === 'ready' && (
            <>
              <p className="text-sm text-vs-textDim">
                {t('update.ready', { version: event.version })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDismissed(true)}
                  className="px-3 py-1.5 text-xs rounded border border-vs-border text-vs-textDim hover:text-vs-text hover:border-vs-textDim transition-colors"
                >
                  {t('update.later')}
                </button>
                <button
                  onClick={() => window.api.updater?.install()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#0e7490] hover:bg-[#0c6478] text-white transition-colors"
                >
                  <RefreshCw size={12} />
                  {t('update.install')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
