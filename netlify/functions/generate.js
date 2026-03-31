import { requireUser, json, error, handleCors } from './_db.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function buildPrompt(targetLanguage, blueprint, vocabBatch) {
  const fieldDescriptions = blueprint.map(f => {
    let desc = `  - "${f.key}": ${f.description || f.label}`
    if (f.field_type === 'example') {
      desc += `\n    IMPORTANT: Wrap ONLY the exact target vocabulary word with {{word}}. Do NOT wrap anything else. Only the single most relevant occurrence.`
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
- For example sentence fields, {{word}} must wrap ONLY the target vocabulary item itself.
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

