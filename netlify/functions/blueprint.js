import { query, requireUser, json, error, handleCors } from './_db.js'

export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    const method = event.httpMethod
    const params = event.queryStringParameters || {}

    if (method === 'GET') {
      const { deckId } = params
      if (!deckId) return error('deckId required')
      const { rows: deck } = await query('SELECT id FROM decks WHERE id=$1 AND user_id=$2', [deckId, userId])
      if (!deck.length) return error('Deck not found', 404)

      const { rows } = await query(
        'SELECT * FROM blueprint_fields WHERE deck_id=$1 ORDER BY position ASC',
        [deckId]
      )
      // Ensure phonetics is always a parsed array regardless of Postgres driver behaviour
      const parsed = rows.map(r => ({
        ...r,
        phonetics: Array.isArray(r.phonetics)
          ? r.phonetics
          : typeof r.phonetics === 'string'
            ? JSON.parse(r.phonetics)
            : [],
      }))
      return json(parsed)
    }

    if (method === 'POST') {
      const { deckId, fields } = JSON.parse(event.body)
      if (!deckId || !fields) return error('deckId and fields required')

      const { rows: deck } = await query('SELECT id FROM decks WHERE id=$1 AND user_id=$2', [deckId, userId])
      if (!deck.length) return error('Deck not found', 404)

      // Replace all fields for this deck
      await query('DELETE FROM blueprint_fields WHERE deck_id=$1', [deckId])

      for (let i = 0; i < fields.length; i++) {
        const f = fields[i]
        await query(
          `INSERT INTO blueprint_fields (deck_id, key, label, description, field_type, position, show_on_front, phonetics)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [deckId, f.key, f.label, f.description || '', f.field_type || 'text', i, f.show_on_front || false, f.phonetics || []]
        )
      }

      const { rows } = await query(
        'SELECT * FROM blueprint_fields WHERE deck_id=$1 ORDER BY position ASC',
        [deckId]
      )
      return json(rows)
    }

    return error('Method not allowed', 405)
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
