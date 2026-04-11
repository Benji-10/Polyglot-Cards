import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent'

// Strict JSON repair — strip markdown fences, fix common truncation
function cleanAndParse(text) {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  // Sometimes Gemini truncates — try to close the array
  if (!cleaned.endsWith(']')) {
    const lastBrace = cleaned.lastIndexOf('}')
    const lastComma = cleaned.lastIndexOf(',')
    if (lastBrace > lastComma) cleaned = cleaned.slice(0, lastBrace + 1) + ']'
    else if (lastComma > 0)   cleaned = cleaned.slice(0, lastComma) + ']'
    else                      cleaned += ']'
  }
  return JSON.parse(cleaned)
}

// Strip sense hints appended by regen ("word (sense)") from the word field
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

function splitMulti(text) {
  return String(text || '').split(' ;;; ').map(s => s.trim()).filter(Boolean)
}

function normaliseAnnotatedValue(rawVal, annotationMap = {}, isExample = false) {
  // Already in target shape
  if (Array.isArray(rawVal)) {
    return rawVal
      .map(it => {
        if (!it || typeof it !== 'object') return null
        const text = it.text || ''
        const annotations = it.annotations && typeof it.annotations === 'object' ? it.annotations : {}
        return text ? { text, annotations } : null
      })
      .filter(Boolean)
  }

  // Legacy object: { text, romanisation, ipa, ... }
  if (rawVal && typeof rawVal === 'object') {
    const { text = '', annotations = null, ...rest } = rawVal
    const merged = {
      ...(annotations && typeof annotations === 'object' ? annotations : {}),
      ...rest,
      ...annotationMap,
    }

    if (isExample) {
      const lines = splitMulti(text)
      const annoByKey = {}
      Object.entries(merged).forEach(([k, v]) => { annoByKey[k] = splitMulti(v) })
      return lines.map((line, i) => {
        const anns = {}
        Object.entries(annoByKey).forEach(([k, arr]) => { if (arr[i]) anns[k] = arr[i] })
        return { text: line, annotations: anns }
      })
    }
    return text ? [{ text, annotations: merged }] : []
  }

  // Plain string + optional annotation side-channels
  const text = String(rawVal || '')
  if (!text) return []
  if (isExample) {
    const lines = splitMulti(text)
    const annoByKey = {}
    Object.entries(annotationMap).forEach(([k, v]) => { annoByKey[k] = splitMulti(v) })
    return lines.map((line, i) => {
      const anns = {}
      Object.entries(annoByKey).forEach(([k, arr]) => { if (arr[i]) anns[k] = arr[i] })
      return { text: line, annotations: anns }
    })
  }
  return [{ text, annotations: annotationMap }]
}

function normaliseGeneratedCards(parsedCards, blueprint) {
  return parsedCards.map(card => {
    const next = { ...card, word: stripSenseHint(card.word) }

    blueprint.forEach(f => {
      const annotationKeys = getPhoneticKeys(f.phonetics)
      const needsStructured = annotationKeys.length > 0 || f.field_type === 'example'
      if (!needsStructured) return

      const annotationMap = {}
      annotationKeys.forEach(k => {
        const flatKey = `${f.key}_${k}`
        if (next[flatKey] != null && next[flatKey] !== '') {
          annotationMap[k] = next[flatKey]
        }
        delete next[flatKey]
      })

      next[f.key] = normaliseAnnotatedValue(next[f.key], annotationMap, f.field_type === 'example')
    })

    return next
  })
}

function buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabBatch) {

  // Human-readable descriptions for each annotation type
  const ANNOTATION_DESCRIPTIONS = {
    furigana:              'hiragana/katakana above each kanji, as space-separated "kanji:reading" pairs e.g. "日本語:にほんご"',
    romaji:                'Hepburn romanisation',
    pinyin:                'Pīnyīn with tone marks',
    bopomofo:              'Zhùyīn Fúhào symbols (ㄅㄆㄇ)',
    jyutping:              'Jyutping romanisation for Cantonese',
    hangulRomanisation:    'Revised Romanisation of Korean',
    cantoneseRomanisation: 'Yale Cantonese romanisation',
    romanisation:          'standard Latin-script transliteration',
    cyrillicTranslit:      'Latin transliteration of Cyrillic',
    tones:                 'tonal representation (numbered or marked)',
    diacritics:            'full vowel-marked version (tashkeel, nikud, etc.)',
    ipa:                   'IPA pronunciation string e.g. /niː.hɑːŋ.ɡoʊ/',
    english:               'concise English gloss or translation',
  }

  // Fields with annotations are stored as arrays of entries:
  // [{ "text": "...", "annotations": { "<annotationType>": "..." } }]
  const fieldLines = blueprint.map(f => {
    const annotationKeys = getPhoneticKeys(f.phonetics)
    const hasAnnotations = annotationKeys.length > 0
    const isExample = f.field_type === 'example'

    if (f.key === 'source_translation') {
      return `  - "${f.key}": string — ONE clean word in ${sourceLanguage}. No slashes, no alternatives. Match the specific meaning.`
    }
    if (f.key === 'context') {
      const ctxLang = contextLanguage === 'source' ? sourceLanguage : targetLanguage
      return `  - "${f.key}": string — Write in ${ctxLang}. Very brief (2-5 words), disambiguates this meaning. Leave "" if unambiguous.`
    }

    if (!hasAnnotations && !isExample) {
      return `  - "${f.key}": string — ${f.description || f.label}`
    }

    // Fields with annotations or example type become entry arrays
    const objectLines = []
    if (isExample) {
      objectLines.push(`    [{ "text": one example sentence with ONLY the target word wrapped in {{word}}, "annotations": { ... } }, ...]`)
      objectLines.push(`    Provide 3 entries in the array, one sentence per entry.`)
      annotationKeys.forEach(ak => {
        if (ANNOTATION_DESCRIPTIONS[ak]) {
          objectLines.push(`    annotations."${ak}": ${ANNOTATION_DESCRIPTIONS[ak]} for the SAME sentence.`)
        }
      })
    } else {
      objectLines.push(`    [{ "text": ${f.description || f.label}, "annotations": { ... } }]`)
      annotationKeys.forEach(ak => {
        if (ANNOTATION_DESCRIPTIONS[ak]) {
          objectLines.push(`    annotations."${ak}": ${ANNOTATION_DESCRIPTIONS[ak]}`)
        }
      })
    }

    return `  - "${f.key}": array of objects —\n${objectLines.join('\n')}`
  }).join('\n')

  // Build expected output keys list for the prompt footer
  const exampleKeys = ['word', '_meanings', '_sense']
  blueprint.forEach(f => {
    const annotationKeys = getPhoneticKeys(f.phonetics)
    if (annotationKeys.length > 0 || f.field_type === 'example') {
      exampleKeys.push(`${f.key}: [{ text, annotations: {${annotationKeys.join(', ')}} }]`)
    } else {
      exampleKeys.push(f.key)
    }
  })

  const cleanVocab = vocabBatch.map(v => stripSenseHint(v))

  return `You are a language learning assistant generating flashcard data.

Target language: ${targetLanguage}
Source language: ${sourceLanguage}

HOMOGRAPH RULE — CRITICAL:
A homograph is a word with multiple distinct, unrelated meanings. Examples:
- French "café" → "coffee" (beverage) AND "café" (establishment) AND "brown" (colour) → 3 separate objects
- English "bank" → "financial institution" AND "river bank" → 2 separate objects

Rules for homographs:
- Consider ALL common everyday meanings across ALL semantic domains.
- Output ONE separate JSON object per distinct meaning. Never combine meanings.
- Each object must have "_meanings": <total count of distinct meanings> and "_sense": "<very brief source-language label, e.g. 'beverage', 'colour', 'place'>".
- CRITICAL: Every field in a given object must match ONLY that object's "_sense". Never mix data from different meanings across objects.
- If a word has only one meaning, set "_meanings": 1 and "_sense": "".

For each vocabulary item (or each meaning if a homograph), generate a JSON object with:
  - "word": the vocabulary item EXACTLY as given — no extra text, no parentheses
  - "_meanings": integer
  - "_sense": string (empty if only one meaning)
${fieldLines}

Rules:
- Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
- CRITICAL: Fill EVERY field. Do NOT leave any field empty or as "". Use a best approximation if uncertain.
- Process EVERY word — output array must have at least as many objects as the input list.
- "word" must match the input word EXACTLY.
- "context" must be written in ${contextLanguage === 'source' ? sourceLanguage : targetLanguage}. Keep it very brief (2–5 words). Leave "" only if the word is completely unambiguous.
- For structured fields: return an ARRAY of objects with keys "text" and "annotations".
- Annotation values must be nested under "annotations" only.
- NEVER output sibling keys like "example_romanisation" or "${blueprint[0]?.key || 'field'}_english".
- Plain string fields (source_translation, context, and fields with no annotations) stay as strings — do NOT wrap them in objects.

Expected output shape per item: ${exampleKeys.join(', ')}

Now generate for: ${JSON.stringify(cleanVocab)}`
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

    const MAX_ATTEMPTS = 5
    const BASE_DELAY_MS = 1500
    let lastError = null
    let parseFailures = 0  // Track parse failures to escalate prompt strictness

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
        console.log(`Gemini retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay}ms — previous error: ${lastError}`)
        await new Promise(r => setTimeout(r, delay))
      }

      // Lower temperature on every attempt — start strict, get stricter on parse failures
      const temperature = attempt === 0 ? 0.1 : Math.max(0, 0.08 - attempt * 0.02)

      // On parse failures, rebuild prompt with extra JSON strictness instruction
      const prompt = parseFailures > 0
        ? buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabArray)
            + '\n\nCRITICAL: Your previous response failed JSON parsing. Output ONLY the raw JSON array. Absolutely no text before or after the array. No markdown. No explanation. Start your response with [ and end with ].'
        : buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabArray)

      let geminiRes
      try {
        geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
            },
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
        console.error(`Gemini ${geminiRes.status} (attempt ${attempt + 1}):`, errBody.slice(0, 400))
        if (!retryable) return error(`Gemini error ${geminiRes.status}: ${errBody.slice(0, 200)}`, 502)
        continue
      }

      let geminiData
      try { geminiData = await geminiRes.json() }
      catch (e) { lastError = `Response JSON parse: ${e.message}`; parseFailures++; continue }

      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        const reason = geminiData.candidates?.[0]?.finishReason || 'unknown'
        lastError = `Empty response (finishReason: ${reason})`
        console.error('No text from Gemini:', JSON.stringify(geminiData).slice(0, 300))
        continue
      }

      try {
        const parsed = cleanAndParse(text)
        if (!Array.isArray(parsed) || parsed.length === 0) {
          lastError = 'Output is not a non-empty array'
          parseFailures++
          continue
        }
        // Normalise structured field values into a single canonical shape
        const cards = normaliseGeneratedCards(parsed, blueprint)
        return json({ cards })
      } catch (parseErr) {
        lastError = `JSON parse: ${parseErr.message} (output: ${text.slice(0, 200)})`
        parseFailures++
        console.error(`Parse failed (attempt ${attempt + 1}):`, text.slice(0, 400))
        continue
      }
    }

    console.error(`All ${MAX_ATTEMPTS} attempts failed. Last: ${lastError}`)
    return error(`Gemini failed after ${MAX_ATTEMPTS} attempts: ${lastError}`, 502)

  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
