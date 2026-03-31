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

  const fieldLines = blueprint.map(f => {
    const lines = [`  - "${f.key}": ${f.description || f.label}`]
    if (f.field_type === 'example') {
      lines.push(`    IMPORTANT: Wrap ONLY the exact target vocabulary word with {{word}}. One occurrence only.`)
    }
    const keys = getPhoneticKeys(f.phonetics)
    const descs = PHONETIC_DESCRIPTIONS(f.key)
    keys.forEach(pk => { if (descs[pk]) lines.push(`  - ${descs[pk]}`) })
    return lines.join('\n')
  }).join('\n')

  const exampleKeys = ['word']
  blueprint.forEach(f => {
    exampleKeys.push(f.key)
    getPhoneticKeys(f.phonetics).forEach(pk => exampleKeys.push(`${f.key}_${pk}`))
  })

  return `You are a language learning assistant generating flashcard data.

Target language: ${targetLanguage}
Vocabulary items to process: ${JSON.stringify(vocabBatch)}

For each vocabulary item, generate a JSON object with these fields:
  - "word": the vocabulary item exactly as given
${fieldLines}

Rules:
- Return ONLY a valid JSON array, no markdown, no explanation, no code fences.
- Process every word in the input list.
- Keep entries concise and accurate.
- For example sentence fields, {{word}} must wrap ONLY the target word itself.
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

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
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

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini error:', errText)
      return error(`Gemini API error: ${geminiRes.status}`, 502)
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
