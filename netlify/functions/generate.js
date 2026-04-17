import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent'

function cleanAndParse(text) {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  const arrStart = cleaned.indexOf('[')
  if (arrStart > 0) cleaned = cleaned.slice(arrStart)
  if (!cleaned.endsWith(']')) {
    const lastBrace = cleaned.lastIndexOf('}')
    const lastComma = cleaned.lastIndexOf(',')
    if (lastBrace > lastComma) cleaned = cleaned.slice(0, lastBrace + 1) + ']'
    else if (lastComma > 0) cleaned = cleaned.slice(0, lastComma) + ']'
    else cleaned += ']'
  }
  return JSON.parse(cleaned)
}

function stripSenseHint(word) {
  if (!word) return word
  const m = word.match(/^(.+?)\s*\([^)]+\)$/)
  return m ? m[1].trim() : word.trim()
}

function getPhoneticKeys(ph) {
  if (!ph) return []
  if (Array.isArray(ph)) return ph.filter(k => k && k !== 'none')
  const keys = []
  if (ph.ruby && ph.ruby !== 'none') keys.push(ph.ruby)
  if (Array.isArray(ph.extras)) keys.push(...ph.extras)
  return keys
}

// Returns true if every character in the string is Latin script + diacritics + punctuation/spaces.
// Used to decide whether to skip saving a romanisation field (word is already Latin-typeable).
function isAllLatin(str) {
  if (!str || !str.trim()) return true
  // Latin Extended: Basic Latin, Latin-1 Supplement (no control chars), Latin Extended A/B
  // Plus common punctuation. Reject if ANY char is outside these ranges.
  return /^[\u0000-\u024F\u1E00-\u1EFF\s\p{P}\p{N}]+$/u.test(str)
}

function buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabBatch) {
  const ANNOTATION_DESCRIPTIONS = {
    furigana:              'hiragana/katakana above each kanji, as space-separated "kanji:reading" pairs e.g. "日本語:にほんご"',
    romaji:                'Hepburn romanisation in Latin script',
    pinyin:                'Pīnyīn with tone marks',
    bopomofo:              'Zhùyīn Fúhào symbols (ㄅㄆㄇ)',
    jyutping:              'Jyutping romanisation for Cantonese',
    hangulRomanisation:    'Revised Romanisation of Korean in Latin script',
    cantoneseRomanisation: 'Yale Cantonese romanisation',
    romanisation:          'standard Latin-script transliteration',
    cyrillicTranslit:      'Latin transliteration of Cyrillic',
    tones:                 'tonal representation (numbered or marked)',
    diacritics:            'full vowel-marked version (tashkeel, nikud, etc.)',
    ipa:                   'IPA pronunciation string e.g. /niː.hɑːŋ.ɡoʊ/',
    english:               `concise ${sourceLanguage} gloss (one short phrase)`,
  }

  // Build schema lines for the mandatory romanisation fields
  const romTargetDesc = `Latin-script pronunciation of the target word in ${targetLanguage}. Use the standard romanisation system for the language (e.g. Hepburn for Japanese, Pinyin for Mandarin, Revised Romanisation for Korean, transliteration for Arabic/Russian). If the word is already entirely Latin script (including diacritics), output "" — it doesn't need romanisation.`
  const romSourceDesc = `Latin-script pronunciation of the ${sourceLanguage} translation. Use the standard romanisation for ${sourceLanguage}. If ${sourceLanguage} is already entirely Latin script (e.g. English, French, Spanish), output "" — it doesn't need romanisation.`

  // Schema comment block
  const schemaLines = [
    '  "word": string,           // exact input word, unchanged',
    '  "_meanings": number,      // total count of distinct unrelated meanings for this word',
    '  "_sense": string,         // "" if only one meaning; brief label if homograph e.g. "beverage"',
    '  "target_romanisation": string, // Latin-script pronunciation of word; "" if word is already Latin',
    '  "source_romanisation": string, // Latin-script pronunciation of translation; "" if already Latin',
  ]

  const fieldLines = blueprint.map(f => {
    const annotationKeys = getPhoneticKeys(f.phonetics)
    const hasAnnotations = annotationKeys.length > 0
    const isExample = f.field_type === 'example'

    if (f.key === 'source_translation') {
      if (hasAnnotations) {
        const parts = [`  "${f.key}": object — { "text": ONE clean ${sourceLanguage} word/phrase, no slashes`]
        annotationKeys.forEach(ak => {
          if (ANNOTATION_DESCRIPTIONS[ak]) parts.push(`, "${ak}": ${ANNOTATION_DESCRIPTIONS[ak]}`)
        })
        schemaLines.push(`  "${f.key}": {text, ${annotationKeys.join(', ')}},`)
        return parts.join('') + ' }'
      }
      schemaLines.push(`  "${f.key}": string,`)
      return `  "${f.key}": string — ONE clean ${sourceLanguage} word/phrase. No slashes. Match the specific meaning.`
    }

    if (f.key === 'context') {
      const ctxLang = contextLanguage === 'source' ? sourceLanguage : targetLanguage
      if (hasAnnotations) {
        schemaLines.push(`  "${f.key}": {text, ${annotationKeys.join(', ')}},`)
        return `  "${f.key}": object — { "text": ONLY for homographs: brief ${ctxLang} hint (2-4 words). "" for non-homographs, ${annotationKeys.map(ak => `"${ak}": ${ANNOTATION_DESCRIPTIONS[ak]||ak}`).join(', ')} }`
      }
      schemaLines.push(`  "${f.key}": string,`)
      return `  "${f.key}": string — ONLY for homographs: very brief ${ctxLang} hint (2-4 words) disambiguating THIS meaning. Must be "" for words with only one meaning.`
    }

    if (!hasAnnotations && !isExample) {
      schemaLines.push(`  "${f.key}": string,`)
      return `  "${f.key}": string — ${f.description || f.label}`
    }

    const subKeys = ['text', ...annotationKeys].map(k => `"${k}"`).join(', ')
    schemaLines.push(`  "${f.key}": {${subKeys}},`)

    if (isExample) {
      return [
        `  "${f.key}": object —`,
        `    "text": exactly 3 varied sentences separated by " ;;; ", wrapping ONLY the target word with {{word}}`,
        ...annotationKeys.filter(ak => ANNOTATION_DESCRIPTIONS[ak]).map(ak =>
          `    "${ak}": the SAME 3 sentences in same order but in ${ANNOTATION_DESCRIPTIONS[ak]}; also wrap the equivalent with {{word}}`
        ),
      ].join('\n')
    }

    return [
      `  "${f.key}": object —`,
      `    "text": ${f.description || f.label}`,
      ...annotationKeys.filter(ak => ANNOTATION_DESCRIPTIONS[ak]).map(ak => `    "${ak}": ${ANNOTATION_DESCRIPTIONS[ak]}`),
    ].join('\n')
  }).join('\n')

  const cleanVocab = vocabBatch.map(v => stripSenseHint(v))

  return `You are a language-learning flashcard generator. Respond with ONLY a JSON array — no markdown, no prose, no code fences. Start with [ and end with ].

Target language: ${targetLanguage}
Source language: ${sourceLanguage}

=== OUTPUT SCHEMA (one object per word, or one per distinct meaning for homographs) ===
[
{
${schemaLines.join('\n')}
},
...
]

=== HOMOGRAPH RULE ===
A homograph has multiple DISTINCT, UNRELATED meanings (not just register/nuance differences).
Examples: French "café" (beverage / establishment / colour), English "bank" (financial / river).
- N distinct meanings → N separate objects, each "_meanings": N, "_sense": "<brief label>"
- Single meaning → "_meanings": 1, "_sense": ""
- Every field in each object must be consistent with ONLY that object's meaning

=== ROMANISATION FIELDS ===
"target_romanisation": ${romTargetDesc}
"source_romanisation": ${romSourceDesc}

=== BLUEPRINT FIELD INSTRUCTIONS ===
${fieldLines}

=== RULES ===
1. Output ONLY a JSON array. No text before [ or after ].
2. Fill EVERY field. Never output "" for content fields — use best approximation.
3. "word" must match input EXACTLY (spelling, case, diacritics).
4. "context": ONLY set for homographs. Must be "" for all other words.
5. "target_romanisation" and "source_romanisation": output "" if the text is already Latin script.
6. For object fields: include "text" and all listed annotation keys only.
7. Plain string fields stay as strings. Object fields stay as objects.
8. Process ALL ${cleanVocab.length} words — output ≥ ${cleanVocab.length} objects.

=== INPUT ===
${JSON.stringify(cleanVocab)}`
}

// Strip context if empty
function filterEmptyContext(cards) {
  return cards.map(card => {
    const ctx = card.context
    if (ctx === undefined || ctx === null) return card
    const text = typeof ctx === 'object' ? (ctx.text || '') : String(ctx)
    if (!text.trim()) {
      const { context, ...rest } = card
      return rest
    }
    return card
  })
}

// Strip romanisation fields if the value is entirely Latin+diacritics
// (the word itself is already typeable without a separate romanisation)
function filterLatinRomanisation(cards) {
  return cards.map(card => {
    const out = { ...card }
    if (out.target_romanisation !== undefined) {
      const v = String(out.target_romanisation || '')
      if (!v.trim() || isAllLatin(v)) delete out.target_romanisation
    }
    if (out.source_romanisation !== undefined) {
      const v = String(out.source_romanisation || '')
      if (!v.trim() || isAllLatin(v)) delete out.source_romanisation
    }
    return out
  })
}

export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    if (event.httpMethod !== 'POST') return error('Method not allowed', 405)

    const { vocab, blueprint } = JSON.parse(event.body)
    if (!vocab?.vocab || !blueprint) return error('vocab and blueprint required')

    const vocabArray      = vocab.vocab
    const targetLanguage  = vocab.targetLanguage  || ''
    const sourceLanguage  = vocab.sourceLanguage  || 'English'
    const contextLanguage = vocab.contextLanguage || 'target'

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return error('Gemini API key not configured', 500)

    const MAX_ATTEMPTS = 4
    const BASE_DELAY_MS = 1000
    let lastError = null
    let parseFailures = 0

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
        await new Promise(r => setTimeout(r, delay))
      }

      const temperature = attempt === 0 ? 0 : 0.1

      const basePrompt = buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabArray)
      const prompt = parseFailures > 0
        ? basePrompt + '\n\nYour previous response was not valid JSON. Output ONLY [ ... ] with no other text.'
        : basePrompt

      let geminiRes
      try {
        geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: 'application/json' },
          }),
        })
      } catch (fetchErr) {
        lastError = `Network error: ${fetchErr.message}`
        continue
      }

      if (!geminiRes.ok) {
        const retryable = geminiRes.status === 503 || geminiRes.status === 429 || geminiRes.status >= 500
        let errBody = ''
        try { errBody = await geminiRes.text() } catch {}
        lastError = `HTTP ${geminiRes.status}: ${errBody.slice(0, 200)}`
        if (!retryable) return error(`Gemini error ${geminiRes.status}: ${errBody.slice(0, 200)}`, 502)
        continue
      }

      let geminiData
      try { geminiData = await geminiRes.json() }
      catch (e) { lastError = `Response JSON parse: ${e.message}`; parseFailures++; continue }

      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        lastError = `Empty response (finishReason: ${geminiData.candidates?.[0]?.finishReason || 'unknown'})`
        continue
      }

      try {
        const parsed = cleanAndParse(text)
        if (!Array.isArray(parsed) || parsed.length === 0) {
          lastError = 'Output is not a non-empty array'; parseFailures++; continue
        }
        const cards = filterLatinRomanisation(
          filterEmptyContext(
            parsed.map(c => ({ ...c, word: stripSenseHint(c.word) }))
          )
        )
        return json({ cards })
      } catch (parseErr) {
        lastError = `JSON parse: ${parseErr.message} (output: ${text.slice(0, 200)})`
        parseFailures++
        continue
      }
    }

    return error(`Gemini failed after ${MAX_ATTEMPTS} attempts: ${lastError}`, 502)

  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
