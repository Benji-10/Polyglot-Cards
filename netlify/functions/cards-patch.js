import { query, requireUser, json, error, handleCors } from './_db.js'

/**
 * PATCH /cards-patch
 * Body: { deckId, patches: [{ id?, word?, sense?, fields: { key: value, ... } }] }
 *
 * If `id` is provided: patches exactly that card (preferred — safe for homographs).
 * If only `word` is provided: patches ALL cards with that word (legacy, use for non-homograph decks only).
 * `sense` is informational only (used for logging/debugging).
 */
export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    if (event.httpMethod !== 'POST') return error('Method not allowed', 405)

    const { deckId, patches } = JSON.parse(event.body)
    if (!deckId || !Array.isArray(patches) || !patches.length) {
      return error('deckId and patches array required')
    }

    let updated = 0
    for (const { id, word, fields } of patches) {
      if (!fields || !Object.keys(fields).length) continue

      if (id) {
        // Patch by card id — precise, safe for homographs
        await query(
          `UPDATE cards
           SET fields = fields || $1::jsonb, updated_at = NOW()
           WHERE id = $2 AND user_id = $3`,
          [JSON.stringify(fields), id, userId]
        )
      } else if (word) {
        // Patch by word — legacy fallback, updates all cards with that word
        await query(
          `UPDATE cards
           SET fields = fields || $1::jsonb, updated_at = NOW()
           WHERE deck_id = $2 AND user_id = $3 AND word = $4`,
          [JSON.stringify(fields), deckId, userId, word]
        )
      } else {
        continue
      }
      updated++
    }

    return json({ updated })
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
