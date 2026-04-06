/**
 * FSRS-5 (Free Spaced Repetition Scheduler) implementation
 * Based on the open FSRS algorithm by Jarrett Ye
 * Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
 *
 * Key corrections vs prior version:
 *  - Forgetting curve exponent is -0.5, not -1
 *  - Interval derived by inverting the corrected curve: t = 9S*(R^-2 - 1)
 *  - w[15] (Hard multiplier) is 0.28, not 0.0 — prevents stability collapse
 *  - Learning steps: 1 min → 10 min → graduate to review
 *  - Again always returns to learning step 1 (no broken relearning loop)
 *  - All timestamps use Date.now() / .getTime()
 */

const FSRS_PARAMS = {
  // Official FSRS-5 default weights
  w: [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
    0.5316, 1.0651, 0.0589, 1.5330,  0.1544,
    1.0073, 1.9395, 0.1100, 0.2900,  2.2700,
    0.2800, 2.9898, 0.5100, 0.3400,   // w[15]=0.28 (Hard multiplier, NOT 0)
  ],
  requestRetention: 0.9,
  maximumInterval: 36500,
}

// Learning steps in minutes. New cards and Again-rated cards cycle through these.
const LEARNING_STEPS_MINS = [1, 10]

// R(t) = (1 + t / (9·S))^-0.5   [corrected FSRS-5 forgetting curve]
function forgettingCurve(elapsedDays, stability) {
  return Math.pow(1 + elapsedDays / (9 * stability), -0.5)
}

// Invert forgetting curve: t = 9·S·(R^-2 − 1)
function nextInterval(stability) {
  const r = FSRS_PARAMS.requestRetention
  const days = 9 * stability * (Math.pow(r, -2) - 1)
  return Math.min(Math.max(Math.round(days), 1), FSRS_PARAMS.maximumInterval)
}

function initStability(rating) {
  return Math.max(FSRS_PARAMS.w[rating - 1], 0.1)
}

function initDifficulty(rating) {
  const w = FSRS_PARAMS.w
  return Math.min(Math.max(w[4] - Math.exp(w[5] * (rating - 1)) + 1, 1), 10)
}

// Mean-reversion difficulty update
function nextDifficulty(d, rating) {
  const w = FSRS_PARAMS.w
  const raw = d - w[6] * (rating - 3)
  return Math.min(Math.max(raw + w[7] * (10 - raw), 1), 10)
}

// Short-term stability (used while still in learning steps)
function shortTermStability(s, rating) {
  const w = FSRS_PARAMS.w
  return s * Math.exp(w[17] * (rating - 3 + w[18]))
}

// Long-term recall stability (post-graduation)
function nextRecallStability(d, s, r, rating) {
  const w = FSRS_PARAMS.w
  return s * (
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    (rating === 2 ? w[15] : 1) *   // Hard multiplier (0.28 — meaningful reduction, not collapse)
    (rating === 4 ? w[16] : 1)    // Easy bonus
  )
}

// Post-lapse stability
function nextForgetStability(d, s, r) {
  const w = FSRS_PARAMS.w
  return w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r))
}

function addMinutes(ms, minutes) {
  return new Date(ms + minutes * 60000).toISOString()
}

function addDays(ms, days) {
  return new Date(ms + days * 86400000).toISOString()
}

/**
 * Schedule a card based on current state and rating.
 *
 * State machine:
 *   new / learning  + Again  → learning step 0  (due in 1 min)
 *   new / learning  + Hard   → learning step 0  (due in 1 min, short-term stability)
 *   new / learning  + Good   → advance step; if last step → review
 *   new / learning  + Easy   → graduate immediately → review
 *   review          + Again  → back to learning step 0
 *   review          + *      → long-term recall stability, stay in review
 *
 * @param {Object} card  – current card SRS fields (snake_case from DB or camelCase)
 * @param {number} rating – 1=Again 2=Hard 3=Good 4=Easy
 */
export function scheduleCard(card, rating) {
  const nowMs = Date.now()

  // Normalise field names (DB uses snake_case, client may use camelCase)
  const stability    = card.stability   ?? 0
  const difficulty   = card.difficulty  ?? 5
  const repetitions  = card.repetitions ?? 0
  const srsState     = card.srs_state   ?? card.state ?? 'new'
  const lastReviewed = card.last_reviewed ?? card.lastReviewed ?? null

  const isNew      = srsState === 'new'      || repetitions === 0
  const isLearning = srsState === 'learning' || isNew

  // ── Learning / re-learning phase ──────────────────────────
  if (isLearning) {
    const currentStep = card.learning_step ?? 0
    const newDifficulty = repetitions === 0 ? initDifficulty(rating) : nextDifficulty(difficulty, rating)

    if (rating === 1 || rating === 2) {
      // Again / Hard → restart at step 0
      const newStability = repetitions === 0
        ? initStability(rating)
        : Math.max(shortTermStability(stability, rating), 0.1)
      return {
        stability: newStability,
        difficulty: newDifficulty,
        repetitions: repetitions + 1,
        interval: 0,
        learning_step: 0,
        due: addMinutes(nowMs, LEARNING_STEPS_MINS[0]),
        last_reviewed: new Date(nowMs).toISOString(),
        srs_state: 'learning',
      }
    }

    if (rating === 4) {
      // Easy → graduate immediately
      const newStability = repetitions === 0
        ? initStability(4)
        : Math.max(shortTermStability(stability, 4), 0.1)
      const interval = nextInterval(newStability)
      return {
        stability: newStability,
        difficulty: newDifficulty,
        repetitions: repetitions + 1,
        interval,
        learning_step: null,
        due: addDays(nowMs, interval),
        last_reviewed: new Date(nowMs).toISOString(),
        srs_state: 'review',
      }
    }

    // Good → advance to next step or graduate
    const nextStep = currentStep + 1
    if (nextStep < LEARNING_STEPS_MINS.length) {
      const newStability = repetitions === 0
        ? initStability(3)
        : Math.max(shortTermStability(stability, 3), 0.1)
      return {
        stability: newStability,
        difficulty: newDifficulty,
        repetitions: repetitions + 1,
        interval: 0,
        learning_step: nextStep,
        due: addMinutes(nowMs, LEARNING_STEPS_MINS[nextStep]),
        last_reviewed: new Date(nowMs).toISOString(),
        srs_state: 'learning',
      }
    }

    // Last step + Good → graduate
    const newStability = repetitions === 0
      ? initStability(3)
      : Math.max(shortTermStability(stability, 3), 0.1)
    const interval = nextInterval(newStability)
    return {
      stability: newStability,
      difficulty: newDifficulty,
      repetitions: repetitions + 1,
      interval,
      learning_step: null,
      due: addDays(nowMs, interval),
      last_reviewed: new Date(nowMs).toISOString(),
      srs_state: 'review',
    }
  }

  // ── Review phase ───────────────────────────────────────────
  const elapsedDays = lastReviewed
    ? Math.max(0, (nowMs - new Date(lastReviewed).getTime()) / 86400000)
    : stability || 1

  const retrievability = forgettingCurve(elapsedDays, stability)
  const newDifficulty  = nextDifficulty(difficulty, rating)

  if (rating === 1) {
    // Lapse → back to learning
    const newStability = Math.max(nextForgetStability(newDifficulty, stability, retrievability), 0.1)
    return {
      stability: newStability,
      difficulty: newDifficulty,
      repetitions: repetitions + 1,
      interval: 0,
      learning_step: 0,
      due: addMinutes(nowMs, LEARNING_STEPS_MINS[0]),
      last_reviewed: new Date(nowMs).toISOString(),
      srs_state: 'learning',
    }
  }

  const newStability = Math.max(nextRecallStability(newDifficulty, stability, retrievability, rating), 0.1)
  const interval = nextInterval(newStability)
  return {
    stability: newStability,
    difficulty: newDifficulty,
    repetitions: repetitions + 1,
    interval,
    learning_step: null,
    due: addDays(nowMs, interval),
    last_reviewed: new Date(nowMs).toISOString(),
    srs_state: 'review',
  }
}

export function isDue(card) {
  if (!card.due) return true
  return new Date(card.due).getTime() <= Date.now()
}

export function getNextIntervalLabel(card, rating) {
  const stability   = card.stability   ?? 0
  const repetitions = card.repetitions ?? 0
  const srsState    = card.srs_state   ?? card.state ?? 'new'
  const isLearning  = srsState === 'learning' || srsState === 'new' || repetitions === 0

  if (rating === 1 || (isLearning && rating === 2)) {
    return `${LEARNING_STEPS_MINS[0]}m`
  }
  if (isLearning && rating === 3) {
    const step = (card.learning_step ?? 0) + 1
    if (step < LEARNING_STEPS_MINS.length) return `${LEARNING_STEPS_MINS[step]}m`
    // Graduate
    const s = repetitions === 0 ? initStability(3) : Math.max(shortTermStability(stability, 3), 0.1)
    return formatInterval(nextInterval(s))
  }
  if (isLearning && rating === 4) {
    const s = repetitions === 0 ? initStability(4) : Math.max(shortTermStability(stability, 4), 0.1)
    return formatInterval(nextInterval(s))
  }

  // Review phase
  const lastReviewed = card.last_reviewed ?? card.lastReviewed ?? null
  const elapsedDays  = lastReviewed
    ? Math.max(0, (Date.now() - new Date(lastReviewed).getTime()) / 86400000)
    : stability || 1
  const r = forgettingCurve(elapsedDays, stability)
  const d = nextDifficulty(card.difficulty ?? 5, rating)

  let s
  if (rating === 1) s = Math.max(nextForgetStability(d, stability, r), 0.1)
  else              s = Math.max(nextRecallStability(d, stability, r, rating), 0.1)

  return formatInterval(nextInterval(s))
}

function formatInterval(days) {
  if (days < 1)   return '<1d'
  if (days === 1) return '1d'
  if (days < 30)  return `${days}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}
