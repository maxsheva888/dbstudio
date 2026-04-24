import React, { useState } from 'react'
import { X, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import type { ConnectionConfig, DbType, SSHConfig } from '@shared/types'
import { CONNECTION_TAGS } from '@renderer/constants/connectionTags'

interface Props {
  initial?: ConnectionConfig
  onSave: (config: ConnectionConfig) => Promise<void>
  onClose: () => void
}

const DB_TYPES: { value: DbType; label: string; defaultPort: number }[] = [
  { value: 'mysql',    label: 'MySQL',      defaultPort: 3306 },
  { value: 'postgres', label: 'PostgreSQL', defaultPort: 5432 },
  { value: 'sqlite',   label: 'SQLite',     defaultPort: 0 },
]

const EMPTY_SSH: SSHConfig = { host: '', port: 22, user: '', authType: 'password', password: '', keyPath: '', passphrase: '' }

function makeEmpty(): Omit<ConnectionConfig, 'id' | 'createdAt'> {
  return { type: 'mysql', name: '', host: 'localhost', port: 3306, user: 'root', password: '', database: '', filePath: '', tag: undefined, ssh: undefined }
}

type TestState = 'idle' | 'loading' | 'ok' | 'error'

export default function ConnectionModal({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<Omit<ConnectionConfig, 'id' | 'createdAt'>>(() => {
    if (!initial) return makeEmpty()
    return { ...makeEmpty(), ...initial }
  })
  const [sshEnabled, setSshEnabled] = useState(!!initial?.ssh)
  const [sshForm, setSshForm] = useState<SSHConfig>(initial?.ssh ?? EMPTY_SSH)
  const [sshOpen, setSshOpen] = useState(!!initial?.ssh)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [testMsg, setTestMsg] = useState('')

  const type = form.type ?? 'mysql'
  const isSQLite = type === 'sqlite'
  const hasSsh = !isSQLite

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }))
    setTestState('idle')
  }

  function setSsh<K extends keyof SSHConfig>(key: K, value: SSHConfig[K]) {
    setSshForm((p) => ({ ...p, [key]: value }))
    setTestState('idle')
  }

  function handleTypeChange(t: DbType) {
    const info = DB_TYPES.find((d) => d.value === t)!
    setForm((p) => ({ ...p, type: t, port: t !== 'sqlite' ? info.defaultPort : p.port }))
    if (t === 'sqlite') { setSshEnabled(false); setSshOpen(false) }
    setTestState('idle')
  }

  async function pickFile(mode: 'sqlite' | 'sshkey') {
    const path = await window.api.connections.pickFile(mode)
    if (!path) return
    if (mode === 'sqlite') set('filePath', path)
    else setSsh('keyPath', path)
  }

  async function handleTest() {
    setTestState('loading')
    setTestMsg('')
    const config = buildConfig()
    const result = await window.api.connections.test(config)
    setTestState(result.success ? 'ok' : 'error')
    setTestMsg(result.message + (result.latencyMs ? ` (${result.latencyMs} мс)` : ''))
  }

  function buildConfig(): Omit<ConnectionConfig, 'id' | 'createdAt'> {
    const base = { ...form }
    base.ssh = (sshEnabled && !isSQLite) ? { ...sshForm } : undefined
    return base
  }

  async function handleSave() {
    if (!canSave()) return
    setSaving(true)
    await onSave({ ...buildConfig(), id: initial?.id ?? '', createdAt: initial?.createdAt ?? '' })
    setSaving(false)
    onClose()
  }

  function canSave(): boolean {
    if (!form.name.trim()) return false
    if (isSQLite) return !!(form.filePath?.trim())
    return !!(form.host.trim() && form.user.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[520px] max-h-[90vh] flex flex-col bg-vs-sidebar border border-vs-border rounded shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-vs-border shrink-0">
          <span className="text-sm font-semibold text-vs-text">
            {initial ? 'Редактировать подключение' : 'Новое подключение'}
          </span>
          <button onClick={onClose} className="text-vs-textDim hover:text-vs-text"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {/* DB type selector */}
          <div className="flex gap-2">
            {DB_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleTypeChange(t.value)}
                className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                  type === t.value
                    ? 'border-vs-statusBar bg-vs-statusBar/10 text-vs-text'
                    : 'border-vs-border text-vs-textDim hover:border-vs-textDim hover:text-vs-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Common: name */}
          <Field label="Название" required>
            <input type="text" placeholder="Мой сервер" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          {/* SQLite: file picker */}
          {isSQLite ? (
            <Field label="Файл базы данных" required>
              <div className="flex gap-2">
                <input
                  type="text" placeholder="/path/to/database.db"
                  value={form.filePath ?? ''}
                  onChange={(e) => set('filePath', e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => pickFile('sqlite')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-vs-input hover:bg-vs-hover text-vs-text rounded border border-vs-border transition-colors shrink-0"
                >
                  <FolderOpen size={13} />
                  Выбрать
                </button>
              </div>
            </Field>
          ) : (
            <>
              {/* MySQL / PostgreSQL fields */}
              <div className="flex gap-3">
                <Field label="Хост" required className="flex-1">
                  <input type="text" placeholder="localhost" value={form.host} onChange={(e) => set('host', e.target.value)} />
                </Field>
                <Field label="Порт" required className="w-24">
                  <input type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} />
                </Field>
              </div>
              <Field label="Пользователь" required>
                <input type="text" placeholder="root" value={form.user} onChange={(e) => set('user', e.target.value)} />
              </Field>
              <Field label="Пароль">
                <input type="password" placeholder="••••••••" value={form.password} onChange={(e) => set('password', e.target.value)} />
              </Field>
              <Field label={type === 'postgres' ? 'База данных (обязательно для Postgres)' : 'База данных по умолчанию'}>
                <input type="text" placeholder={type === 'postgres' ? 'postgres' : '(необязательно)'} value={form.database ?? ''} onChange={(e) => set('database', e.target.value)} />
              </Field>
            </>
          )}

          {/* Tag */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-vs-textDim">Тег среды</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button" onClick={() => set('tag', undefined)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${!form.tag ? 'border-vs-statusBar text-vs-text bg-vs-input' : 'border-vs-border text-vs-textDim hover:border-vs-textDim'}`}
              >
                Нет
              </button>
              {CONNECTION_TAGS.map((t) => (
                <button key={t.key} type="button" onClick={() => set('tag', t.key)}
                  className={`px-3 py-1 text-xs rounded border transition-all flex items-center gap-1.5 ${form.tag === t.key ? 'border-transparent text-white' : 'border-vs-border text-vs-textDim hover:border-vs-textDim'}`}
                  style={form.tag === t.key ? { backgroundColor: t.color } : undefined}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* SSH tunnel section */}
          {hasSsh && (
            <div className="border border-vs-border rounded overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  if (!sshEnabled) { setSshEnabled(true); setSshOpen(true) }
                  else setSshOpen((v) => !v)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-vs-textDim hover:text-vs-text hover:bg-vs-hover transition-colors"
              >
                {sshOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="flex-1 text-left">SSH-туннель</span>
                {sshEnabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4ec9b0]/20 text-[#4ec9b0]">включён</span>
                )}
              </button>

              {sshOpen && (
                <div className="px-3 pb-3 pt-1 flex flex-col gap-2 bg-vs-bg/50 border-t border-vs-border">
                  <div className="flex gap-2 items-center mb-1">
                    <label className="text-xs text-vs-textDim flex-1">Включить SSH-туннель</label>
                    <button
                      type="button"
                      onClick={() => setSshEnabled((v) => !v)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${sshEnabled ? 'bg-[#4ec9b0]' : 'bg-vs-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${sshEnabled ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {sshEnabled && (
                    <>
                      <div className="flex gap-3">
                        <Field label="SSH Хост" required className="flex-1">
                          <input type="text" placeholder="bastion.example.com" value={sshForm.host} onChange={(e) => setSsh('host', e.target.value)} />
                        </Field>
                        <Field label="Порт" className="w-20">
                          <input type="number" value={sshForm.port} onChange={(e) => setSsh('port', Number(e.target.value))} />
                        </Field>
                      </div>
                      <Field label="SSH Пользователь" required>
                        <input type="text" placeholder="ubuntu" value={sshForm.user} onChange={(e) => setSsh('user', e.target.value)} />
                      </Field>

                      {/* Auth type */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-vs-textDim">Аутентификация</label>
                        <div className="flex gap-2">
                          {(['password', 'key'] as const).map((authType) => (
                            <button key={authType} type="button" onClick={() => setSsh('authType', authType)}
                              className={`flex-1 py-1 text-xs rounded border transition-colors ${sshForm.authType === authType ? 'border-vs-statusBar bg-vs-statusBar/10 text-vs-text' : 'border-vs-border text-vs-textDim hover:border-vs-textDim'}`}
                            >
                              {authType === 'password' ? 'Пароль' : 'Приватный ключ'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {sshForm.authType === 'password' ? (
                        <Field label="SSH Пароль">
                          <input type="password" placeholder="••••••••" value={sshForm.password ?? ''} onChange={(e) => setSsh('password', e.target.value)} />
                        </Field>
                      ) : (
                        <>
                          <Field label="Файл приватного ключа">
                            <div className="flex gap-2">
                              <input type="text" placeholder="~/.ssh/id_rsa" value={sshForm.keyPath ?? ''} onChange={(e) => setSsh('keyPath', e.target.value)} className="flex-1" />
                              <button type="button" onClick={() => pickFile('sshkey')}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-vs-input hover:bg-vs-hover text-vs-text rounded border border-vs-border transition-colors shrink-0">
                                <FolderOpen size={13} />
                              </button>
                            </div>
                          </Field>
                          <Field label="Passphrase (если есть)">
                            <input type="password" placeholder="(необязательно)" value={sshForm.passphrase ?? ''} onChange={(e) => setSsh('passphrase', e.target.value)} />
                          </Field>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Test result */}
          {testState !== 'idle' && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded ${
              testState === 'ok' ? 'bg-green-900/30 text-green-400' :
              testState === 'error' ? 'bg-red-900/30 text-red-400' : 'bg-vs-bg text-vs-textDim'
            }`}>
              {testState === 'loading' && <Loader2 size={13} className="animate-spin" />}
              {testState === 'ok' && <CheckCircle2 size={13} />}
              {testState === 'error' && <XCircle size={13} />}
              <span>{testState === 'loading' ? 'Проверяем подключение...' : testMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-vs-border shrink-0">
          <button onClick={handleTest} disabled={testState === 'loading'}
            className="px-3 py-1.5 text-xs bg-vs-input hover:bg-vs-hover text-vs-text rounded disabled:opacity-50 transition-colors">
            {testState === 'loading' ? 'Тестируем...' : 'Тест подключения'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-vs-textDim hover:text-vs-text transition-colors">Отмена</button>
            <button onClick={handleSave} disabled={saving || !canSave()}
              className="px-4 py-1.5 text-xs bg-[#0e7490] hover:bg-[#0c6478] text-white rounded disabled:opacity-50 transition-colors">
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-xs text-vs-textDim">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="[&_input]:w-full [&_input]:bg-vs-input [&_input]:text-vs-text [&_input]:text-sm [&_input]:px-3 [&_input]:py-1.5 [&_input]:rounded [&_input]:border [&_input]:border-vs-border [&_input:focus]:outline-none [&_input:focus]:border-vs-statusBar [&_input]:transition-colors">
        {children}
      </div>
    </div>
  )
}
