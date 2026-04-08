// Centralized API client — all calls go through Netlify Functions
// The token is passed via Authorization header

let getTokenFn = null

export function setTokenProvider(fn) {
  getTokenFn = fn
}

async function fetchWithAuth(path, options = {}) {
  const token = getTokenFn ? await getTokenFn() : null
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(`/.netlify/functions${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// ── Decks ──────────────────────────────────────────────
export const api = {
  // Decks
  getDecks: () => fetchWithAuth('/decks'),
  createDeck: (data) => fetchWithAuth('/decks', { method: 'POST', body: JSON.stringify(data) }),
  updateDeck: (id, data) => fetchWithAuth(`/decks?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDeck: (id) => fetchWithAuth(`/decks?id=${id}`, { method: 'DELETE' }),

  // Blueprint fields for a deck
  getBlueprintFields: (deckId) => fetchWithAuth(`/blueprint?deckId=${deckId}`),
  saveBlueprintFields: (deckId, fields) => fetchWithAuth('/blueprint', { method: 'POST', body: JSON.stringify({ deckId, fields }) }),

  // Cards
  getCards: (deckId, params = {}) => {
    const q = new URLSearchParams({ deckId, ...params }).toString()
    return fetchWithAuth(`/cards?${q}`)
  },
  createCard: (data) => fetchWithAuth('/cards', { method: 'POST', body: JSON.stringify(data) }),
  updateCard: (id, data) => fetchWithAuth(`/cards?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCard: (id) => fetchWithAuth(`/cards?id=${id}`, { method: 'DELETE' }),
  batchCreateCards: (cards) => fetchWithAuth('/cards-batch', { method: 'POST', body: JSON.stringify({ cards }) }),
  // Merge partial field data into existing cards by word match
  patchCards: (deckId, patches) => fetchWithAuth('/cards-patch', { method: 'POST', body: JSON.stringify({ deckId, patches }) }),

  // SRS / review
  getSRSCards: (deckId) => fetchWithAuth(`/srs?deckId=${deckId}`),
  recordReview: (cardId, rating) => fetchWithAuth('/srs', { method: 'POST', body: JSON.stringify({ cardId, rating }) }),

  // User settings (cloud sync for theme etc.)
  getCloudSettings: () => fetchWithAuth('/settings'),
  saveCloudSettings: (patch) => fetchWithAuth('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  // Gemini generation
  generateCards: (deckId, vocab, blueprint) => fetchWithAuth('/generate', { method: 'POST', body: JSON.stringify({ deckId, vocab, blueprint }) }),
}
