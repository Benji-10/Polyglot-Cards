import { query, requireUser, json, error, handleCors } from './_db.js'

/**
 * PATCH /cards-patch
 * Body: { deckId, patches: [{ id?, word?, fields: { key: string|object, ... } }] }
 *
 * Fields may be plain strings (source_translation, context) or objects
 * ({ text, annotationType, ... }) for annotated/example fields.
 *
 * For object-valued fields, we deep-merge the incoming object into the existing
 * stored object so that existing annotation keys are preserved and only the
 * incoming keys are updated.
 *
 * If `id` is provided: patches exactly that card (safe for homographs).
 * If only `word` is provided: patches ALL cards with that word (legacy fallback).
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

      // Build a per-field merge expression.
      // - Plain string values: use top-level || merge (simple replacement)
      // - Object values: deep-merge using jsonb_set so existing annotation keys survive
      //
      // We do this in a single UPDATE per card using a chain of jsonb_set calls.
      // For simplicity we build one statement that does:
      //   fields = (fields || topLevelMerge) deep-merged with objectFields
      //
      // Strategy: separate fields into plain strings vs objects, then:
      // 1. Apply all string fields with ||
      // 2. For each object field, jsonb_set(result, '{fieldKey}', existing || incoming)

      const stringFields = {}
      const objectFields = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          objectFields[k] = v
        } else {
          stringFields[k] = v
        }
      }

      if (id) {
        await deepMergeById(id, userId, stringFields, objectFields)
      } else if (word) {
        // Get all matching card ids then patch each by id
        const { rows: matching } = await query(
          'SELECT id FROM cards WHERE deck_id=$1 AND user_id=$2 AND word=$3',
          [deckId, userId, word]
        )
        for (const { id: cardId } of matching) {
          await deepMergeById(cardId, userId, stringFields, objectFields)
        }
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

async function deepMergeById(id, userId, stringFields, objectFields) {
  // Step 1: merge all plain-string fields at the top level
  let sql = `UPDATE cards SET fields = fields || $1::jsonb, updated_at = NOW() WHERE id = $2 AND user_id = $3`
  const args = [JSON.stringify(stringFields), id, userId]
  await query(sql, args)

  // Step 2: for each object field, deep-merge the incoming object into the stored one
  // jsonb_set(fields, '{key}', COALESCE(fields->'{key}', '{}') || incomingObj)
  for (const [k, v] of Object.entries(objectFields)) {
    await query(
      `UPDATE cards
       SET fields = jsonb_set(fields, $1::text[], COALESCE(fields->$2, '{}'::jsonb) || $3::jsonb),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5`,
      [JSON.stringify([k]), k, JSON.stringify(v), id, userId]
    )
  }
}
