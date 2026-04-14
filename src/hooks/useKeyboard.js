import { useEffect } from 'react'

export function useStudyKeyboard({ phase, isPassive, onReveal, onAdvance, onRate, onExit, onDigit, enabled = true }) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (phase === 'prompt' && isPassive) onReveal?.()
        else if (phase === 'revealed' && !isPassive) onAdvance?.()
      }
      if (phase === 'revealed' && isPassive) {
        if (e.key === '1') onRate?.(1)
        if (e.key === '2') onRate?.(2)
        if (e.key === '3') onRate?.(3)
        if (e.key === '4') onRate?.(4)
      }
      if (phase === 'prompt' && !isPassive && ['1','2','3','4'].includes(e.key)) onDigit?.(Number(e.key))
      if (e.code === 'Escape') onExit?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, isPassive, onReveal, onAdvance, onRate, onExit, onDigit, enabled])
}

export function useKey(key, callback, deps = []) {
  useEffect(() => {
    const handler = (e) => { if (e.key === key || e.code === key) callback(e) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, deps) // eslint-disable-line
}
