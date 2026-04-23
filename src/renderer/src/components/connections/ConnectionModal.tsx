import React, { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import type { ConnectionConfig } from '@shared/types'

interface Props {
  initial?: ConnectionConfig
  onSave: (config: ConnectionConfig) => Promise<void>
  onClose: () => void
}

const EMPTY: Omit<ConnectionConfig, 'id' | 'createdAt'> = {
  name: '',
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: ''
}

type TestState = 'idle' | 'loading' | 'ok' | 'error'

export default function ConnectionModal({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState(initial ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [testMsg, setTestMsg] = useState('')

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setTestState('idle')
  }

  async function handleTest() {
    setTestState('loading')
    setTestMsg('')
    const result = await window.api.connections.test(form)
    setTestState(result.success ? 'ok' : 'error')
    setTestMsg(result.message + (result.latencyMs ? ` (${result.latencyMs}ms)` : ''))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.host.trim() || !form.user.trim()) return
    setSaving(true)
    await onSave({
      ...form,
      id: initial?.id ?? '',
      createdAt: initial?.createdAt ?? ''
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[440px] bg-[#252526] border border-[#3c3c3c] rounded shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#3c3c3c]">
          <span className="text-sm font-semibold text-[#d4d4d4]">
            {initial ? 'Редактировать подключение' : 'Новое подключение'}
          </span>
          <button onClick={onClose} className="text-[#858585] hover:text-[#d4d4d4]">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <Field label="Название" required>
            <input
              type="text"
              placeholder="Мой MySQL сервер"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Хост" required className="flex-1">
              <input
                type="text"
                placeholder="localhost"
                value={form.host}
                onChange={(e) => set('host', e.target.value)}
              />
            </Field>
            <Field label="Порт" required className="w-24">
              <input
                type="number"
                placeholder="3306"
                value={form.port}
                onChange={(e) => set('port', Number(e.target.value))}
              />
            </Field>
          </div>

          <Field label="Пользователь" required>
            <input
              type="text"
              placeholder="root"
              value={form.user}
              onChange={(e) => set('user', e.target.value)}
            />
          </Field>

          <Field label="Пароль">
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>

          <Field label="База данных по умолчанию">
            <input
              type="text"
              placeholder="(необязательно)"
              value={form.database ?? ''}
              onChange={(e) => set('database', e.target.value)}
            />
          </Field>

          {/* Test result */}
          {testState !== 'idle' && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded ${
              testState === 'ok' ? 'bg-green-900/30 text-green-400' :
              testState === 'error' ? 'bg-red-900/30 text-red-400' :
              'bg-[#1e1e1e] text-[#858585]'
            }`}>
              {testState === 'loading' && <Loader2 size={13} className="animate-spin" />}
              {testState === 'ok' && <CheckCircle2 size={13} />}
              {testState === 'error' && <XCircle size={13} />}
              <span>{testState === 'loading' ? 'Проверяем подключение...' : testMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#3c3c3c]">
          <button
            onClick={handleTest}
            disabled={testState === 'loading'}
            className="px-3 py-1.5 text-xs bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#d4d4d4] rounded disabled:opacity-50 transition-colors"
          >
            {testState === 'loading' ? 'Тестируем...' : 'Тест подключения'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#858585] hover:text-[#d4d4d4] transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.host.trim() || !form.user.trim()}
              className="px-4 py-1.5 text-xs bg-[#0e7490] hover:bg-[#0c6478] text-white rounded disabled:opacity-50 transition-colors"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, required, children, className
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-xs text-[#858585]">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="[&_input]:w-full [&_input]:bg-[#3c3c3c] [&_input]:text-[#d4d4d4] [&_input]:text-sm [&_input]:px-3 [&_input]:py-1.5 [&_input]:rounded [&_input]:border [&_input]:border-[#555] [&_input:focus]:outline-none [&_input:focus]:border-[#007acc] [&_input]:transition-colors">
        {children}
      </div>
    </div>
  )
}
