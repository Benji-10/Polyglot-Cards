import { query, requireUser, json, error } from './_db.js'

export const handler = async (event) => {
  try {
    const userId = requireUser(event)
    const method = event.httpMethod
    const params = event.queryStringParameters || {}

    if (method === 'GET') {
      const { deckId, seen, limit, offset } = params
      if (!deckId) return error('deckId required')

      let sql = 'SELECT * FROM cards WHERE deck_id=$1 AND user_id=$2'
      const args = [deckId, userId]

      if (seen === 'true') { sql += ` AND seen=true`; }
      else if (seen === 'false') { sql += ` AND seen=false`; }

      sql += ' ORDER BY created_at ASC'
      if (limit) { sql += ` LIMIT $${args.length + 1}`; args.push(Number(limit)) }
      if (offset) { sql += ` OFFSET $${args.length + 1}`; args.push(Number(offset)) }

      const { rows } = await query(sql, args)
      return json(rows)
    }

    if (method === 'POST') {
      const { deck_id, word, fields } = JSON.parse(event.body)
      if (!deck_id || !word) return error('deck_id and word required')

      const { rows } = await query(
        `INSERT INTO cards (deck_id, user_id, word, fields)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [deck_id, userId, word, JSON.stringify(fields || {})]
      )
      return json(rows[0], 201)
    }

    if (method === 'PUT') {
      const { id } = params
      if (!id) return error('id required')
      const body = JSON.parse(event.body)

      const allowed = ['word','fields','stability','difficulty','repetitions','interval','due','last_reviewed','srs_state','seen']
      const sets = []
      const args = []
      for (const key of allowed) {
        if (key in body) {
          args.push(key === 'fields' ? JSON.stringify(body[key]) : body[key])
          sets.push(`${key}=$${args.length}`)
        }
      }
      if (!sets.length) return error('Nothing to update')

      args.push(id, userId)
      const { rows } = await query(
        `UPDATE cards SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${args.length-1} AND user_id=$${args.length} RETURNING *`,
        args
      )
      if (!rows.length) return error('Card not found', 404)
      return json(rows[0])
    }

    if (method === 'DELETE') {
      const { id } = params
      if (!id) return error('id required')
      await query('DELETE FROM cards WHERE id=$1 AND user_id=$2', [id, userId])
      return json({ ok: true })
    }

    return error('Method not allowed', 405)
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
