let getTokenFn = null

export function setTokenProvider(fn) { getTokenFn = fn }

async function fetchWithAuth(path, options = {}) {
  const token = getTokenFn ? await getTokenFn() : null
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  const res = await fetch(`/.netlify/functions${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  getDecks: () => fetchWithAuth('/decks'),
  createDeck: (data) => fetchWithAuth('/decks', { method: 'POST', body: JSON.stringify(data) }),
  updateDeck: (id, data) => fetchWithAuth(`/decks?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDeck: (id) => fetchWithAuth(`/decks?id=${id}`, { method: 'DELETE' }),

  getBlueprintFields: (deckId) => fetchWithAuth(`/blueprint?deckId=${deckId}`),
  saveBlueprintFields: (deckId, fields) => fetchWithAuth('/blueprint', { method: 'POST', body: JSON.stringify({ deckId, fields }) }),

  getCards: (deckId, params = {}) => {
    const q = new URLSearchParams({ deckId, ...params }).toString()
    return fetchWithAuth(`/cards?${q}`)
  },
  createCard: (data) => fetchWithAuth('/cards', { method: 'POST', body: JSON.stringify(data) }),
  updateCard: (id, data) => fetchWithAuth(`/cards?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCard: (id) => fetchWithAuth(`/cards?id=${id}`, { method: 'DELETE' }),
  batchCreateCards: (cards) => fetchWithAuth('/cards-batch', { method: 'POST', body: JSON.stringify({ cards }) }),
  patchCards: (deckId, patches) => fetchWithAuth('/cards-patch', { method: 'POST', body: JSON.stringify({ deckId, patches }) }),
  deleteCardFields: (deckId, keys) => fetchWithAuth('/cards-field-delete', { method: 'POST', body: JSON.stringify({ deckId, keys }) }),

  getSRSCards: (deckId) => fetchWithAuth(`/srs?deckId=${deckId}`),
  recordReview: (cardId, rating) => fetchWithAuth('/srs', { method: 'POST', body: JSON.stringify({ cardId, rating }) }),

  getCloudSettings: () => fetchWithAuth('/settings'),
  saveCloudSettings: (patch) => fetchWithAuth('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  generateCards: (deckId, vocab, blueprint) => fetchWithAuth('/generate', { method: 'POST', body: JSON.stringify({ deckId, vocab, blueprint }) }),
}
