import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent'

function buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabBatch) {
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
    if (f.key === 'source_translation') {
      lines.push(`    CRITICAL: This must be a SINGLE short word or very short phrase in ${sourceLanguage}.`)
      lines.push(`    Do NOT use slash-separated alternatives (e.g. "love" not "love/affection").`)
      lines.push(`    For homographs, this must match the specific meaning (_sense) of this card only.`)
      lines.push(`    Do NOT include articles, grammatical markers, or explanations here.`)
    }
    if (f.key === 'context') {
      const ctxLang = contextLanguage === 'source' ? sourceLanguage : targetLanguage
      lines.push(`    Write this in ${ctxLang}.`)
      lines.push(`    Provide a very brief grammatical or usage hint that disambiguates this specific meaning.`)
      lines.push(`    Examples in ${ctxLang}: grammatical gender, number, part of speech, register, or usage domain.`)
      lines.push(`    For homographs this is critical — it must distinguish this meaning from the other(s).`)
      lines.push(`    Keep it very short (2-5 words). Leave as "" if the word is unambiguous.`)
    }
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
Source language: ${sourceLanguage}

HOMOGRAPH RULE — CRITICAL:
A homograph is a word with multiple distinct, unrelated meanings. Examples:
- Korean "눈" → "eye" (body part) AND "snow" (weather) → 2 cards
- Spanish "café" → "coffee" (beverage) AND "café" (establishment) AND "brown" (colour) → 3 cards
- English "bank" → financial institution AND river bank → 2 cards

Rules for homographs:
- Ensure that all possible, distinct meanings of homographs are included, such as different senses related to places, actions, objects, or colors.
- If a word has 2 or more COMMON unrelated meanings, output ONE separate JSON object per meaning.
- Include meanings that are common in everyday usage — do not limit to one meaning when multiple are well-known.
- Each object must have "_meanings": <total count> and "_sense": "<very brief source-language label, e.g. 'beverage', 'colour', 'place'>".
- If a word has only one common meaning, set "_meanings": 1 and "_sense": "".
- Do NOT combine multiple meanings into one card with slash notation.
- Do NOT omit a meaning just because another meaning is more common.

For each vocabulary item (or each meaning if a homograph), generate a JSON object with these fields:
  - "word": the vocabulary item exactly as given
  - "_meanings": integer — total number of distinct common meanings this word has
  - "_sense": string — very brief source-language label for THIS meaning only (empty string if _meanings is 1)
${fieldLines}

Rules:
- Return ONLY a valid JSON array, no markdown, no explanation, no code fences.
- Process every word in the input list.
- Keep entries concise and accurate.
- "source_translation" must be ONE clean word in ${sourceLanguage} — no slashes, no alternatives, no parenthetical notes. Match the specific meaning of this card.
- "context" must be written in ${contextLanguage === 'cloze' || contextLanguage === 'target' ? targetLanguage : sourceLanguage}, very brief (2-5 words), disambiguates THIS specific meaning. For homographs this is essential. Leave "" if the word is unambiguous.
- CRITICAL FOR HOMOGRAPHS: When a word has multiple meanings, every field in each card object MUST correspond to the specific meaning indicated by "_sense" for that card. Do not mix fields from different meanings. For example, if generating cards for a word that means both "pear" (fruit) and "stomach" (body part), the card for "pear" must have Japanese/Chinese/etc. translations for "pear" only, and the card for "stomach" must have those translations for "stomach" only. Never cross-contaminate fields between different senses.
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

    // vocab is { vocab: string[], targetLanguage: string, sourceLanguage?: string, contextLanguage?: string }
    if (!vocab?.vocab || !blueprint) return error('vocab and blueprint required')

    const vocabArray      = vocab.vocab
    const targetLanguage  = vocab.targetLanguage  || 'Korean'
    const sourceLanguage  = vocab.sourceLanguage  || 'English'
    const contextLanguage = vocab.contextLanguage || 'target' // 'target' | 'source'

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return error('Gemini API key not configured', 500)

    const prompt = buildPrompt(targetLanguage, sourceLanguage, contextLanguage, blueprint, vocabArray)

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

