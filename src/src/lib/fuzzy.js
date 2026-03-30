/**
 * Fuzzy answer matching — handles CJK scripts where Levenshtein
 * is more appropriate than substring matching.
 */

function levenshtein(a, b) {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
    }
  }
  return matrix[b.length][a.length]
}

function isCJK(str) {
  return /[\u3000-\u9fff\uac00-\ud7ff\u4e00-\u9fff\u3040-\u30ff]/.test(str)
}

/**
 * Returns { correct: boolean, similarity: number (0-1), exact: boolean }
 */
export function fuzzyMatch(input, expected, threshold = 0.85) {
  if (!input || !expected) return { correct: false, similarity: 0, exact: false }

  const a = input.trim().toLowerCase()
  const b = expected.trim().toLowerCase()

  if (a === b) return { correct: true, similarity: 1, exact: true }

  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return { correct: true, similarity: 1, exact: true }

  const dist = levenshtein(a, b)
  const similarity = 1 - dist / maxLen

  // For CJK text, be slightly more strict since a single character is meaningful
  const effectiveThreshold = isCJK(b) ? Math.max(threshold, 0.9) : threshold

  return {
    correct: similarity >= effectiveThreshold,
    similarity,
    exact: false,
  }
}

/**
 * Strip the cloze marker from a string and return
 * { display: string with blank, answer: string }
 */
export function parseCloze(text, marker = '{{', endMarker = '}}') {
  if (!text) return { display: '', answer: '', hasCloze: false }
  const start = text.indexOf(marker)
  const end = text.indexOf(endMarker, start)
  if (start === -1 || end === -1) return { display: text, answer: '', hasCloze: false }

  const answer = text.slice(start + marker.length, end)
  const display = text.slice(0, start) + '___' + text.slice(end + endMarker.length)
  const before = text.slice(0, start)
  const after = text.slice(end + endMarker.length)

  return { display, answer, before, after, hasCloze: true }
}
