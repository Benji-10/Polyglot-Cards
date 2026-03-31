import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const THEMES = {
  dark: {
    '--bg-primary':    '#0a0a1a',
    '--bg-surface':    '#12122a',
    '--bg-card':       '#1a1a3a',
    '--bg-elevated':   '#22224a',
    '--border':        '#2a2a5a',
    '--border-sub':    '#1e1e40',
    '--text-primary':  '#e8e8f8',
    '--text-secondary':'#9898c8',
    '--text-muted':    '#5858a0',
    '--accent-primary':'#7c6af0',
    '--accent-glow':   'rgba(124,106,240,.15)',
    '--accent-secondary':'#00d4a8',
    '--accent-danger': '#e17055',
  },

  midnight: {
    '--bg-primary':    '#05050f',
    '--bg-surface':    '#0a0a20',
    '--bg-card':       '#10102e',
    '--bg-elevated':   '#18183c',
    '--border':        '#202048',
    '--border-sub':    '#181838',
    '--text-primary':  '#ddddf5',
    '--text-secondary':'#8080b8',
    '--text-muted':    '#4848a8',
    '--accent-primary':'#9d8df5',
    '--accent-glow':   'rgba(157,141,245,.15)',
    '--accent-secondary':'#00c49a',
    '--accent-danger': '#e06050',
  },

  slate: {
    '--bg-primary':    '#0f1117',
    '--bg-surface':    '#161b27',
    '--bg-card':       '#1c2333',
    '--bg-elevated':   '#232d42',
    '--border':        '#2d3a52',
    '--border-sub':    '#232d42',
    '--text-primary':  '#e2e8f0',
    '--text-secondary':'#94a3b8',
    '--text-muted':    '#64748b',
    '--accent-primary':'#6d8df0',
    '--accent-glow':   'rgba(109,141,240,.15)',
    '--accent-secondary':'#10b981',
    '--accent-danger': '#f87171',
  },

  // LIGHT THEMES

  light: {
    '--bg-primary':    '#ffffff',
    '--bg-surface':    '#f8fafc',
    '--bg-card':       '#f1f5f9',
    '--bg-elevated':   '#e2e8f0',
    '--border':        '#cbd5f5',
    '--border-sub':    '#e2e8f0',
    '--text-primary':  '#0f172a',
    '--text-secondary':'#475569',
    '--text-muted':    '#94a3b8',
    '--accent-primary':'#4f46e5',
    '--accent-glow':   'rgba(79,70,229,.15)',
    '--accent-secondary':'#10b981',
    '--accent-danger': '#ef4444',
  },

  soft: {
    '--bg-primary':    '#f5f7fb',
    '--bg-surface':    '#eef2f7',
    '--bg-card':       '#e6ebf2',
    '--bg-elevated':   '#dde3ec',
    '--border':        '#c7d2e0',
    '--border-sub':    '#dde3ec',
    '--text-primary':  '#1e293b',
    '--text-secondary':'#64748b',
    '--text-muted':    '#94a3b8',
    '--accent-primary':'#7c6af0',
    '--accent-glow':   'rgba(124,106,240,.12)',
    '--accent-secondary':'#34d399',
    '--accent-danger': '#f87171',
  },

  warm: {
    '--bg-primary':    '#fff7ed',
    '--bg-surface':    '#ffedd5',
    '--bg-card':       '#fed7aa',
    '--bg-elevated':   '#fdba74',
    '--border':        '#fb923c',
    '--border-sub':    '#fdba74',
    '--text-primary':  '#431407',
    '--text-secondary':'#9a3412',
    '--text-muted':    '#c2410c',
    '--accent-primary':'#f97316',
    '--accent-glow':   'rgba(249,115,22,.15)',
    '--accent-secondary':'#fb7185',
    '--accent-danger': '#dc2626',
  },

  // STYLIZED THEMES

  neon: {
    '--bg-primary':    '#050505',
    '--bg-surface':    '#0a0a0a',
    '--bg-card':       '#111111',
    '--bg-elevated':   '#1a1a1a',
    '--border':        '#2a2a2a',
    '--border-sub':    '#1a1a1a',
    '--text-primary':  '#eaffea',
    '--text-secondary':'#a3ffa3',
    '--text-muted':    '#5cff5c',
    '--accent-primary':'#39ff14',
    '--accent-glow':   'rgba(57,255,20,.25)',
    '--accent-secondary':'#ff00ff',
    '--accent-danger': '#ff3131',
  },

  cyber: {
    '--bg-primary':    '#0a0f1f',
    '--bg-surface':    '#0f1630',
    '--bg-card':       '#141c3d',
    '--bg-elevated':   '#1b2550',
    '--border':        '#24306a',
    '--border-sub':    '#1b2550',
    '--text-primary':  '#e0f2ff',
    '--text-secondary':'#7dd3fc',
    '--text-muted':    '#38bdf8',
    '--accent-primary':'#00e5ff',
    '--accent-glow':   'rgba(0,229,255,.2)',
    '--accent-secondary':'#ff3cac',
    '--accent-danger': '#fb7185',
  },

  forest: {
    '--bg-primary':    '#0b1f14',
    '--bg-surface':    '#122a1d',
    '--bg-card':       '#163524',
    '--bg-elevated':   '#1f4630',
    '--border':        '#2f5d44',
    '--border-sub':    '#1f4630',
    '--text-primary':  '#ecfdf5',
    '--text-secondary':'#86efac',
    '--text-muted':    '#4ade80',
    '--accent-primary':'#22c55e',
    '--accent-glow':   'rgba(34,197,94,.2)',
    '--accent-secondary':'#84cc16',
    '--accent-danger': '#f87171',
  },

  sunset: {
    '--bg-primary':    '#1a0f0a',
    '--bg-surface':    '#2a160f',
    '--bg-card':       '#3a1d14',
    '--bg-elevated':   '#4a2418',
    '--border':        '#5a2d1c',
    '--border-sub':    '#4a2418',
    '--text-primary':  '#fff7ed',
    '--text-secondary':'#fdba74',
    '--text-muted':    '#fb923c',
    '--accent-primary':'#f97316',
    '--accent-glow':   'rgba(249,115,22,.2)',
    '--accent-secondary':'#ec4899',
    '--accent-danger': '#ef4444',
  },
}

export function applyTheme(name) {
  const vars = THEMES[name] || THEMES.dark
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
}

// Default quick-add field suggestions shown in Blueprint page
export const DEFAULT_QUICK_ADD = [
  { key: 'reading',    label: 'Reading / Phonetic',   description: 'The pronunciation guide for the word',                                                   field_type: 'text',    show_on_front: true,  phonetics: { ruby: 'none', extras: [] } },
  { key: 'japanese',   label: 'Japanese',              description: 'The Japanese equivalent or translation',                                                 field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'chinese',    label: 'Chinese (Simplified)',  description: 'The Chinese Simplified equivalent or translation',                                       field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'hanja',      label: 'Hanja',                 description: 'The Hanja (Chinese characters) form',                                                    field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'example',   label: 'Example Sentence',       description: 'A natural sentence using the word. Wrap ONLY the target word with {{word}}.',            field_type: 'example', show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'definition', label: 'Definition',            description: 'A brief English definition',                                                             field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'notes',      label: 'Notes',                 description: 'Grammar notes, register, or usage tips',                                                 field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
]

export const useAppStore = create(
  persist(
    (set) => ({
      activeDeckId: null,
      setActiveDeckId: (id) => set({ activeDeckId: id }),

      settings: {
        theme: 'dark',
        defaultBatchSize: 20,
        animationsEnabled: true,
        quickAddFields: DEFAULT_QUICK_ADD,
      },
      updateSettings: (patch) => set((s) => {
        const next = { ...s.settings, ...patch }
        if (patch.theme) applyTheme(patch.theme)
        return { settings: next }
      }),
    }),
    {
      name: 'polyglot-store',
      partialize: (s) => ({ activeDeckId: s.activeDeckId, settings: s.settings }),
      onRehydrateStorage: () => (state) => {
        if (state?.settings?.theme) applyTheme(state.settings.theme)
      },
    }
  )
)
