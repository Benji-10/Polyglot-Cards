import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// CSS variable sets for each theme
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

export const useAppStore = create(
  persist(
    (set) => ({
      activeDeckId: null,
      setActiveDeckId: (id) => set({ activeDeckId: id }),

      settings: {
        theme: 'dark',
        defaultBatchSize: 20,
        animationsEnabled: true,
      },
      updateSettings: (patch) => set((s) => {
        const next = { ...s.settings, ...patch }
        // Apply theme immediately when it changes
        if (patch.theme) applyTheme(patch.theme)
        return { settings: next }
      }),
    }),
    {
      name: 'polyglot-store',
      partialize: (s) => ({
        activeDeckId: s.activeDeckId,
        settings: s.settings,
      }),
      // Re-apply theme on hydration from localStorage
      onRehydrateStorage: () => (state) => {
        if (state?.settings?.theme) applyTheme(state.settings.theme)
      },
    }
  )
)
