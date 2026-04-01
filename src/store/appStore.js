import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const PRESET_THEMES = {
  dark: {
    label: 'Dark',
    swatch: ['#0a0a1a', '#7c6af0', '#00d4a8'],
    vars: {
      '--bg-primary':      '#0a0a1a',
      '--bg-surface':      '#12122a',
      '--bg-card':         '#1a1a3a',
      '--bg-elevated':     '#22224a',
      '--border':          '#2a2a5a',
      '--border-sub':      '#1e1e40',
      '--text-primary':    '#e8e8f8',
      '--text-secondary':  '#9898c8',
      '--text-muted':      '#5858a0',
      '--accent-primary':  '#7c6af0',
      '--accent-glow':     'rgba(124,106,240,.15)',
      '--accent-secondary':'#00d4a8',
      '--accent-danger':   '#e17055',
    },
  },
  midnight: {
    label: 'Midnight',
    swatch: ['#05050f', '#9d8df5', '#00c49a'],
    vars: {
      '--bg-primary':      '#05050f',
      '--bg-surface':      '#0a0a20',
      '--bg-card':         '#10102e',
      '--bg-elevated':     '#18183c',
      '--border':          '#202048',
      '--border-sub':      '#181838',
      '--text-primary':    '#ddddf5',
      '--text-secondary':  '#8080b8',
      '--text-muted':      '#484888',
      '--accent-primary':  '#9d8df5',
      '--accent-glow':     'rgba(157,141,245,.15)',
      '--accent-secondary':'#00c49a',
      '--accent-danger':   '#e06050',
    },
  },
  slate: {
    label: 'Slate',
    swatch: ['#0f1117', '#6d8df0', '#10b981'],
    vars: {
      '--bg-primary':      '#0f1117',
      '--bg-surface':      '#161b27',
      '--bg-card':         '#1c2333',
      '--bg-elevated':     '#232d42',
      '--border':          '#2d3a52',
      '--border-sub':      '#232d42',
      '--text-primary':    '#e2e8f0',
      '--text-secondary':  '#94a3b8',
      '--text-muted':      '#64748b',
      '--accent-primary':  '#6d8df0',
      '--accent-glow':     'rgba(109,141,240,.15)',
      '--accent-secondary':'#10b981',
      '--accent-danger':   '#f87171',
    },
  },
  forest: {
    label: 'Forest',
    swatch: ['#0a1208', '#22c55e', '#34d399'],
    vars: {
      '--bg-primary':      '#0a1208',
      '--bg-surface':      '#0f1a0d',
      '--bg-card':         '#152413',
      '--bg-elevated':     '#1c2e18',
      '--border':          '#253d20',
      '--border-sub':      '#1c2e18',
      '--text-primary':    '#d1fae5',
      '--text-secondary':  '#86efac',
      '--text-muted':      '#4ade80',
      '--accent-primary':  '#22c55e',
      '--accent-glow':     'rgba(34,197,94,.15)',
      '--accent-secondary':'#34d399',
      '--accent-danger':   '#f87171',
    },
  },
  ember: {
    label: 'Ember',
    swatch: ['#120a08', '#f97316', '#fbbf24'],
    vars: {
      '--bg-primary':      '#120a08',
      '--bg-surface':      '#1a0e0a',
      '--bg-card':         '#22140f',
      '--bg-elevated':     '#2c1a13',
      '--border':          '#3d2419',
      '--border-sub':      '#2c1a13',
      '--text-primary':    '#fef3c7',
      '--text-secondary':  '#fcd34d',
      '--text-muted':      '#d97706',
      '--accent-primary':  '#f97316',
      '--accent-glow':     'rgba(249,115,22,.15)',
      '--accent-secondary':'#fbbf24',
      '--accent-danger':   '#ef4444',
    },
  },
}

// The user-editable CSS vars for custom theme
export const CUSTOM_THEME_KEYS = [
  { key: '--bg-primary',      label: 'Background' },
  { key: '--bg-surface',      label: 'Surface' },
  { key: '--bg-card',         label: 'Card' },
  { key: '--bg-elevated',     label: 'Elevated' },
  { key: '--border',          label: 'Border' },
  { key: '--text-primary',    label: 'Text primary' },
  { key: '--text-secondary',  label: 'Text secondary' },
  { key: '--text-muted',      label: 'Text muted' },
  { key: '--accent-primary',  label: 'Accent primary' },
  { key: '--accent-secondary',label: 'Accent secondary' },
  { key: '--accent-danger',   label: 'Danger' },
]

export const DEFAULT_CUSTOM_THEME = {
  '--bg-primary':      '#0a0a1a',
  '--bg-surface':      '#12122a',
  '--bg-card':         '#1a1a3a',
  '--bg-elevated':     '#22224a',
  '--border':          '#2a2a5a',
  '--text-primary':    '#e8e8f8',
  '--text-secondary':  '#9898c8',
  '--text-muted':      '#5858a0',
  '--accent-primary':  '#7c6af0',
  '--accent-secondary':'#00d4a8',
  '--accent-danger':   '#e17055',
}

function deriveGlow(accent) {
  try {
    const r = parseInt(accent.slice(1, 3), 16)
    const g = parseInt(accent.slice(3, 5), 16)
    const b = parseInt(accent.slice(5, 7), 16)
    return `rgba(${r},${g},${b},.15)`
  } catch { return 'rgba(124,106,240,.15)' }
}

export function applyTheme(name, customVars) {
  let vars
  if (name === 'custom') {
    const c = customVars || DEFAULT_CUSTOM_THEME
    vars = {
      ...c,
      '--accent-glow': deriveGlow(c['--accent-primary'] || '#7c6af0'),
      '--border-sub':  c['--border'] || '#1e1e40',
    }
  } else {
    vars = PRESET_THEMES[name]?.vars || PRESET_THEMES.dark.vars
  }
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
}

// Default quick-add field suggestions shown in Blueprint page
export const DEFAULT_QUICK_ADD = [
  { key: 'reading',    label: 'Reading / Phonetic',   description: 'The pronunciation guide for the word',                                        field_type: 'text',    show_on_front: true,  phonetics: { ruby: 'none', extras: [] } },
  { key: 'japanese',   label: 'Japanese',              description: 'The Japanese equivalent or translation',                                      field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'chinese',    label: 'Chinese (Simplified)',  description: 'The Chinese Simplified equivalent or translation',                            field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'hanja',      label: 'Hanja',                 description: 'The Hanja (Chinese characters) form',                                        field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'example',   label: 'Example Sentence',       description: 'A natural sentence using the word. Wrap ONLY the target word with {{word}}.', field_type: 'example', show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'definition', label: 'Definition',            description: 'A brief English definition',                                                  field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'notes',      label: 'Notes',                 description: 'Grammar notes, register, or usage tips',                                     field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
]

export const useAppStore = create(
  persist(
    (set) => ({
      activeDeckId: null,
      setActiveDeckId: (id) => set({ activeDeckId: id }),

      // Per-deck study config persistence: { [deckId]: { direction, interaction, batchSize, ... } }
      sessionConfigs: {},
      saveSessionConfig: (deckId, config) => set(s => ({
        sessionConfigs: { ...s.sessionConfigs, [deckId]: config },
      })),

      settings: {
        theme: 'dark',
        customTheme: DEFAULT_CUSTOM_THEME,
        defaultBatchSize: 20,
        defaultSourceLanguage: 'English',
        animationsEnabled: true,
        quickAddFields: DEFAULT_QUICK_ADD,
      },
      updateSettings: (patch) => set((s) => {
        const next = { ...s.settings, ...patch }
        if (patch.theme !== undefined || patch.customTheme !== undefined) {
          applyTheme(next.theme, next.customTheme)
        }
        return { settings: next }
      }),
    }),
    {
      name: 'polyglot-store',
      partialize: (s) => ({ activeDeckId: s.activeDeckId, settings: s.settings, sessionConfigs: s.sessionConfigs }),
      onRehydrateStorage: () => (state) => {
        if (state?.settings?.theme) applyTheme(state.settings.theme, state.settings.customTheme)
      },
    }
  )
)
