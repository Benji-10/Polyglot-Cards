import { query, requireUser, json, error } from './_db.js'

export const handler = async (event) => {
  try {
    const userId = requireUser(event)
    const method = event.httpMethod
    const params = event.queryStringParameters || {}

    if (method === 'GET') {
      const { rows } = await query(
        'SELECT * FROM decks WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      )
      return json(rows)
    }

    if (method === 'POST') {
      const { name, target_language, description, card_front_field } = JSON.parse(event.body)
      if (!name || !target_language) return error('name and target_language required')

      const { rows } = await query(
        `INSERT INTO decks (user_id, name, target_language, description, card_front_field)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [userId, name, target_language, description || '', card_front_field || 'auto']
      )
      return json(rows[0], 201)
    }

    if (method === 'PUT') {
      const id = params.id
      if (!id) return error('id required')
      const { name, target_language, description, card_front_field } = JSON.parse(event.body)

      const { rows } = await query(
        `UPDATE decks SET name=COALESCE($1,name), target_language=COALESCE($2,target_language),
         description=COALESCE($3,description), card_front_field=COALESCE($4,card_front_field),
         updated_at=NOW()
         WHERE id=$5 AND user_id=$6 RETURNING *`,
        [name, target_language, description, card_front_field, id, userId]
      )
      if (!rows.length) return error('Deck not found', 404)
      return json(rows[0])
    }

    if (method === 'DELETE') {
      const id = params.id
      if (!id) return error('id required')
      await query('DELETE FROM decks WHERE id=$1 AND user_id=$2', [id, userId])
      return json({ ok: true })
    }

    return error('Method not allowed', 405)
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
