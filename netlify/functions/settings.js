import { query, requireUser, json, error, handleCors } from './_db.js'

// Thin key-value store for per-user app settings (theme, etc.)
// Stored as a single JSONB column so no schema migrations needed for new settings.

export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    const method = event.httpMethod

    if (method === 'GET') {
      const { rows } = await query(
        `SELECT settings FROM user_settings WHERE user_id = $1`,
        [userId]
      )
      return json(rows[0]?.settings || {})
    }

    if (method === 'PUT') {
      const patch = JSON.parse(event.body)
      if (typeof patch !== 'object' || Array.isArray(patch)) return error('Body must be a JSON object')

      // Upsert: merge the patch into existing settings
      const { rows } = await query(
        `INSERT INTO user_settings (user_id, settings)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id)
         DO UPDATE SET settings = user_settings.settings || $2::jsonb, updated_at = NOW()
         RETURNING settings`,
        [userId, JSON.stringify(patch)]
      )
      return json(rows[0]?.settings || {})
    }

    return error('Method not allowed', 405)
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
