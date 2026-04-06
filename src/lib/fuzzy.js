/**
 * Fuzzy answer matching — multilingual-aware
 *
 * Uses Damerau-Levenshtein (adds transpositions to standard Levenshtein)
 * so "teh" → "the" counts as 1 edit not 2.
 *
 * Normalisation pipeline:
 *   1. Trim whitespace
 *   2. Lowercase
 *   3. Optionally strip accents (NFD decomposition + remove combining marks)
 *      — controlled by `strictAccents` flag (default: true = accents matter)
 *
 * Short-word protection:
 *   - Words ≤ 2 chars: exact match required (similarity threshold = 1.0)
 *   - Words 3–4 chars: stricter threshold (0.9)
 *   - Words 5+ chars:  standard threshold (0.85, or 0.9 for CJK)
 */

// ── Damerau-Levenshtein distance ──────────────────────────
function damerauLevenshtein(a, b) {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const la = a.length
  const lb = b.length
  // Use a flat array for the DP table (slightly faster than 2-D array)
  const d = new Int32Array((la + 1) * (lb + 1))
  const idx = (i, j) => i * (lb + 1) + j

  for (let i = 0; i <= la; i++) d[idx(i, 0)] = i
  for (let j = 0; j <= lb; j++) d[idx(0, j)] = j

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[idx(i, j)] = Math.min(
        d[idx(i - 1, j)] + 1,        // deletion
        d[idx(i, j - 1)] + 1,        // insertion
        d[idx(i - 1, j - 1)] + cost  // substitution
      )
      // Transposition (Damerau extension)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[idx(i, j)] = Math.min(d[idx(i, j)], d[idx(i - 2, j - 2)] + cost)
      }
    }
  }
  return d[idx(la, lb)]
}

// ── Script detection ───────────────────────────────────────
function isCJK(str) {
  return /[\u3000-\u9fff\uac00-\ud7ff\u4e00-\u9fff\u3040-\u30ff]/.test(str)
}

// ── Accent stripping ───────────────────────────────────────
// NFD decomposes é → e + combining acute; filter removes combining marks.
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── Normalisation ──────────────────────────────────────────
function normalise(str, stripAcc) {
  let s = str.trim().toLowerCase()
  if (stripAcc) s = stripAccents(s)
  return s
}

/**
 * Compute similarity and decide correctness.
 *
 * @param {string} input         – what the user typed
 * @param {string} expected      – the correct answer
 * @param {object} [opts]
 * @param {boolean} [opts.strictAccents=true] – if false, accents are stripped before comparison
 * @returns {{ correct: boolean, similarity: number, exact: boolean }}
 */
export function fuzzyMatch(input, expected, opts = {}) {
  const { strictAccents = true } = typeof opts === 'number' ? {} : opts
  // Back-compat: third arg used to be a numeric threshold
  const threshold = typeof opts === 'number' ? opts : 0.85

  if (!input || !expected) return { correct: false, similarity: 0, exact: false }

  const a = normalise(input,    !strictAccents)
  const b = normalise(expected, !strictAccents)

  if (a === b) return { correct: true, similarity: 1, exact: true }

  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return { correct: true, similarity: 1, exact: true }

  const dist       = damerauLevenshtein(a, b)
  const similarity = 1 - dist / maxLen

  // Short-word protection
  let effectiveThreshold
  if (maxLen <= 2) {
    effectiveThreshold = 1.0          // must be exact
  } else if (maxLen <= 4) {
    effectiveThreshold = 0.9          // 1 typo max for short words
  } else if (isCJK(b)) {
    effectiveThreshold = Math.max(threshold, 0.9)  // CJK: strict
  } else {
    effectiveThreshold = threshold    // standard (0.85)
  }

  return {
    correct: similarity >= effectiveThreshold,
    similarity,
    exact: false,
  }
}

// ── Cloze helpers ──────────────────────────────────────────

/**
 * Parse a cloze string and return segments.
 * Picks a random sentence when multiple are stored as " ;;; " delimited.
 */
export function parseCloze(text, marker = '{{', endMarker = '}}') {
  if (!text) return { display: '', answer: '', hasCloze: false }

  const sentence = pickRandomExample(text)

  const start = sentence.indexOf(marker)
  const end   = sentence.indexOf(endMarker, start)
  if (start === -1 || end === -1) return { display: sentence, answer: '', hasCloze: false }

  const answer  = sentence.slice(start + marker.length, end)
  const before  = sentence.slice(0, start)
  const after   = sentence.slice(end + endMarker.length)
  const display = before + '___' + after

  return { display, answer, before, after, hasCloze: true }
}

/**
 * Split a multi-sentence example string (delimited by " ;;; ") and pick one at random.
 */
export function pickRandomExample(text) {
  if (!text) return ''
  const parts = text.split(' ;;; ').map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) return text.trim()
  return parts[Math.floor(Math.random() * parts.length)]
}
