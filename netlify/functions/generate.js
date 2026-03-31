import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent'

function buildPrompt(targetLanguage, blueprint, vocabBatch) {
  const fieldLines = blueprint.map(f => {
    const lines = [`  - "${f.key}": ${f.description || f.label}`]

    if (f.field_type === 'example') {
      lines.push(`    IMPORTANT: Wrap ONLY the exact target vocabulary word with {{word}}. One occurrence only.`)
    }

    phonetics = phonetics
      .replace(/^{/, '[')    // Replace the starting curly brace with a square bracket
      .replace(/}$/, ']')    // Replace the ending curly brace with a square bracket
      .replace(/, /g, ',')   // Ensure there's no space after commas if there's one

    // Now parse it as a JSON array
    phonetics = JSON.parse(phonetics)

    // Add phonetic sub-keys for this field
    const phonetics = f.phonetics || []
    if (phonetics.length > 0) {
      const PHONETIC_DESCRIPTIONS = {
        furigana:     `"${f.key}_furigana": hiragana/katakana reading above each kanji character, formatted as space-separated pairs "kanji:reading" e.g. "日本語:にほんご"`,
        romaji:       `"${f.key}_romaji": Hepburn romanisation of the Japanese`,
        pinyin:       `"${f.key}_pinyin": Pīnyīn with tone marks for every syllable`,
        bopomofo:     `"${f.key}_bopomofo": Zhùyīn Fúhào (ㄅㄆㄇ) phonetic symbols`,
        jyutping:     `"${f.key}_jyutping": Jyutping romanisation for Cantonese`,
        romanisation: `"${f.key}_romanisation": standard Latin-script transliteration`,
        diacritics:   `"${f.key}_diacritics": full vowel-marked / tashkeel version of the text`,
        ipa:          `"${f.key}_ipa": IPA pronunciation string e.g. /niː.hɑːŋ.ɡoʊ/`,
        english:      `"${f.key}_english": concise English gloss or translation`,
      }
      phonetics.forEach(pk => {
        if (PHONETIC_DESCRIPTIONS[pk]) lines.push(`  - ${PHONETIC_DESCRIPTIONS[pk]}`)
      })
    }

    return lines.join('\n')
  }).join('\n')

  // Collect all expected keys for the example output
  const exampleKeys = ['word']
  blueprint.forEach(f => {
    exampleKeys.push(f.key)
    ;(f.phonetics || []).forEach(pk => exampleKeys.push(`${f.key}_${pk}`))
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

