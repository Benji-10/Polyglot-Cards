import { query, requireUser, json, error, handleCors } from './_db.js'

export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    if (event.httpMethod !== 'POST') return error('Method not allowed', 405)
    const { deckId, keys } = JSON.parse(event.body)
    if (!deckId || !Array.isArray(keys) || !keys.length) return error('deckId and keys array required')
    const { rows: deckRows } = await query('SELECT id FROM decks WHERE id=$1 AND user_id=$2', [deckId, userId])
    if (!deckRows.length) return error('Deck not found', 404)
    let expr = 'fields'
    const args = [deckId, userId]
    for (const key of keys) { args.push(key); expr += ` - $${args.length}` }
    await query(`UPDATE cards SET fields = ${expr}, updated_at = NOW() WHERE deck_id=$1 AND user_id=$2`, args)
    return json({ ok: true, removed: keys })
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
