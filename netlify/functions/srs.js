import { query, requireUser, json, error, handleCors } from './_db.js'

/**
 * FSRS-5 schedule — mirrors src/lib/fsrs.js exactly.
 * Key corrections: exponent -0.5, correct interval inversion,
 * w[15]=0.28, learning steps, no relearning loop.
 */
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
  0.5316, 1.0651, 0.0589,  1.5330, 0.1544,
  1.0073, 1.9395, 0.1100,  0.2900, 2.2700,
  0.2800, 2.9898, 0.5100,  0.3400,
]
const REQUEST_RETENTION = 0.9
const MAX_INTERVAL = 36500
const LEARNING_STEPS_MINS = [1, 10]

// R(t) = (1 + t/(9S))^-0.5
function forgettingCurve(elapsed, stability) {
  return Math.pow(1 + elapsed / (9 * stability), -0.5)
}

// Invert: t = 9S(R^-2 - 1)
function nextInterval(s) {
  const days = 9 * s * (Math.pow(REQUEST_RETENTION, -2) - 1)
  return Math.min(Math.max(Math.round(days), 1), MAX_INTERVAL)
}

function initS(r)  { return Math.max(W[r - 1], 0.1) }
function initD(r)  { return Math.min(Math.max(W[4] - Math.exp(W[5] * (r - 1)) + 1, 1), 10) }
function nextD(d, r) {
  const raw = d - W[6] * (r - 3)
  return Math.min(Math.max(raw + W[7] * (10 - raw), 1), 10)
}
function shortTermS(s, r) { return s * Math.exp(W[17] * (r - 3 + W[18])) }
function recallS(d, s, r, rating) {
  return s * Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    (rating === 2 ? W[15] : 1) *
    (rating === 4 ? W[16] : 1)
}
function forgetS(d, s, r) {
  return W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r))
}

function addMinutes(ms, mins) { return new Date(ms + mins * 60000).toISOString() }
function addDays(ms, days)    { return new Date(ms + days * 86400000).toISOString() }

function schedule(card, rating) {
  const nowMs      = Date.now()
  const stability  = card.stability   || 0
  const difficulty = card.difficulty  || 5
  const reps       = card.repetitions || 0
  const srsState   = card.srs_state   || 'new'
  const step       = card.learning_step ?? 0
  const isLearning = srsState === 'new' || srsState === 'learning' || reps === 0

  if (isLearning) {
    const newD = reps === 0 ? initD(rating) : nextD(difficulty, rating)

    if (rating === 1 || rating === 2) {
      const newS = Math.max(reps === 0 ? initS(rating) : shortTermS(stability, rating), 0.1)
      return { stability: newS, difficulty: newD, repetitions: reps + 1, interval: 0,
        learning_step: 0, due: addMinutes(nowMs, LEARNING_STEPS_MINS[0]),
        last_reviewed: new Date(nowMs).toISOString(), srs_state: 'learning' }
    }

    if (rating === 4) {
      const newS = Math.max(reps === 0 ? initS(4) : shortTermS(stability, 4), 0.1)
      const interval = nextInterval(newS)
      return { stability: newS, difficulty: newD, repetitions: reps + 1, interval,
        learning_step: null, due: addDays(nowMs, interval),
        last_reviewed: new Date(nowMs).toISOString(), srs_state: 'review' }
    }

    // Good
    const nextStep = step + 1
    const newS = Math.max(reps === 0 ? initS(3) : shortTermS(stability, 3), 0.1)
    if (nextStep < LEARNING_STEPS_MINS.length) {
      return { stability: newS, difficulty: newD, repetitions: reps + 1, interval: 0,
        learning_step: nextStep, due: addMinutes(nowMs, LEARNING_STEPS_MINS[nextStep]),
        last_reviewed: new Date(nowMs).toISOString(), srs_state: 'learning' }
    }
    const interval = nextInterval(newS)
    return { stability: newS, difficulty: newD, repetitions: reps + 1, interval,
      learning_step: null, due: addDays(nowMs, interval),
      last_reviewed: new Date(nowMs).toISOString(), srs_state: 'review' }
  }

  // Review phase
  const elapsed = card.last_reviewed
    ? Math.max(0, (nowMs - new Date(card.last_reviewed).getTime()) / 86400000)
    : stability || 1
  const r   = forgettingCurve(elapsed, stability)
  const newD = nextD(difficulty, rating)

  if (rating === 1) {
    const newS = Math.max(forgetS(newD, stability, r), 0.1)
    return { stability: newS, difficulty: newD, repetitions: reps + 1, interval: 0,
      learning_step: 0, due: addMinutes(nowMs, LEARNING_STEPS_MINS[0]),
      last_reviewed: new Date(nowMs).toISOString(), srs_state: 'learning' }
  }

  const newS = Math.max(recallS(newD, stability, r, rating), 0.1)
  const interval = nextInterval(newS)
  return { stability: newS, difficulty: newD, repetitions: reps + 1, interval,
    learning_step: null, due: addDays(nowMs, interval),
    last_reviewed: new Date(nowMs).toISOString(), srs_state: 'review' }
}

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
      // Include learning cards due now (interval=0 with due timestamp in the past)
      const { rows } = await query(
        `SELECT * FROM cards WHERE deck_id=$1 AND user_id=$2 AND due <= NOW()
         AND srs_state IN ('learning','review')
         ORDER BY due ASC`,
        [deckId, userId]
      )
      return json(rows)
    }

    if (method === 'POST') {
      const { cardId, rating } = JSON.parse(event.body)
      if (!cardId || !rating) return error('cardId and rating required')

      const { rows: cardRows } = await query(
        'SELECT * FROM cards WHERE id=$1 AND user_id=$2', [cardId, userId]
      )
      if (!cardRows.length) return error('Card not found', 404)
      const card = cardRows[0]

      const next = schedule(card, rating)

      const { rows } = await query(
        `UPDATE cards
         SET stability=$1, difficulty=$2, repetitions=$3, interval=$4, due=$5,
             last_reviewed=$6, srs_state=$7, learning_step=$8, seen=true, updated_at=NOW()
         WHERE id=$9 AND user_id=$10 RETURNING *`,
        [next.stability, next.difficulty, next.repetitions, next.interval, next.due,
         next.last_reviewed, next.srs_state, next.learning_step ?? null, cardId, userId]
      )

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

