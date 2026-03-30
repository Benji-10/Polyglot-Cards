import { query, requireUser, json, error, handleCors } from './_db.js'

export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    if (event.httpMethod !== 'POST') return error('Method not allowed', 405)

    const { cards } = JSON.parse(event.body)
    if (!Array.isArray(cards) || !cards.length) return error('cards array required')

    const inserted = []
    for (const card of cards) {
      const { deck_id, word, fields } = card
      if (!deck_id || !word) continue
      const { rows } = await query(
        `INSERT INTO cards (deck_id, user_id, word, fields)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [deck_id, userId, word.trim(), JSON.stringify(fields || {})]
      )
      if (rows.length) inserted.push(rows[0])
    }

    return json({ inserted: inserted.length, cards: inserted }, 201)
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
