/**
 * Diacritic composition engine
 *
 * Handles Unicode combining diacritics properly for any Latin-script language,
 * including Vietnamese (tone + vowel modifier stacking), Greek (polytonic),
 * and Arabic/Hebrew vowel marks (diacritics mode).
 *
 * Approach:
 *   1. Decompose the character left of the cursor (NFD).
 *   2. Add, replace, or toggle the requested combining mark.
 *   3. Re-normalise to NFC to get the canonical composed form.
 *   4. If the resulting codepoint sequence is not recognised by the host
 *      (i.e. NFC round-trips back to decomposed), we fall back to keeping
 *      the original and appending the composed version — always yielding
 *      something displayable.
 */

// ── Combining mark catalogue ───────────────────────────────
// Each entry: { label (display), combining (Unicode combining char), group }
// group: marks in the same group conflict (only one allowed at a time).
// Marks in different groups can stack freely.

export const DIACRITIC_MARKS = [
  // ── Tones / stress ──────────────────────────────────────
  { key: 'acute',     label: '´',  combining: '\u0301', group: 'tone',    hint: 'Acute accent (é, ó, ú, ý…)' },
  { key: 'grave',     label: '`',  combining: '\u0300', group: 'tone',    hint: 'Grave accent (è, ò, ù…)' },
  { key: 'circumflex',label: '^',  combining: '\u0302', group: 'circ',    hint: 'Circumflex (ê, ô, û…)' },
  { key: 'tilde',     label: '~',  combining: '\u0303', group: 'tone',    hint: 'Tilde (ã, ñ, õ…)' },
  { key: 'hook',      label: '̉',  combining: '\u0309', group: 'tone',    hint: 'Hook above — Vietnamese hỏi (ả, ẻ…)' },
  { key: 'dotbelow',  label: '.',  combining: '\u0323', group: 'dot',     hint: 'Dot below — Vietnamese nặng (ạ, ẹ…)' },
  // ── Vowel modifiers ─────────────────────────────────────
  { key: 'breve',     label: '˘',  combining: '\u0306', group: 'circ',    hint: 'Breve (ă — Romanian, Vietnamese)' },
  { key: 'horn',      label: '̛',  combining: '\u031B', group: 'horn',    hint: 'Horn — Vietnamese ơ, ư' },
  { key: 'macron',    label: '¯',  combining: '\u0304', group: 'circ',    hint: 'Macron (ā, ē, ō — Latvian, Japanese romaji…)' },
  { key: 'caron',     label: 'ˇ',  combining: '\u030C', group: 'circ',    hint: 'Caron / háček (š, č, ž — Czech, Slovak…)' },
  { key: 'ring',      label: '°',  combining: '\u030A', group: 'ring',    hint: 'Ring above (å — Nordic)' },
  { key: 'diaeresis', label: '¨',  combining: '\u0308', group: 'dia',     hint: 'Umlaut / diaeresis (ä, ö, ü…)' },
  { key: 'cedilla',   label: '¸',  combining: '\u0327', group: 'cedilla', hint: 'Cedilla (ç, ş, ģ…)' },
  { key: 'ogonek',    label: '˛',  combining: '\u0328', group: 'cedilla', hint: 'Ogonek (ą, ę — Polish)' },
  { key: 'dotabove',  label: '˙',  combining: '\u0307', group: 'dot',     hint: 'Dot above (ż, ġ, ṡ…)' },
  // ── Greek / polytonic extras ─────────────────────────────
  { key: 'smooth',    label: '᾿', combining: '\u0313', group: 'breath',  hint: 'Smooth breathing (Greek ψιλή)' },
  { key: 'rough',     label: '῾', combining: '\u0314', group: 'breath',  hint: 'Rough breathing (Greek δασεῖα)' },
  { key: 'iotasub',   label: 'ͅ', combining: '\u0345', group: 'iota',    hint: 'Iota subscript (Greek ᾳ, ῃ, ῳ)' },
  // ── Tone marks (Vietnamese / tonal langs) ────────────────
  // Note: acute/grave/tilde/hook/dotbelow already cover Viet tones 1-5
]

// ── Special standalone chars (not decomposable) ───────────
// Detected automatically from target words; these are the universal fallbacks.
export const ALWAYS_SHOW_SPECIALS = [
  { ch: 'æ', hint: 'ae ligature (Danish, Norwegian, Old English)' },
  { ch: 'ø', hint: 'o-slash (Danish, Norwegian)' },
  { ch: 'ß', hint: 'sharp s (German)' },
  { ch: 'þ', hint: 'thorn (Icelandic, Old English)' },
  { ch: 'ð', hint: 'eth (Icelandic, Faroese)' },
  { ch: 'đ', hint: 'd-stroke (Vietnamese, South Slavic)' },
  { ch: 'ŋ', hint: 'eng (IPA, some Nordic)' },
  { ch: 'ŀ', hint: 'l-middle-dot (Catalan)' },
  { ch: 'ĸ', hint: 'kra (Greenlandic)' },
]

// All combining codepoints so we can detect them in scanned words
const ALL_COMBINING = new Set(DIACRITIC_MARKS.map(d => d.combining))

/**
 * Decompose a string to NFD and return { base, marks[] } for the last character.
 * `marks` are the combining codepoints attached to that base.
 */
function decomposeChar(ch) {
  const nfd = ch.normalize('NFD')
  // Split into base + combining sequence
  // Base = first char (or first surrogate pair), rest are combining
  const segs = [...nfd]
  const base = segs[0]
  const marks = segs.slice(1)
  return { base, marks }
}

/**
 * Apply a diacritic mark to the character just before the cursor.
 * Returns { newValue, newCursorPos } — the updated input value and cursor.
 *
 * Behaviour:
 *   - If the prev char already has a mark of the SAME group → toggle / replace
 *   - If the prev char has a mark of a DIFFERENT group → add (stack)
 *   - If the resulting NFC is the same length (1 char) → great
 *   - If NFC can't compose it (exotic combo) → still store as NFD sequence
 *
 * @param {string} value       current input value
 * @param {number} cursorPos   current cursor position
 * @param {string} combining   the combining character to apply (e.g. '\u0301')
 * @param {string} group       its conflict group
 */
export function applyDiacritic(value, cursorPos, combining, group) {
  if (cursorPos === 0) return { newValue: value, newCursorPos: cursorPos }

  // Find the character just before the cursor
  // We need to handle surrogate pairs and multi-codepoint graphemes
  const before = value.slice(0, cursorPos)
  const after = value.slice(cursorPos)

  // Get the last grapheme cluster (approximately: last Unicode scalar)
  // For our purposes, the last char before cursor
  const chars = [...before]
  if (chars.length === 0) return { newValue: value, newCursorPos: cursorPos }

  const lastChar = chars[chars.length - 1]
  const rest = chars.slice(0, -1).join('')

  // Decompose to NFD
  const nfd = lastChar.normalize('NFD')
  const allCodepoints = [...nfd]
  const base = allCodepoints[0]
  const existingMarks = allCodepoints.slice(1)

  // Find the group of each existing mark
  const marksByGroup = {}
  for (const mark of existingMarks) {
    const entry = DIACRITIC_MARKS.find(d => d.combining === mark)
    const g = entry?.group ?? 'other'
    if (!marksByGroup[g]) marksByGroup[g] = []
    marksByGroup[g].push(mark)
  }

  let newMarks
  if (marksByGroup[group]) {
    // Same group: if the exact mark is already present, remove it (toggle off);
    // otherwise replace all marks in that group with the new one
    const groupMarks = marksByGroup[group]
    if (groupMarks.length === 1 && groupMarks[0] === combining) {
      // Toggle off
      newMarks = existingMarks.filter(m => m !== combining)
    } else {
      // Replace
      newMarks = existingMarks.filter(m => {
        const entry = DIACRITIC_MARKS.find(d => d.combining === m)
        return (entry?.group ?? 'other') !== group
      })
      newMarks.push(combining)
    }
  } else {
    // Different group — stack it
    newMarks = [...existingMarks, combining]
  }

  // Sort marks in canonical order (Unicode canonical ordering for combining chars)
  // Most combining chars have a combining class; we approximate by grouping:
  // Below-base marks (cedilla 202, ogonek 220, dot-below 220) before above-base
  const combiningClass = (m) => {
    const cp = m.codePointAt(0)
    // Approximation: below-base
    if ([0x0323, 0x0328, 0x0325, 0x0329, 0x032D, 0x0331, 0x0345].includes(cp)) return 220
    // Nukta
    if (cp === 0x093C) return 7
    // Default above
    return 230
  }
  newMarks.sort((a, b) => combiningClass(a) - combiningClass(b))

  // Compose: base + sorted marks → NFC
  const composed = (base + newMarks.join('')).normalize('NFC')
  const newLastChar = composed

  const newValue = rest + newLastChar + after
  // Cursor stays at same logical position (after the modified char)
  // In terms of JS string indices, account for possible length change
  const oldLen = rest.length + lastChar.length
  const newLen = rest.length + newLastChar.length
  const newCursorPos = cursorPos + (newLen - oldLen)

  return { newValue, newCursorPos }
}

/**
 * Scan card words and fields to extract:
 * 1. Which diacritic marks appear (to show as buttons)
 * 2. Which special chars appear (to show after diacritic buttons)
 *
 * Returns { marks: DiacriticMark[], specials: string[] }
 */
export function extractDiacriticsFromCards(cards) {
  const markKeys = new Set()
  const specialChars = new Set()

  const processText = (text) => {
    if (!text || typeof text !== 'string') return
    const nfd = text.normalize('NFD')
    for (const ch of nfd) {
      const cp = ch.codePointAt(0)
      // Combining char
      if (cp >= 0x0300 && cp <= 0x036F) {
        const entry = DIACRITIC_MARKS.find(d => d.combining === ch)
        if (entry) markKeys.add(entry.key)
      }
      // Also check for Greek combining (0x1DC0–0x1DFF, 0x0313, 0x0314, 0x0345)
      if ([0x0313, 0x0314, 0x0345].includes(cp)) {
        const entry = DIACRITIC_MARKS.find(d => d.combining === ch)
        if (entry) markKeys.add(entry.key)
      }
    }

    // Check for special standalone chars that aren't decomposable to base+mark
    for (const ch of text) {
      const cp = ch.codePointAt(0)
      if (cp < 0x80) continue // pure ASCII
      const nfd1 = ch.normalize('NFD')
      const allCps = [...nfd1]
      const base = allCps[0]
      const marks = allCps.slice(1)

      // If no combining marks → it's a standalone special char
      if (marks.length === 0 && cp >= 0x00C0) {
        // Check if it's in our ALWAYS_SHOW_SPECIALS
        const special = ALWAYS_SHOW_SPECIALS.find(s => s.ch === ch.toLowerCase())
        if (special) specialChars.add(special.ch)
        else if (cp >= 0x00C0 && cp <= 0x024F) {
          // Latin extended range — standalone, not decomposable
          specialChars.add(ch.toLowerCase())
        }
      }
    }
  }

  for (const card of cards) {
    processText(card.word)
    if (card.fields) {
      for (const v of Object.values(card.fields)) {
        if (typeof v === 'string') processText(v)
        else if (v && typeof v === 'object') processText(v.text)
      }
    }
  }

  const marks = DIACRITIC_MARKS.filter(d => markKeys.has(d.key))
  const specials = [...specialChars].sort()

  return { marks, specials }
}

/**
 * Insert a plain character at cursor position in an input.
 */
export function insertCharAtCursor(value, cursorPos, ch) {
  return {
    newValue: value.slice(0, cursorPos) + ch + value.slice(cursorPos),
    newCursorPos: cursorPos + ch.length,
  }
}
