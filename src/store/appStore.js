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
  // ── New themes ─────────────────────────────────────────────
  ocean: {
    label: 'Ocean',
    swatch: ['#04111f', '#38bdf8', '#22d3ee'],
    vars: {
      '--bg-primary':      '#04111f',
      '--bg-surface':      '#071a2e',
      '--bg-card':         '#0c2340',
      '--bg-elevated':     '#102d52',
      '--border':          '#163c6b',
      '--border-sub':      '#102d52',
      '--text-primary':    '#e0f2fe',
      '--text-secondary':  '#7dd3fc',
      '--text-muted':      '#38bdf8',
      '--accent-primary':  '#0ea5e9',
      '--accent-glow':     'rgba(14,165,233,.15)',
      '--accent-secondary':'#22d3ee',
      '--accent-danger':   '#fb7185',
    },
  },
  rose: {
    label: 'Rose',
    swatch: ['#150008', '#f43f5e', '#fb923c'],
    vars: {
      '--bg-primary':      '#150008',
      '--bg-surface':      '#1f000e',
      '--bg-card':         '#2a0015',
      '--bg-elevated':     '#38001d',
      '--border':          '#52002b',
      '--border-sub':      '#38001d',
      '--text-primary':    '#ffe4e6',
      '--text-secondary':  '#fda4af',
      '--text-muted':      '#fb7185',
      '--accent-primary':  '#f43f5e',
      '--accent-glow':     'rgba(244,63,94,.15)',
      '--accent-secondary':'#fb923c',
      '--accent-danger':   '#ef4444',
    },
  },
  cyber: {
    label: 'Cyber',
    swatch: ['#000a12', '#00e5ff', '#ff2d78'],
    vars: {
      '--bg-primary':      '#000a12',
      '--bg-surface':      '#001220',
      '--bg-card':         '#001a2e',
      '--bg-elevated':     '#00243d',
      '--border':          '#003655',
      '--border-sub':      '#00243d',
      '--text-primary':    '#e0f8ff',
      '--text-secondary':  '#67e8f9',
      '--text-muted':      '#22d3ee',
      '--accent-primary':  '#00e5ff',
      '--accent-glow':     'rgba(0,229,255,.15)',
      '--accent-secondary':'#ff2d78',
      '--accent-danger':   '#ff2d78',
    },
  },
  neon: {
    label: 'Neon',
    swatch: ['#050505', '#a855f7', '#22d3ee'],
    vars: {
      '--bg-primary':      '#050505',
      '--bg-surface':      '#0a0a0a',
      '--bg-card':         '#111111',
      '--bg-elevated':     '#1a1a1a',
      '--border':          '#2a2a2a',
      '--border-sub':      '#1a1a1a',
      '--text-primary':    '#f0e6ff',
      '--text-secondary':  '#c084fc',
      '--text-muted':      '#7c3aed',
      '--accent-primary':  '#a855f7',
      '--accent-glow':     'rgba(168,85,247,.2)',
      '--accent-secondary':'#22d3ee',
      '--accent-danger':   '#f43f5e',
    },
  },
  sunset: {
    label: 'Sunset',
    swatch: ['#0e0608', '#e879f9', '#f97316'],
    vars: {
      '--bg-primary':      '#0e0608',
      '--bg-surface':      '#18080f',
      '--bg-card':         '#220b17',
      '--bg-elevated':     '#2e0e20',
      '--border':          '#45152f',
      '--border-sub':      '#2e0e20',
      '--text-primary':    '#fce7f3',
      '--text-secondary':  '#f0abfc',
      '--text-muted':      '#c026d3',
      '--accent-primary':  '#e879f9',
      '--accent-glow':     'rgba(232,121,249,.15)',
      '--accent-secondary':'#f97316',
      '--accent-danger':   '#ef4444',
    },
  },
  amber: {
    label: 'Amber',
    swatch: ['#0f0900', '#f59e0b', '#84cc16'],
    vars: {
      '--bg-primary':      '#0f0900',
      '--bg-surface':      '#1a1000',
      '--bg-card':         '#251700',
      '--bg-elevated':     '#312000',
      '--border':          '#452e00',
      '--border-sub':      '#312000',
      '--text-primary':    '#fefce8',
      '--text-secondary':  '#fde68a',
      '--text-muted':      '#d97706',
      '--accent-primary':  '#f59e0b',
      '--accent-glow':     'rgba(245,158,11,.15)',
      '--accent-secondary':'#84cc16',
      '--accent-danger':   '#ef4444',
    },
  },
  // ── Light themes ────────────────────────────────────────────
  light: {
    label: 'Light',
    swatch: ['#f8fafc', '#4f46e5', '#10b981'],
    vars: {
      '--bg-primary':      '#f8fafc',
      '--bg-surface':      '#f1f5f9',
      '--bg-card':         '#e8eef5',
      '--bg-elevated':     '#dde6f0',
      '--border':          '#c8d6e8',
      '--border-sub':      '#dde6f0',
      '--text-primary':    '#0f172a',
      '--text-secondary':  '#334155',
      '--text-muted':      '#64748b',
      '--accent-primary':  '#4f46e5',
      '--accent-glow':     'rgba(79,70,229,.12)',
      '--accent-secondary':'#10b981',
      '--accent-danger':   '#ef4444',
    },
  },
  parchment: {
    label: 'Parchment',
    swatch: ['#faf6f0', '#b45309', '#059669'],
    vars: {
      '--bg-primary':      '#faf6f0',
      '--bg-surface':      '#f5efe4',
      '--bg-card':         '#ede5d6',
      '--bg-elevated':     '#e5d8c4',
      '--border':          '#c8b89a',
      '--border-sub':      '#e5d8c4',
      '--text-primary':    '#1c1008',
      '--text-secondary':  '#44321c',
      '--text-muted':      '#78604a',
      '--accent-primary':  '#b45309',
      '--accent-glow':     'rgba(180,83,9,.12)',
      '--accent-secondary':'#059669',
      '--accent-danger':   '#dc2626',
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

// Update the SVG favicon dynamically to match the current theme colours
function updateFavicon(accent, bgSurface) {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="20" fill="${bgSurface}"/>
  <text x="50" y="50" font-family="Arial, sans-serif" font-size="52" font-weight="bold"
        text-anchor="middle" dominant-baseline="central" fill="${accent}">多</text>
</svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    let link = document.getElementById('favicon-dynamic')
    if (!link) {
      link = document.createElement('link')
      link.id = 'favicon-dynamic'
      link.rel = 'icon'
      link.type = 'image/svg+xml'
      document.head.appendChild(link)
    }
    const old = link.href
    link.href = url
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
  } catch (e) { /* non-fatal */ }
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
  // Update favicon to match new theme
  updateFavicon(vars['--accent-primary'] || '#7c6af0', vars['--bg-surface'] || '#12122a')
}

// Default quick-add field suggestions shown in Blueprint page.
// These are language-neutral — suitable for any target language.
export const DEFAULT_QUICK_ADD = [
  { key: 'reading',     label: 'Reading / Phonetic', description: 'Pronunciation guide or romanisation for the word',                                     field_type: 'text',    show_on_front: true,  phonetics: { ruby: 'none', extras: [] } },
  { key: 'example',    label: 'Example Sentence',    description: 'A natural example sentence using the word. Wrap ONLY the target word with {{word}}.', field_type: 'example', show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'definition', label: 'Definition',          description: 'A brief definition in the source language',                                            field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'notes',      label: 'Notes',               description: 'Grammar notes, register, usage tips, or mnemonics',                                    field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
  { key: 'etymology',  label: 'Etymology',           description: 'Word origin or root breakdown',                                                        field_type: 'text',    show_on_front: false, phonetics: { ruby: 'none', extras: [] } },
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
        strictAccents: true,
        strictMode: false,
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
