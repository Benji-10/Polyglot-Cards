import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const PRESET_THEMES = {
  dark: {
    label: 'Dark',
    swatch: ['#0a0a1a', '#7c6af0', '#00d4a8'],
    vars: {
      '--bg-primary': '#0a0a1a',
      '--bg-surface': '#12122a',
      '--bg-card': '#1a1a3a',
      '--bg-elevated': '#22224a',
      '--border': '#2a2a5a',
      '--border-sub': '#1e1e40',
      '--text-primary': '#e8e8f8',
      '--text-secondary': '#9898c8',
      '--text-muted': '#5858a0',
      '--accent-primary': '#7c6af0',
      '--accent-glow': 'rgba(124,106,240,.15)',
      '--accent-secondary': '#00d4a8',
      '--accent-danger': '#e17055',
    },
  },
  midnight: {
    label: 'Midnight',
    swatch: ['#05050f', '#9d8df5', '#00c49a'],
    vars: {
      '--bg-primary': '#05050f',
      '--bg-surface': '#0a0a20',
      '--bg-card': '#10102e',
      '--bg-elevated': '#18183c',
      '--border': '#202048',
      '--border-sub': '#181838',
      '--text-primary': '#ddddf5',
      '--text-secondary': '#8080b8',
      '--text-muted': '#4848a8',
      '--accent-primary': '#9d8df5',
      '--accent-glow': 'rgba(157,141,245,.15)',
      '--accent-secondary': '#00c49a',
      '--accent-danger': '#e06050',
    },
  },
  slate: {
    label: 'Slate',
    swatch: ['#0f1117', '#6d8df0', '#10b981'],
    vars: {
      '--bg-primary': '#0f1117',
      '--bg-surface': '#161b27',
      '--bg-card': '#1c2333',
      '--bg-elevated': '#232d42',
      '--border': '#2d3a52',
      '--border-sub': '#232d42',
      '--text-primary': '#e2e8f0',
      '--text-secondary': '#94a3b8',
      '--text-muted': '#64748b',
      '--accent-primary': '#6d8df0',
      '--accent-glow': 'rgba(109,141,240,.15)',
      '--accent-secondary': '#10b981',
      '--accent-danger': '#f87171',
    },
  },
  light: {
    label: 'Light',
    swatch: ['#ffffff', '#4f46e5', '#10b981'],
    vars: {
      '--bg-primary': '#ffffff',
      '--bg-surface': '#f8fafc',
      '--bg-card': '#f1f5f9',
      '--bg-elevated': '#e2e8f0',
      '--border': '#cbd5f5',
      '--border-sub': '#e2e8f0',
      '--text-primary': '#0f172a',
      '--text-secondary': '#475569',
      '--text-muted': '#94a3b8',
      '--accent-primary': '#4f46e5',
      '--accent-glow': 'rgba(79,70,229,.15)',
      '--accent-secondary': '#10b981',
      '--accent-danger': '#ef4444',
    },
  },
  soft: {
    label: 'Soft',
    swatch: ['#f5f7fb', '#7c6af0', '#34d399'],
    vars: {
      '--bg-primary': '#f5f7fb',
      '--bg-surface': '#eef2f7',
      '--bg-card': '#e6ebf2',
      '--bg-elevated': '#dde3ec',
      '--border': '#c7d2e0',
      '--border-sub': '#dde3ec',
      '--text-primary': '#1e293b',
      '--text-secondary': '#64748b',
      '--text-muted': '#94a3b8',
      '--accent-primary': '#7c6af0',
      '--accent-glow': 'rgba(124,106,240,.12)',
      '--accent-secondary': '#34d399',
      '--accent-danger': '#f87171',
    },
  },
  warm: {
    label: 'Warm',
    swatch: ['#fff7ed', '#f97316', '#fb7185'],
    vars: {
      '--bg-primary': '#fff7ed',
      '--bg-surface': '#ffedd5',
      '--bg-card': '#fed7aa',
      '--bg-elevated': '#fdba74',
      '--border': '#fb923c',
      '--border-sub': '#fdba74',
      '--text-primary': '#431407',
      '--text-secondary': '#9a3412',
      '--text-muted': '#c2410c',
      '--accent-primary': '#f97316',
      '--accent-glow': 'rgba(249,115,22,.15)',
      '--accent-secondary': '#fb7185',
      '--accent-danger': '#dc2626',
    },
  },
  neon: {
    label: 'Neon',
    swatch: ['#050505', '#39ff14', '#ff00ff'],
    vars: {
      '--bg-primary': '#050505',
      '--bg-surface': '#0a0a0a',
      '--bg-card': '#111111',
      '--bg-elevated': '#1a1a1a',
      '--border': '#2a2a2a',
      '--border-sub': '#1a1a1a',
      '--text-primary': '#eaffea',
      '--text-secondary': '#a3ffa3',
      '--text-muted': '#5cff5c',
      '--accent-primary': '#39ff14',
      '--accent-glow': 'rgba(57,255,20,.25)',
      '--accent-secondary': '#ff00ff',
      '--accent-danger': '#ff3131',
    },
  },
  cyber: {
    label: 'Cyber',
    swatch: ['#0a0f1f', '#00e5ff', '#ff3cac'],
    vars: {
      '--bg-primary': '#0a0f1f',
      '--bg-surface': '#0f1630',
      '--bg-card': '#141c3d',
      '--bg-elevated': '#1b2550',
      '--border': '#24306a',
      '--border-sub': '#1b2550',
      '--text-primary': '#e0f2ff',
      '--text-secondary': '#7dd3fc',
      '--text-muted': '#38bdf8',
      '--accent-primary': '#00e5ff',
      '--accent-glow': 'rgba(0,229,255,.2)',
      '--accent-secondary': '#ff3cac',
      '--accent-danger': '#fb7185',
    },
  },
  forest: {
    label: 'Forest',
    swatch: ['#0b1f14', '#22c55e', '#84cc16'],
    vars: {
      '--bg-primary': '#0b1f14',
      '--bg-surface': '#122a1d',
      '--bg-card': '#163524',
      '--bg-elevated': '#1f4630',
      '--border': '#2f5d44',
      '--border-sub': '#1f4630',
      '--text-primary': '#ecfdf5',
      '--text-secondary': '#86efac',
      '--text-muted': '#4ade80',
      '--accent-primary': '#22c55e',
      '--accent-glow': 'rgba(34,197,94,.2)',
      '--accent-secondary': '#84cc16',
      '--accent-danger': '#f87171',
    },
  },
  sunset: {
    label: 'Sunset',
    swatch: ['#1a0f0a', '#f97316', '#ec4899'],
    vars: {
      '--bg-primary': '#1a0f0a',
      '--bg-surface': '#2a160f',
      '--bg-card': '#3a1d14',
      '--bg-elevated': '#4a2418',
      '--border': '#5a2d1c',
      '--border-sub': '#4a2418',
      '--text-primary': '#fff7ed',
      '--text-secondary': '#fdba74',
      '--text-muted': '#fb923c',
      '--accent-primary': '#f97316',
      '--accent-glow': 'rgba(249,115,22,.2)',
      '--accent-secondary': '#ec4899',
      '--accent-danger': '#ef4444',
    },
  },
  ocean: {
    label: 'Ocean',
    swatch: ['#0a192f', '#3b82f6', '#22d3ee'],
    vars: {
      '--bg-primary': '#0a192f',
      '--bg-surface': '#112240',
      '--bg-card': '#1b2a4a',
      '--bg-elevated': '#233554',
      '--border': '#2e4a6b',
      '--border-sub': '#233554',
      '--text-primary': '#e6f1ff',
      '--text-secondary': '#9cc4ff',
      '--text-muted': '#5b7fb3',
      '--accent-primary': '#3b82f6',
      '--accent-glow': 'rgba(59,130,246,.2)',
      '--accent-secondary': '#22d3ee',
      '--accent-danger': '#f87171',
    },
  },
  lavender: {
    label: 'Lavender',
    swatch: ['#f5f3ff', '#8b5cf6', '#c084fc'],
    vars: {
      '--bg-primary': '#f5f3ff',
      '--bg-surface': '#ede9fe',
      '--bg-card': '#ddd6fe',
      '--bg-elevated': '#c4b5fd',
      '--border': '#a78bfa',
      '--border-sub': '#c4b5fd',
      '--text-primary': '#2e1065',
      '--text-secondary': '#6d28d9',
      '--text-muted': '#8b5cf6',
      '--accent-primary': '#8b5cf6',
      '--accent-glow': 'rgba(139,92,246,.15)',
      '--accent-secondary': '#c084fc',
      '--accent-danger': '#ef4444',
    },
  },
  rose: {
    label: 'Rose',
    swatch: ['#fff1f2', '#f43f5e', '#fb7185'],
    vars: {
      '--bg-primary': '#fff1f2',
      '--bg-surface': '#ffe4e6',
      '--bg-card': '#fecdd3',
      '--bg-elevated': '#fda4af',
      '--border': '#fb7185',
      '--border-sub': '#fda4af',
      '--text-primary': '#4c0519',
      '--text-secondary': '#9f1239',
      '--text-muted': '#be123c',
      '--accent-primary': '#f43f5e',
      '--accent-glow': 'rgba(244,63,94,.15)',
      '--accent-secondary': '#fb7185',
      '--accent-danger': '#dc2626',
    },
  },
  amber: {
    label: 'Amber',
    swatch: ['#1c1917', '#f59e0b', '#fbbf24'],
    vars: {
      '--bg-primary': '#1c1917',
      '--bg-surface': '#292524',
      '--bg-card': '#3f3f46',
      '--bg-elevated': '#52525b',
      '--border': '#a16207',
      '--border-sub': '#52525b',
      '--text-primary': '#fef3c7',
      '--text-secondary': '#fbbf24',
      '--text-muted': '#f59e0b',
      '--accent-primary': '#f59e0b',
      '--accent-glow': 'rgba(245,158,11,.2)',
      '--accent-secondary': '#fbbf24',
      '--accent-danger': '#ef4444',
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

  const accentPrimary = vars['--accent-primary'] || '#7c6af0'
  const border = vars['--border'] || '#2a2a5a'
  
  // Get the SVG favicon as text
  fetch("/images/favicon.svg")
    .then((response) => response.text())
    .then((svgText) => {
      // Parse the SVG text into DOM elements for easier manipulation
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, "image/svg+xml");

      // Find the elements by their data-fill attributes
      const background = svgDoc.querySelector('[data-fill="background"]');
      const foreground = svgDoc.querySelector('[data-fill="foreground"]');

      background.setAttribute("fill", border)
      foreground.setAttribute("fill", accentPrimary)

      // Create a Blob URL for the updated SVG content
      const blob = new Blob([svgDoc.documentElement.outerHTML], { type: "image/svg+xml" })
      const url = URL.createObjectURL(blob)

      // Update the favicon href to point to the new dynamic SVG
      const favicon = document.getElementById("favicon")
      favicon.href = url
    })
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
