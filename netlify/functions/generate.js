import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function buildPrompt(targetLanguage, blueprint, vocabBatch) {
  // Identify example field (for cloze)
  const exampleField = blueprint.find(f => f.field_type === 'example')

  const fieldDescriptions = blueprint.map(f => {
    let desc = `  - "${f.key}": ${f.description}`
    if (f.field_type === 'example') {
      desc += `\n    IMPORTANT: In this field, wrap ONLY the exact target vocabulary word (or its direct form) with double curly braces like {{word}}. Do NOT wrap anything else. Wrap only the single most relevant occurrence.`
    }
    return desc
  }).join('\n')

  return `You are a language learning assistant generating flashcard data.

Target language: ${targetLanguage}
Vocabulary items to process: ${JSON.stringify(vocabBatch)}

For each vocabulary item, generate a JSON object with these fields:
  - "word": the vocabulary item exactly as given
${fieldDescriptions}

Rules:
- Return ONLY a valid JSON array, no markdown, no explanation, no code fences.
- Process every word in the input list.
- Keep entries concise and accurate.
- For the example sentence field, the {{word}} marker must wrap ONLY the target vocabulary item itself, no other words.
- If you cannot generate a field, use an empty string "".

Example output format:
[
  {
    "word": "사랑",
    ${blueprint.map(f => `"${f.key}": "..."`).join(',\n    ')}
  }
]

Now generate for: ${JSON.stringify(vocabBatch)}`
}

export const handler = async (event) => {
  const cors = handleCors(event)
  if (cors) return cors
  try {
    const userId = requireUser(event)
    if (event.httpMethod !== 'POST') return error('Method not allowed', 405)

    const { vocab, blueprint } = JSON.parse(event.body)
    if (!vocab?.vocab || !blueprint) return error('vocab and blueprint required')

    const vocabArray = vocab.vocab
    const targetLanguage = vocab.targetLanguage || 'Korean'

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return error('Gemini API key not configured', 500)

    // Process in batches of 10
    const BATCH_SIZE = 10
    const results = []

    for (let i = 0; i < vocabArray.length; i += BATCH_SIZE) {
      const batch = vocabArray.slice(i, i + BATCH_SIZE)
      const prompt = buildPrompt(targetLanguage || 'Korean', blueprint, batch)

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
      console.log('Gemini raw output:', text)

      if (!text) {
        console.error('No text from Gemini:', JSON.stringify(geminiData))
        continue
      }

      try {
        const cleaned = text.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) results.push(...parsed)
      } catch (parseErr) {
        console.error('Failed to parse Gemini output:', text)
        // Return partial results with error flag
        for (const word of batch) {
          results.push({ word, _error: true })
        }
      }
    }

    return json({ cards: results })
  } catch (e) {
    if (e.message === 'Unauthorized') return error('Unauthorized', 401)
    console.error(e)
    return error(e.message, 500)
  }
}
