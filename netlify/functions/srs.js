import { query, requireUser, json, error } from './_db.js'

// FSRS schedule (mirrors client-side for server-side persistence)
function forgettingCurve(elapsed, stability) {
  return Math.pow(1 + elapsed / (9 * stability), -1)
}
const W = [0.4072,1.1829,3.1262,15.4722,7.2102,0.5316,1.0651,0.0589,1.5330,0.1544,1.0073,1.9395,0.1100,0.2900,2.2700,0.0000,2.9898,0.5100,0.3400]
function initS(r) { return Math.max(W[r-1], 0.1) }
function initD(r) { return Math.min(Math.max(W[4] - Math.exp(W[5]*(r-1)) + 1, 1), 10) }
function nextD(d, r) { return Math.min(Math.max(d - W[6]*(r-3) + W[7]*(10-d), 1), 10) }
function nextInterval(s) {
  const i = (s / Math.log(0.9)) * (Math.pow(0.9,-1/0.9)-1)
  return Math.min(Math.max(Math.round(i),1),36500)
}

function schedule(card, rating) {
  const now = new Date()
  if (!card.stability || card.repetitions === 0) {
    const s = initS(rating)
    const d = initD(rating)
    const interval = rating === 1 ? 0 : nextInterval(s)
    const due = new Date(now); due.setDate(due.getDate() + interval)
    return { stability: s, difficulty: d, repetitions: 1, interval, due: due.toISOString(), last_reviewed: now.toISOString(), srs_state: rating === 1 ? 'learning' : 'review' }
  }
  const elapsed = card.last_reviewed ? Math.max(0,(now - new Date(card.last_reviewed))/86400000) : card.interval||1
  const r = forgettingCurve(elapsed, card.stability)
  const d = nextD(card.difficulty||5, rating)
  let s
  if (rating === 1) s = W[11]*Math.pow(d,-W[12])*(Math.pow(card.stability+1,W[13])-1)*Math.exp(W[14]*(1-r))
  else if (card.srs_state === 'learning') s = card.stability * Math.exp(W[17]*(rating-3+W[18]))
  else s = card.stability*(Math.exp(W[8])*(11-d)*Math.pow(card.stability,-W[9])*(Math.exp(W[10]*(1-r))-1)*(rating===2?W[15]:1)*(rating===4?W[16]:1))
  s = Math.max(s||0.1, 0.1)
  const interval = rating === 1 ? 0 : nextInterval(s)
  const due = new Date(now); due.setDate(due.getDate() + interval)
  return { stability: s, difficulty: d, repetitions: card.repetitions+1, interval, due: due.toISOString(), last_reviewed: now.toISOString(), srs_state: rating===1?'relearning':'review' }
}

export const handler = async (event) => {
  try {
    const userId = requireUser(event)
    const method = event.httpMethod
    const params = event.queryStringParameters || {}

    if (method === 'GET') {
      // Get cards due for review
      const { deckId } = params
      if (!deckId) return error('deckId required')
      const { rows } = await query(
        `SELECT * FROM cards WHERE deck_id=$1 AND user_id=$2 AND due <= NOW() AND srs_state != 'new'
         ORDER BY due ASC`,
        [deckId, userId]
      )
      return json(rows)
    }

    if (method === 'POST') {
      const { cardId, rating } = JSON.parse(event.body)
      if (!cardId || !rating) return error('cardId and rating required')

      // Fetch card
      const { rows: cardRows } = await query('SELECT * FROM cards WHERE id=$1 AND user_id=$2', [cardId, userId])
      if (!cardRows.length) return error('Card not found', 404)
      const card = cardRows[0]

      const next = schedule(card, rating)

      // Update card
      const { rows } = await query(
        `UPDATE cards SET stability=$1, difficulty=$2, repetitions=$3, interval=$4, due=$5,
         last_reviewed=$6, srs_state=$7, seen=true, updated_at=NOW()
         WHERE id=$8 AND user_id=$9 RETURNING *`,
        [next.stability, next.difficulty, next.repetitions, next.interval, next.due,
         next.last_reviewed, next.srs_state, cardId, userId]
      )

      // Log review
      await query(
        `INSERT INTO review_log (card_id, user_id, rating, stability_before, stability_after, interval_after)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cardId, userId, rating, card.stability, next.stability, next.interval]
      )

      return json(rows[0])
    }

    return error('Method not allowed', 405)
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
