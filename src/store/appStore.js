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
    '--text-muted':    '#4848888',
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
