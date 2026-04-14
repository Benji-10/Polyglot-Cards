export const LANGUAGE_FLAGS = {
  'English':'🇬🇧','Korean':'🇰🇷','Japanese':'🇯🇵','Chinese (Mandarin)':'🇨🇳','Chinese (Cantonese)':'🇭🇰',
  'Arabic':'🇸🇦','Russian':'🇷🇺','Thai':'🇹🇭','Vietnamese':'🇻🇳','Hindi':'🇮🇳','Greek':'🇬🇷',
  'Turkish':'🇹🇷','Polish':'🇵🇱','Dutch':'🇳🇱','Swedish':'🇸🇪','Hebrew':'🇮🇱','Portuguese':'🇵🇹',
  'Italian':'🇮🇹','Spanish':'🇪🇸','French':'🇫🇷','German':'🇩🇪',
}

export function getLanguageFlag(lang) {
  if (!lang) return '📚'
  for (const [key, flag] of Object.entries(LANGUAGE_FLAGS)) {
    if (lang.toLowerCase().includes(key.toLowerCase())) return flag
  }
  return '📚'
}

export const LANGUAGES = Object.keys(LANGUAGE_FLAGS).concat(['Other'])

export function formatDueDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const diffDays = Math.round((date - new Date()) / 86400000)
  if (diffDays < 0) return 'Overdue'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return `${diffDays}d`
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w`
  if (diffDays < 365) return `${Math.round(diffDays / 30)}mo`
  return `${(diffDays / 365).toFixed(1)}y`
}

export function formatRelativeDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const diffDays = Math.round((new Date() - date) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export const SRS_STATE_LABELS = { new:'New', learning:'Learning', review:'Review', relearning:'Relearning' }
export const SRS_STATE_COLORS = { new:'var(--text-muted)', learning:'#fdcb6e', review:'var(--accent-secondary)', relearning:'var(--accent-danger)' }

export function containsCJK(str) { return /[\u3000-\u9fff\uac00-\ud7ff\u4e00-\u9fff\u3040-\u30ff]/.test(str) }
export function fontForText(text) {
  if (!text) return '"DM Sans", sans-serif'
  if (containsCJK(String(text))) return '"Noto Sans SC", "Noto Sans CJK SC", sans-serif'
  return '"DM Sans", sans-serif'
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function cn(...classes) { return classes.filter(Boolean).join(' ') }
