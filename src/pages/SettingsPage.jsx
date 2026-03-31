import { useState } from 'react'
import { useAppStore, applyTheme } from '../store/appStore'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/shared/Toast'

const THEMES = [
  { id: 'dark',     label: 'Dark',     swatch: ['#0a0a1a', '#7c6af0', '#00d4a8'] },
  { id: 'midnight', label: 'Midnight', swatch: ['#05050f', '#9d8df5', '#00c49a'] },
  { id: 'slate',    label: 'Slate',    swatch: ['#0f1117', '#6d8df0', '#10b981'] },
  // Light themes
  { id: 'light',    label: 'Light',    swatch: ['#ffffff', '#4f46e5', '#10b981'] },
  { id: 'soft',     label: 'Soft',     swatch: ['#f5f7fb', '#7c6af0', '#34d399'] },
  { id: 'warm',     label: 'Warm',     swatch: ['#fff7ed', '#f97316', '#fb7185'] },
  // Cool / stylized themes
  { id: 'neon',     label: 'Neon',     swatch: ['#050505', '#39ff14', '#ff00ff'] },
  { id: 'cyber',    label: 'Cyber',    swatch: ['#0a0f1f', '#00e5ff', '#ff3cac'] },
  { id: 'forest',   label: 'Forest',   swatch: ['#0b1f14', '#22c55e', '#84cc16'] },
  { id: 'sunset',   label: 'Sunset',   swatch: ['#1a0f0a', '#f97316', '#ec4899'] },
];

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const { user, logout } = useAuth()
  const toast = useToast()
  const [dbStatus, setDbStatus] = useState(null)  // null | 'checking' | 'ok' | 'error'
  const [geminiStatus, setGeminiStatus] = useState(null)

  const handleTheme = (id) => {
    updateSettings({ theme: id })
    applyTheme(id)
  }

  const testDbConnection = async () => {
    setDbStatus('checking')
    try {
      // A simple authenticated GET to decks — if it works, DB is connected
      const res = await fetch('/.netlify/functions/decks', {
        headers: { Authorization: `Bearer ${await window.netlifyIdentity.currentUser().jwt()}` },
      })
      if (res.ok) {
        setDbStatus('ok')
        toast.success('Database connection OK')
      } else {
        setDbStatus('error')
        toast.error(`DB error: ${res.status}`)
      }
    } catch (e) {
      setDbStatus('error')
      toast.error(e.message)
    }
  }

  const testGemini = async () => {
    setGeminiStatus('checking')
    try {
      const token = await window.netlifyIdentity.currentUser().jwt()
      const res = await fetch('/.netlify/functions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          vocab: { vocab: ['test'], targetLanguage: 'Korean' },
          blueprint: [],
        }),
      })
      if (res.ok) {
        setGeminiStatus('ok')
        toast.success('Gemini API key is working')
      } else {
        const body = await res.json().catch(() => ({}))
        setGeminiStatus('error')
        toast.error(body.error || `Gemini error: ${res.status}`)
      }
    } catch (e) {
      setGeminiStatus('error')
      toast.error(e.message)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="section-title mb-1">Configuration</div>
      <h1 className="font-display text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>
        Settings
      </h1>

      {/* Account */}
      <Section title="Account">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {user?.user_metadata?.full_name || user?.email}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</div>
          </div>
          <button className="btn-danger text-xs flex-shrink-0" onClick={logout}>Sign out</button>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <SettingRow label="Theme" desc="Colour scheme — applied immediately">
          <div className="flex gap-2">
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => handleTheme(t.id)}
                title={t.label}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all"
                style={{
                  borderColor: settings.theme === t.id ? 'var(--accent-primary)' : 'var(--border)',
                  background: settings.theme === t.id ? 'var(--accent-glow)' : 'transparent',
                  minWidth: '60px',
                }}
              >
                {/* Swatch */}
                <div className="flex gap-0.5 rounded overflow-hidden" style={{ height: '20px', width: '44px' }}>
                  {t.swatch.map((c, i) => (
                    <div key={i} style={{ background: c, flex: 1 }} />
                  ))}
                </div>
                <span className="text-xs" style={{ color: settings.theme === t.id ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* Study defaults */}
      <Section title="Study Defaults">
        <SettingRow label="Default batch size" desc="Cards loaded per session">
          <input
            type="number" min={5} max={500}
            className="input w-20 text-center text-sm"
            value={settings.defaultBatchSize}
            onChange={e => updateSettings({ defaultBatchSize: Number(e.target.value) })}
          />
        </SettingRow>
      
        <SettingRow label="SRS algorithm" desc="Powers Learn mode scheduling">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent-secondary)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-secondary)', display: 'inline-block' }} />
            FSRS-5 active
          </span>
        </SettingRow>
      
        <SettingRow label="Animations" desc="Card flip and page transitions">
          <Toggle
            value={settings.animationsEnabled}
            onChange={v => updateSettings({ animationsEnabled: v })}
          />
        </SettingRow>

        <SettingRow label="Source language" desc="Base language for translations and AI generation">
          <input
            type="text"
            className="input w-32 text-sm text-center"
            value={settings.sourceLanguage ?? 'English'}
            onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
          />
        </SettingRow>
      
        {/* Quick Add Fields */}
        <div>
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Quick Add Fields
          </div>
          <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Control which fields appear when quickly adding new cards
          </div>
      
          <div className="space-y-2">
            {(settings.quickAddFields ?? []).map((field) => (
              <div
                key={field.key}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="min-w-0">
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {field.label}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {field.description}
                  </div>
                </div>
      
                <Toggle
                  value={field.show_on_front}
                  onChange={(v) => {
                    const next = (settings.quickAddFields ?? []).map(f =>
                      f.key === field.key ? { ...f, show_on_front: v } : f
                    )
                    updateSettings({ quickAddFields: next })
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Connections */}
      <Section title="Connections">
        <div className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          API keys live in Netlify environment variables and are never exposed to the browser.
          Use these buttons to verify your server-side configuration is working.
        </div>

        <div className="space-y-3">
          <ConnectionRow
            label="Neon Database"
            desc="PostgreSQL — stores all decks, cards, and review history"
            status={dbStatus}
            onTest={testDbConnection}
          />
          <ConnectionRow
            label="Gemini AI"
            desc="Google Gemini 2.0 Flash — generates card fields from vocabulary"
            status={geminiStatus}
            onTest={testGemini}
          />
        </div>

        <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="section-title mb-2">Required environment variables</div>
          <div className="font-mono text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
            <div><span style={{ color: 'var(--accent-secondary)' }}>GEMINI_API_KEY</span> — from aistudio.google.com</div>
            <div><span style={{ color: 'var(--accent-secondary)' }}>DATABASE_URL</span> — from neon.tech dashboard</div>
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Set in Netlify Dashboard → Site configuration → Environment variables
          </div>
        </div>
      </Section>

      {/* Data */}
      <Section title="Your Data">
        <div className="flex gap-2 flex-wrap">
          <div className="tag">
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: 'var(--accent-secondary)' }} />
            Neon Postgres
          </div>
          <div className="tag">
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: 'var(--accent-primary)' }} />
            Cloud sync
          </div>
          <div className="tag">
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: '#fdcb6e' }} />
            FSRS-5 scheduling
          </div>
        </div>
        <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          All decks, blueprints, cards, and review history are stored in your Neon database
          and available from any device you sign in with.
        </div>
      </Section>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="font-display font-semibold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <div className="card p-5 space-y-5">{children}</div>
    </div>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      role="switch" aria-checked={value}
      className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0"
      style={{ background: value ? 'var(--accent-primary)' : 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      onClick={() => onChange(!value)}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white"
        style={{ left: value ? '24px' : '3px', transition: 'left 0.2s' }}
      />
    </button>
  )
}

const STATUS_STYLES = {
  ok:       { color: 'var(--accent-secondary)', label: '✓ Connected' },
  error:    { color: 'var(--accent-danger)',     label: '✕ Failed' },
  checking: { color: '#fdcb6e',                  label: 'Testing...' },
}

function ConnectionRow({ label, desc, status, onTest }) {
  const s = status ? STATUS_STYLES[status] : null
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {s && (
          <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
        )}
        <button
          className="btn-secondary text-xs py-1.5 px-3"
          disabled={status === 'checking'}
          onClick={onTest}
        >
          {status === 'checking' ? '...' : 'Test'}
        </button>
      </div>
    </div>
  )
}
