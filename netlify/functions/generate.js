import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent'

function buildPrompt(targetLanguage, blueprint, vocabBatch) {
  // Normalise phonetics regardless of shape (old array or new {ruby,extras} object)
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

  const hasExampleField = blueprint.some(f => f.field_type === 'example')

  const fieldLines = blueprint.map(f => {
    const lines = [`  - "${f.key}": ${f.description || f.label}`]
    if (f.field_type === 'example') {
      lines.push(`    Generate 3 varied example sentences, separated by " ;;; " (space-semicolonsemicolonsemicolon-space).`)
      lines.push(`    Each sentence must wrap ONLY the exact target word with {{word}}. Use natural, contextually different sentences.`)
      lines.push(`    Example format: "나는 {{사랑}}해. ;;; 그것은 {{사랑}}이야. ;;; {{사랑}}은 아름다워."`)
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

  return `You are a language learning assistant generating flashcard data.

Target language: ${targetLanguage}
Vocabulary items to process: ${JSON.stringify(vocabBatch)}

HOMOGRAPH RULE — CRITICAL:
Some words have multiple unrelated meanings (homographs). For example, Korean "눈" means both "eye" and "snow".
- If a word has 2 or more distinct unrelated meanings, output ONE separate JSON object per meaning.
- Each object must have "_meanings": <total number of distinct meanings for this word> and "_sense": "<very brief disambiguating label in the source language, e.g. 'eye' or 'snow'>".
- If a word has only one meaning, set "_meanings": 1 and "_sense": "".
- Do NOT combine multiple meanings into one card (e.g. do NOT write "eye/snow" in the definition field).

For each vocabulary item (or each meaning if a homograph), generate a JSON object with these fields:
  - "word": the vocabulary item exactly as given
  - "_meanings": integer — total number of distinct unrelated meanings this word has
  - "_sense": string — brief source-language label for THIS meaning only (empty string if _meanings is 1)
${fieldLines}

Rules:
- Return ONLY a valid JSON array, no markdown, no explanation, no code fences.
- Process every word in the input list.
- Keep entries concise and accurate.
- If you cannot generate a field, use an empty string "".

Expected output keys per item: ${exampleKeys.join(', ')}

Now generate for: ${JSON.stringify(vocabBatch)}`
}

export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    if (event.httpMethod !== 'POST') return error('Method not allowed', 405)

    const { vocab, blueprint } = JSON.parse(event.body)

    // vocab is { vocab: string[], targetLanguage: string }
    if (!vocab?.vocab || !blueprint) return error('vocab and blueprint required')

    const vocabArray = vocab.vocab
    const targetLanguage = vocab.targetLanguage || 'Korean'

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return error('Gemini API key not configured', 500)

    const prompt = buildPrompt(targetLanguage, blueprint, vocabArray)

    // Call Gemini with exponential backoff — retries on 503/429 (rate limit / overload)
    const MAX_RETRIES = 4
    const RETRY_DELAYS = [1000, 2000, 4000, 8000]

    let geminiRes
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      })

      if (geminiRes.ok) break

      const retryable = geminiRes.status === 503 || geminiRes.status === 429
      if (!retryable || attempt === MAX_RETRIES) {
        const errText = await geminiRes.text()
        console.error(`Gemini error (attempt ${attempt + 1}):`, errText)
        return error(`Gemini API error: ${geminiRes.status}`, 502)
      }

      const delay = RETRY_DELAYS[attempt] ?? 8000
      console.log(`Gemini ${geminiRes.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await new Promise(r => setTimeout(r, delay))
    }

    const geminiData = await geminiRes.json()
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      console.error('No text from Gemini:', JSON.stringify(geminiData))
      return error('Gemini returned empty response', 502)
    }

    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const cards = Array.isArray(parsed) ? parsed : []
      return json({ cards })
    } catch (parseErr) {
      console.error('Failed to parse Gemini output:', text)
      // Return stub cards so the import doesn't silently drop words
      return json({ cards: vocabArray.map(w => ({ word: w, _error: true })) })
    }
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
