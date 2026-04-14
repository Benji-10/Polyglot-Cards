function damerauLevenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const la = a.length, lb = b.length
  const d = new Int32Array((la + 1) * (lb + 1))
  const idx = (i, j) => i * (lb + 1) + j
  for (let i = 0; i <= la; i++) d[idx(i, 0)] = i
  for (let j = 0; j <= lb; j++) d[idx(0, j)] = j
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1
      d[idx(i,j)] = Math.min(d[idx(i-1,j)]+1, d[idx(i,j-1)]+1, d[idx(i-1,j-1)]+cost)
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1])
        d[idx(i,j)] = Math.min(d[idx(i,j)], d[idx(i-2,j-2)]+cost)
    }
  }
  return d[idx(la, lb)]
}

function isCJK(str) { return /[\u3000-\u9fff\uac00-\ud7ff\u4e00-\u9fff\u3040-\u30ff]/.test(str) }
function stripAccents(str) { return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
function normalise(str, stripAcc) { let s = str.trim().toLowerCase(); if (stripAcc) s = stripAccents(s); return s }

export function fuzzyMatch(input, expected, opts = {}) {
  const { strictAccents = true, strictMode = false } = typeof opts === 'number' ? {} : opts
  if (!input || !expected) return { correct: false, similarity: 0, exact: false }
  const a = normalise(input, !strictAccents)
  const b = normalise(expected, !strictAccents)
  if (a === b) return { correct: true, similarity: 1, exact: true }
  if (strictMode) return { correct: false, similarity: 0, exact: false }
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return { correct: true, similarity: 1, exact: true }
  const dist = damerauLevenshtein(a, b)
  const similarity = 1 - dist / maxLen
  let threshold
  if (maxLen <= 2) threshold = 1.0
  else if (maxLen <= 4) threshold = 0.75
  else if (isCJK(b)) threshold = 0.9
  else threshold = typeof opts === 'number' ? opts : 0.85
  return { correct: similarity >= threshold, similarity, exact: false }
}

export function parseCloze(text, marker = '{{', endMarker = '}}') {
  if (!text) return { display: '', answer: '', hasCloze: false }
  const sentence = pickRandomExample(text)
  const start = sentence.indexOf(marker)
  const end = sentence.indexOf(endMarker, start)
  if (start === -1 || end === -1) return { display: sentence, answer: '', hasCloze: false }
  const answer = sentence.slice(start + marker.length, end)
  const before = sentence.slice(0, start)
  const after = sentence.slice(end + endMarker.length)
  return { display: before + '___' + after, answer, before, after, hasCloze: true }
}

export function pickRandomExample(text) {
  if (!text) return ''
  const parts = text.split(' ;;; ').map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) return text.trim()
  return parts[Math.floor(Math.random() * parts.length)]
}
