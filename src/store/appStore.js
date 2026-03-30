import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set, get) => ({
      // Active deck
      activeDeckId: null,
      setActiveDeckId: (id) => set({ activeDeckId: id }),

      // Settings
      settings: {
        theme: 'dark',
        cardFrontField: 'auto', // 'auto' | field key
        fsrsEnabled: true,
        defaultBatchSize: 20,
        showRomajiHints: false,
        animationsEnabled: true,
      },
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      // Study session state (ephemeral, not persisted)
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    {
      name: 'polyglot-store',
      partialize: (s) => ({
        activeDeckId: s.activeDeckId,
        settings: s.settings,
      }),
    }
  )
)
