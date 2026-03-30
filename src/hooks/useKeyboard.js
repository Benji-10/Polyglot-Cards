import { useEffect } from 'react'

/**
 * useKeyboard — bind keyboard shortcuts for study sessions
 *
 * Space / Enter  → flip card
 * 1              → Again
 * 2              → Hard
 * 3              → Good
 * 4              → Easy
 * Escape         → exit session
 */
export function useStudyKeyboard({ flipped, onFlip, onRate, onExit, enabled = true }) {
  useEffect(() => {
    if (!enabled) return

    const handler = (e) => {
      // Don't fire when typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (!flipped) onFlip?.()
      }

      if (flipped) {
        if (e.key === '1') onRate?.(1)
        if (e.key === '2') onRate?.(2)
        if (e.key === '3') onRate?.(3)
        if (e.key === '4') onRate?.(4)
      }

      if (e.code === 'Escape') onExit?.()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flipped, onFlip, onRate, onExit, enabled])
}

/**
 * Generic key binding hook
 */
export function useKey(key, callback, deps = []) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === key || e.code === key) callback(e)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
