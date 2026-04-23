import React from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export default function StatusBar() {
  return (
    <div className="flex items-center justify-between px-3 h-6 bg-[#007acc] text-white shrink-0 text-xs">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <WifiOff size={12} />
          Нет подключения
        </span>
      </div>
      <div className="flex items-center gap-3 text-white/80">
        <span>DBStudio v0.1.0</span>
      </div>
    </div>
  )
}
