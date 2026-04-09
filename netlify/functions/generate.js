import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent'

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

function buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabBatch) {
  function getPhoneticKeys(ph) {
    if (!ph) return []
    if (Array.isArray(ph)) return ph.filter(k => k && k !== 'none')
    const keys = []
    if (ph.ruby && ph.ruby !== 'none') keys.push(ph.ruby)
    if (Array.isArray(ph.extras)) keys.push(...ph.extras)
    return keys
  }

  const PHONETIC_DESCRIPTIONS = (fieldKey) => ({
    furigana:              `"${fieldKey}_furigana": hiragana/katakana above each kanji, formatted as space-separated "kanji:reading" pairs e.g. "日本語:にほんご"`,
    romaji:                `"${fieldKey}_romaji": Hepburn romanisation`,
    pinyin:                `"${fieldKey}_pinyin": Pīnyīn with tone marks`,
    bopomofo:              `"${fieldKey}_bopomofo": Zhùyīn Fúhào symbols (ㄅㄆㄇ)`,
    jyutping:              `"${fieldKey}_jyutping": Jyutping romanisation for Cantonese`,
    hangulRomanisation:    `"${fieldKey}_hangulRomanisation": Revised Romanisation of Korean`,
    cantoneseRomanisation: `"${fieldKey}_cantoneseRomanisation": Yale Cantonese romanisation`,
    romanisation:          `"${fieldKey}_romanisation": standard Latin-script transliteration`,
    cyrillicTranslit:      `"${fieldKey}_cyrillicTranslit": Latin transliteration of Cyrillic`,
    tones:                 `"${fieldKey}_tones": tonal representation (numbered or marked)`,
    diacritics:            `"${fieldKey}_diacritics": full vowel-marked version (tashkeel, nikud, etc.)`,
    ipa:                   `"${fieldKey}_ipa": IPA pronunciation string e.g. /niː.hɑːŋ.ɡoʊ/`,
    english:               `"${fieldKey}_english": concise English gloss or translation`,
  })

  const fieldLines = blueprint.map(f => {
    const lines = [`  - "${f.key}": ${f.description || f.label}`]
    if (f.key === 'source_translation') {
      lines.push(`    CRITICAL: ONE clean word in ${sourceLanguage}. No slashes, no alternatives. Match the specific meaning.`)
    }
    if (f.key === 'context') {
      const ctxLang = contextLanguage === 'source' ? sourceLanguage : targetLanguage
      lines.push(`    Write in ${ctxLang}. Very brief (2-5 words), disambiguates this meaning. Leave "" if unambiguous.`)
    }
    if (f.field_type === 'example') {
      lines.push(`    Generate 3 varied sentences separated by " ;;; ". Wrap ONLY the target word with {{word}}.`)
      lines.push(`    Example: "나는 {{사랑}}해. ;;; 그것은 {{사랑}}이야. ;;; {{사랑}}은 아름다워."`)
    }
    const keys = getPhoneticKeys(f.phonetics)
    const descs = PHONETIC_DESCRIPTIONS(f.key)
    keys.forEach(pk => { if (descs[pk]) lines.push(`  - ${descs[pk]}`) })
    return lines.join('\n')
  }).join('\n')

  const exampleKeys = ['word', '_meanings', '_sense']
  blueprint.forEach(f => {
    exampleKeys.push(f.key)
    getPhoneticKeys(f.phonetics).forEach(pk => exampleKeys.push(`${f.key}_${pk}`))
  })

  // Strip any "(sense)" hints — the prompt always receives clean words
  const cleanVocab = vocabBatch.map(v => stripSenseHint(v))

  return `You are a language learning assistant generating flashcard data.

Target language: ${targetLanguage}
Source language: ${sourceLanguage}

HOMOGRAPH RULE — CRITICAL:
A homograph is a word with multiple distinct, unrelated meanings. Examples:
- Korean "눈" → "eye" (body part) AND "snow" (weather) → 2 cards
- Spanish "café" → "coffee" AND "brown" (colour) → 2 cards

Rules for homographs:
- If a word has 2 or more COMMON unrelated meanings, output ONE separate JSON object per meaning.
- Each object must have "_meanings": <total count> and "_sense": "<very brief source-language label>".
- If a word has only one meaning, set "_meanings": 1 and "_sense": "".
- Do NOT combine multiple meanings into one card.

For each vocabulary item (or each meaning if a homograph), generate a JSON object with:
  - "word": the vocabulary item EXACTLY as given — no extra text, no parentheses
  - "_meanings": integer
  - "_sense": string (empty if only one meaning)
${fieldLines}

Rules:
- Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
- CRITICAL: Fill EVERY field. Do NOT leave any field empty or as "". Use a best approximation if uncertain.
- Process EVERY word — output array must have at least as many objects as the input.
- "word" must match the input word EXACTLY.
- CRITICAL FOR HOMOGRAPHS: Every field must correspond to the specific "_sense". Never mix fields from different meanings.
- "context" written in ${contextLanguage === 'cloze' || contextLanguage === 'target' ? targetLanguage : sourceLanguage}, 2-5 words. Leave "" only if completely unambiguous.

Expected output keys: ${exampleKeys.join(', ')}

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
    const targetLanguage  = vocab.targetLanguage  || 'Korean'
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
        // Normalise word fields — strip any "(sense)" Gemini may have added
        const cards = parsed.map(c => ({ ...c, word: stripSenseHint(c.word) }))
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
