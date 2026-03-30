/**
 * FSRS-5 (Free Spaced Repetition Scheduler) implementation
 * Based on the open FSRS algorithm by Jarrett Ye
 * Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
 */

const FSRS_PARAMS = {
  w: [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
    0.5316, 1.0651, 0.0589, 1.5330, 0.1544,
    1.0073, 1.9395, 0.1100, 0.2900, 2.2700,
    0.0000, 2.9898, 0.5100, 0.3400,
  ],
  requestRetention: 0.9,
  maximumInterval: 36500,
}

function forgettingCurve(elapsedDays, stability) {
  return Math.pow(1 + (elapsedDays / (9 * stability)), -1)
}

function initStability(rating) {
  const w = FSRS_PARAMS.w
  return Math.max(w[rating - 1], 0.1)
}

function initDifficulty(rating) {
  const w = FSRS_PARAMS.w
  return Math.min(Math.max(w[4] - Math.exp(w[5] * (rating - 1)) + 1, 1), 10)
}

function nextDifficulty(d, rating) {
  const w = FSRS_PARAMS.w
  const delta = w[6] * (rating - 3)
  const newD = d - delta
  return Math.min(Math.max(newD + w[7] * (10 - newD), 1), 10)
}

function shortTermStability(s, rating) {
  const w = FSRS_PARAMS.w
  return s * Math.exp(w[17] * (rating - 3 + w[18]))
}

function nextRecallStability(d, s, r, rating) {
  const w = FSRS_PARAMS.w
  return s * (
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    (rating === 2 ? w[15] : 1) *
    (rating === 4 ? w[16] : 1)
  )
}

function nextForgetStability(d, s, r) {
  const w = FSRS_PARAMS.w
  return w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r))
}

function nextInterval(stability) {
  const r = FSRS_PARAMS.requestRetention
  const interval = (stability / Math.log(r)) * (Math.pow(r, -1 / 0.9) - 1)
  return Math.min(Math.max(Math.round(interval), 1), FSRS_PARAMS.maximumInterval)
}

/**
 * Schedule a card based on current state and rating
 * @param {Object} card - current card SRS state
 * @param {number} rating - 1 (Again) | 2 (Hard) | 3 (Good) | 4 (Easy)
 * @returns {Object} updated SRS state
 */
export function scheduleCard(card, rating) {
  const now = new Date()

  if (!card.stability || card.repetitions === 0) {
    // First review
    const stability = initStability(rating)
    const difficulty = initDifficulty(rating)
    const interval = rating === 1 ? 0 : nextInterval(stability)

    return {
      stability,
      difficulty,
      repetitions: 1,
      interval,
      due: addDays(now, interval),
      lastReviewed: now.toISOString(),
      state: rating === 1 ? 'learning' : 'review',
    }
  }

  const elapsedDays = card.lastReviewed
    ? Math.max(0, (now - new Date(card.lastReviewed)) / 86400000)
    : card.interval || 1

  const retrievability = forgettingCurve(elapsedDays, card.stability)
  const difficulty = nextDifficulty(card.difficulty, rating)

  let stability
  if (rating === 1) {
    stability = nextForgetStability(difficulty, card.stability, retrievability)
  } else if (card.state === 'learning') {
    stability = shortTermStability(card.stability, rating)
  } else {
    stability = nextRecallStability(difficulty, card.stability, retrievability, rating)
  }

  stability = Math.max(stability, 0.1)
  const interval = rating === 1 ? 0 : nextInterval(stability)

  return {
    stability,
    difficulty,
    repetitions: card.repetitions + 1,
    interval,
    due: addDays(now, interval),
    lastReviewed: now.toISOString(),
    state: rating === 1 ? 'relearning' : 'review',
  }
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function isDue(card) {
  if (!card.due) return true
  return new Date(card.due) <= new Date()
}

export function getNextIntervalLabel(card, rating) {
  if (!card.stability || card.repetitions === 0) {
    const s = initStability(rating)
    const i = rating === 1 ? 0 : nextInterval(s)
    return formatInterval(i)
  }
  const elapsedDays = card.lastReviewed
    ? Math.max(0, (Date.now() - new Date(card.lastReviewed).getTime()) / 86400000)
    : card.interval || 1
  const r = forgettingCurve(elapsedDays, card.stability)
  const d = nextDifficulty(card.difficulty || 5, rating)

  let s
  if (rating === 1) s = nextForgetStability(d, card.stability, r)
  else if (card.state === 'learning') s = shortTermStability(card.stability, rating)
  else s = nextRecallStability(d, card.stability, r, rating)

  return formatInterval(rating === 1 ? 0 : nextInterval(Math.max(s, 0.1)))
}

function formatInterval(days) {
  if (days === 0) return '<10m'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}
