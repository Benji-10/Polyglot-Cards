import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useAuth } from '../hooks/useAuth'

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const { user, logout } = useAuth()
  const [saved, setSaved] = useState(false)

  const save = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="section-title mb-1">Configuration</div>
      <h1 className="font-display text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>Settings</h1>

      {/* Account */}
      <Section title="Account">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user?.email}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Signed in via Netlify Identity</div>
          </div>
          <button className="btn-danger text-xs" onClick={logout}>Sign out</button>
        </div>
      </Section>

      {/* Study */}
      <Section title="Study Defaults">
        <SettingRow label="Default batch size" desc="Cards per study session">
          <input type="number" min={5} max={500} className="input w-20 text-center text-sm"
            value={settings.defaultBatchSize}
            onChange={e => updateSettings({ defaultBatchSize: Number(e.target.value) })} />
        </SettingRow>
        <SettingRow label="FSRS Algorithm" desc="Spaced repetition scheduling in Learn mode">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-secondary)' }} />
            <span className="text-xs" style={{ color: 'var(--accent-secondary)' }}>Active (FSRS-5)</span>
          </div>
        </SettingRow>
        <SettingRow label="Animations" desc="Card flip and transition animations">
          <Toggle value={settings.animationsEnabled}
            onChange={v => updateSettings({ animationsEnabled: v })} />
        </SettingRow>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <SettingRow label="Theme" desc="Interface colour scheme">
          <div className="flex gap-2">
            {['dark', 'midnight', 'slate'].map(t => (
              <button key={t}
                className="text-xs px-3 py-1.5 rounded-lg border transition-all capitalize"
                style={{ borderColor: settings.theme === t ? 'var(--accent-primary)' : 'var(--border)', color: settings.theme === t ? 'var(--accent-primary)' : 'var(--text-muted)', background: settings.theme === t ? 'var(--accent-glow)' : 'transparent' }}
                onClick={() => updateSettings({ theme: t })}>
                {t}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* API Keys */}
      <Section title="API Configuration">
        <div className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          API keys are stored as Netlify environment variables on the server — never exposed to the browser.
        </div>
        <div className="rounded-xl p-4 text-xs font-mono space-y-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-muted)' }}># Set in Netlify Dashboard → Site settings → Environment variables</div>
          <div style={{ color: 'var(--accent-secondary)' }}>GEMINI_API_KEY=<span style={{ color: 'var(--text-muted)' }}>your-gemini-api-key</span></div>
          <div style={{ color: 'var(--accent-secondary)' }}>DATABASE_URL=<span style={{ color: 'var(--text-muted)' }}>postgresql://...</span></div>
        </div>
      </Section>

      {/* Database */}
      <Section title="Data">
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          All your decks, blueprints, cards, and review history are stored in your Neon Postgres database and synced across devices automatically.
        </div>
        <div className="mt-3 flex gap-2">
          <div className="tag">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--accent-secondary)' }} />
            Neon Postgres
          </div>
          <div className="tag">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--accent-primary)' }} />
            Cloud sync
          </div>
        </div>
      </Section>

      <button className="btn-primary mt-2" onClick={save}>
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="font-display font-semibold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h2>
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
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      className="w-11 h-6 rounded-full transition-colors relative shrink-0"
      style={{ background: value ? 'var(--accent-primary)' : 'var(--bg-elevated)' }}
      onClick={() => onChange(!value)}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}
