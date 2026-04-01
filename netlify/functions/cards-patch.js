import { query, requireUser, json, error, handleCors } from './_db.js'

/**
 * PATCH /cards-patch
 * Body: { deckId, patches: [{ word, fields: { key: value, ... } }] }
 *
 * Merges partial field data into existing cards matched by word.
 * Only the provided field keys are updated — other fields are preserved.
 * Uses a single UPDATE per card with jsonb_build_object to merge.
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
    for (const { word, fields } of patches) {
      if (!word || !fields || !Object.keys(fields).length) continue

      // Build a jsonb merge expression: existing fields || new partial fields
      // This preserves all existing keys and only overwrites the provided ones
      await query(
        `UPDATE cards
         SET fields = fields || $1::jsonb, updated_at = NOW()
         WHERE deck_id = $2 AND user_id = $3 AND word = $4`,
        [JSON.stringify(fields), deckId, userId, word]
      )
      updated++
    }

    return json({ updated })
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
