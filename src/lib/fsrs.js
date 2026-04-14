const FSRS_PARAMS = {
  w: [0.4072,1.1829,3.1262,15.4722,7.2102,0.5316,1.0651,0.0589,1.5330,0.1544,1.0073,1.9395,0.1100,0.2900,2.2700,0.2800,2.9898,0.5100,0.3400],
  requestRetention: 0.9,
  maximumInterval: 36500,
}
const LEARNING_STEPS_MINS = [1, 10]

function forgettingCurve(elapsed, stability) { return Math.pow(1 + elapsed / (9 * stability), -0.5) }
function nextInterval(stability) {
  const r = FSRS_PARAMS.requestRetention
  return Math.min(Math.max(Math.round(9 * stability * (Math.pow(r, -2) - 1)), 1), FSRS_PARAMS.maximumInterval)
}
function initStability(r) { return Math.max(FSRS_PARAMS.w[r-1], 0.1) }
function initDifficulty(r) { const w = FSRS_PARAMS.w; return Math.min(Math.max(w[4] - Math.exp(w[5]*(r-1)) + 1, 1), 10) }
function nextDifficulty(d, r) { const w = FSRS_PARAMS.w; const raw = d - w[6]*(r-3); return Math.min(Math.max(raw + w[7]*(10-raw), 1), 10) }
function shortTermStability(s, r) { const w = FSRS_PARAMS.w; return s * Math.exp(w[17]*(r-3+w[18])) }
function nextRecallStability(d, s, r, rating) {
  const w = FSRS_PARAMS.w
  return s * Math.exp(w[8]) * (11-d) * Math.pow(s,-w[9]) * (Math.exp(w[10]*(1-r))-1) * (rating===2?w[15]:1) * (rating===4?w[16]:1)
}
function nextForgetStability(d, s, r) { const w = FSRS_PARAMS.w; return w[11]*Math.pow(d,-w[12])*(Math.pow(s+1,w[13])-1)*Math.exp(w[14]*(1-r)) }
function addMinutes(ms, m) { return new Date(ms + m*60000).toISOString() }
function addDays(ms, d) { return new Date(ms + d*86400000).toISOString() }

export function scheduleCard(card, rating) {
  const nowMs = Date.now()
  const stability = card.stability ?? 0
  const difficulty = card.difficulty ?? 5
  const repetitions = card.repetitions ?? 0
  const srsState = card.srs_state ?? card.state ?? 'new'
  const lastReviewed = card.last_reviewed ?? card.lastReviewed ?? null
  const isNew = srsState === 'new' || repetitions === 0
  const isLearning = srsState === 'learning' || isNew

  if (isLearning) {
    const currentStep = card.learning_step ?? 0
    const newDifficulty = repetitions === 0 ? initDifficulty(rating) : nextDifficulty(difficulty, rating)
    if (rating === 1 || rating === 2) {
      const newS = Math.max(repetitions===0 ? initStability(rating) : shortTermStability(stability,rating), 0.1)
      return { stability:newS, difficulty:newDifficulty, repetitions:repetitions+1, interval:0, learning_step:0, due:addMinutes(nowMs,LEARNING_STEPS_MINS[0]), last_reviewed:new Date(nowMs).toISOString(), srs_state:'learning' }
    }
    if (rating === 4) {
      const newS = Math.max(repetitions===0 ? initStability(4) : shortTermStability(stability,4), 0.1)
      const interval = nextInterval(newS)
      return { stability:newS, difficulty:newDifficulty, repetitions:repetitions+1, interval, learning_step:null, due:addDays(nowMs,interval), last_reviewed:new Date(nowMs).toISOString(), srs_state:'review' }
    }
    const nextStep = currentStep + 1
    if (nextStep < LEARNING_STEPS_MINS.length) {
      const newS = Math.max(repetitions===0 ? initStability(3) : shortTermStability(stability,3), 0.1)
      return { stability:newS, difficulty:newDifficulty, repetitions:repetitions+1, interval:0, learning_step:nextStep, due:addMinutes(nowMs,LEARNING_STEPS_MINS[nextStep]), last_reviewed:new Date(nowMs).toISOString(), srs_state:'learning' }
    }
    const newS = Math.max(repetitions===0 ? initStability(3) : shortTermStability(stability,3), 0.1)
    const interval = nextInterval(newS)
    return { stability:newS, difficulty:newDifficulty, repetitions:repetitions+1, interval, learning_step:null, due:addDays(nowMs,interval), last_reviewed:new Date(nowMs).toISOString(), srs_state:'review' }
  }

  const elapsed = lastReviewed ? Math.max(0,(nowMs-new Date(lastReviewed).getTime())/86400000) : stability||1
  const retrievability = forgettingCurve(elapsed, stability)
  const newDifficulty = nextDifficulty(difficulty, rating)
  if (rating === 1) {
    const newS = Math.max(nextForgetStability(newDifficulty,stability,retrievability), 0.1)
    return { stability:newS, difficulty:newDifficulty, repetitions:repetitions+1, interval:0, learning_step:0, due:addMinutes(nowMs,LEARNING_STEPS_MINS[0]), last_reviewed:new Date(nowMs).toISOString(), srs_state:'learning' }
  }
  const newS = Math.max(nextRecallStability(newDifficulty,stability,retrievability,rating), 0.1)
  const interval = nextInterval(newS)
  return { stability:newS, difficulty:newDifficulty, repetitions:repetitions+1, interval, learning_step:null, due:addDays(nowMs,interval), last_reviewed:new Date(nowMs).toISOString(), srs_state:'review' }
}

export function isDue(card) { return !card.due || new Date(card.due).getTime() <= Date.now() }

export function getNextIntervalLabel(card, rating) {
  const stability = card.stability ?? 0
  const repetitions = card.repetitions ?? 0
  const srsState = card.srs_state ?? 'new'
  const isLearning = srsState==='learning' || srsState==='new' || repetitions===0
  if (rating===1 || (isLearning && rating===2)) return `${LEARNING_STEPS_MINS[0]}m`
  if (isLearning && rating===3) {
    const step = (card.learning_step??0)+1
    if (step < LEARNING_STEPS_MINS.length) return `${LEARNING_STEPS_MINS[step]}m`
    const s = repetitions===0 ? initStability(3) : Math.max(shortTermStability(stability,3),0.1)
    return formatInterval(nextInterval(s))
  }
  if (isLearning && rating===4) {
    const s = repetitions===0 ? initStability(4) : Math.max(shortTermStability(stability,4),0.1)
    return formatInterval(nextInterval(s))
  }
  const lastReviewed = card.last_reviewed ?? card.lastReviewed ?? null
  const elapsed = lastReviewed ? Math.max(0,(Date.now()-new Date(lastReviewed).getTime())/86400000) : stability||1
  const r = forgettingCurve(elapsed, stability)
  const d = nextDifficulty(card.difficulty??5, rating)
  let s
  if (rating===1) s = Math.max(nextForgetStability(d,stability,r),0.1)
  else s = Math.max(nextRecallStability(d,stability,r,rating),0.1)
  return formatInterval(nextInterval(s))
}

function formatInterval(days) {
  if (days < 1) return '<1d'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.round(days/30)}mo`
  return `${(days/365).toFixed(1)}y`
}
