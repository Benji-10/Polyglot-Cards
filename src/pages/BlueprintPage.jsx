import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/shared/Toast'
import Papa from 'papaparse'

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'example', label: 'Example (cloze)' },
]

const SUGGESTED_FIELDS = [
  { key: 'reading', label: 'Reading / Phonetic', description: 'The pronunciation guide (romanisation, furigana, pinyin, etc.)', field_type: 'text', show_on_front: true },
  { key: 'japanese', label: 'Japanese', description: 'The Japanese equivalent or translation of the target word', field_type: 'text', show_on_front: false },
  { key: 'chinese', label: 'Chinese (Simplified)', description: 'The Chinese Simplified equivalent or translation', field_type: 'text', show_on_front: false },
  { key: 'hanja', label: 'Hanja', description: 'The Hanja (Chinese characters used in Korean) form of the word', field_type: 'text', show_on_front: false },
  { key: 'example', label: 'Example Sentence', description: 'A natural sentence using the target word. Wrap ONLY the target word with {{word}}.', field_type: 'example', show_on_front: false },
  { key: 'definition', label: 'Definition', description: 'A brief English definition or explanation', field_type: 'text', show_on_front: false },
  { key: 'notes', label: 'Notes', description: 'Grammar notes, register, or usage tips', field_type: 'text', show_on_front: false },
]

export default function BlueprintPage() {
  const { deckId } = useParams()
  const qc = useQueryClient()
  const toast = useToast()

  // Local fields state — initialised from query data
  const [fields, setFields] = useState(null)
  const [importState, setImportState] = useState('idle')
  const [importError, setImportError] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [importedCards, setImportedCards] = useState([]) // track batch results

  const { data: deck } = useQuery({
    queryKey: ['decks'],
    queryFn: api.getDecks,
    select: (decks) => decks.find(d => d.id === deckId),
  })

  const { data: blueprintData, isLoading: blueprintLoading } = useQuery({
    queryKey: ['blueprint', deckId],
    queryFn: () => api.getBlueprintFields(deckId),
    enabled: !!deckId,
  })

  useEffect(() => {
    if (blueprintData !== undefined && fields === null) {
      setFields(blueprintData ?? [])
    }
  }, [blueprintData]) // eslint-disable-line

  const saveMutation = useMutation({
    mutationFn: (f) => api.saveBlueprintFields(deckId, f),
    onSuccess: (saved) => {
      setFields(saved)
      qc.setQueryData(['blueprint', deckId], saved)
      toast.success('Blueprint saved!')
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  })

  const batchMutation = useMutation({
    mutationFn: (cards) => api.batchCreateCards(cards),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards', deckId] })
    },
    onError: (e) => { setImportError(e.message); setImportState('error') },
  })

  // ── Field management ──────────────────────────────────────
  const addField = (suggested) => {
    const base = suggested
      ? { ...suggested }
      : { key: `field_${Date.now()}`, label: 'New Field', description: '', field_type: 'text', show_on_front: false }
    setFields(prev => [...prev, { ...base, position: prev.length }])
  }

  const updateField = (idx, patch) =>
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))

  const removeField = (idx) =>
    setFields(prev => prev.filter((_, i) => i !== idx))

  const moveField = (idx, dir) => {
    setFields(prev => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
        ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const [progressPercent, setProgressPercent] = useState(0)
  const [batchTimes, setBatchTimes] = useState([]) // store durations in ms
  // const progressRef = useRef(null)

  // ── CSV Import ────────────────────────────────────────────
  const handleCSV = useCallback((file) => {
    setImportState('parsing')
    setImportError(null)
    setImportedCards([])
    setProgressPercent(0)
    setBatchTimes([])

    Papa.parse(file, {
      complete: async (res) => {
        try {
          const vocab = res.data.flat().map(v => String(v).trim()).filter(Boolean)
          if (!vocab.length) {
            setImportError('No words found in CSV')
            setImportState('error')
            return
          }

          setImportState('generating')
          setProgressMsg(`Preparing ${vocab.length} words...`)

          const BATCH_SIZE = 10
          const batches = []
          for (let i = 0; i < vocab.length; i += BATCH_SIZE) {
            batches.push(vocab.slice(i, i + BATCH_SIZE))
          }

          const totalBatches = batches.length
          let allCards = []

          for (let i = 0; i < totalBatches; i++) {
            const batch = batches[i]
            setProgressMsg(`Sending batch ${i + 1}/${totalBatches} to Gemini...`)

            const start = performance.now()
            const genRes = await api.generateCards(
              deckId,
              { vocab: batch, targetLanguage: deck?.target_language || 'Korean' },
              fields || []
            )
            const end = performance.now()
            const duration = end - start

            setBatchTimes(prev => [...prev, duration])

            if (!genRes?.cards?.length) {
              setImportError(`Gemini returned no cards for batch ${i + 1}. Check your API key.`)
              setImportState('error')
              return
            }

            allCards.push(...genRes.cards)
            setImportedCards(prev => [...prev, ...genRes.cards])

            // smooth interpolation
            const targetPercent = Math.round(((i + 1) / totalBatches) * 100)
            const avgTime = batchTimes.length ? batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length : duration
            animateProgress(progressPercent, targetPercent, avgTime)

            // optional: save each batch immediately
            const cardsToSave = genRes.cards.map(c => ({
              deck_id: deckId,
              word: c.word,
              fields: c,
            }))
            await batchMutation.mutateAsync(cardsToSave)
          }

          setProgressPercent(100)
          setProgressMsg(`All batches processed. Total ${allCards.length} cards.`)
          setImportState('done')
        } catch (e) {
          setImportError(e.message)
          setImportState('error')
        }
      },
      error: (e) => { setImportError(e.message); setImportState('error') },
    })
  }, [deckId, deck, fields, batchTimes, progressPercent]) // eslint-disable-line

  // ── smooth progress animation ─────────────────────────
  function animateProgress(fromPercent, toPercent, durationMs) {
    const start = performance.now()
    function step(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / durationMs, 1)
      const current = fromPercent + (toPercent - fromPercent) * progress
      setProgressPercent(current)
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleCSV(file)
  }, [handleCSV])

  // ── Render ────────────────────────────────────────────────
  if (blueprintLoading || fields === null) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="section-title mb-1">Blueprint & Import</div>
        <div className="font-display text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>
          {deck?.name || '...'}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}
        </div>
      </div>
    )
  }

  const unusedSuggestions = SUGGESTED_FIELDS.filter(s => !fields.find(f => f.key === s.key))

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="section-title mb-1">Blueprint & Import</div>
        <h1 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {deck?.name || 'Deck'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Define the fields Gemini will fill in for each card, then import your vocabulary list.
        </p>
      </div>

      {/* ── Blueprint fields ─────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
            Card Fields
          </h2>
          <button className="btn-primary text-xs py-1.5 px-3" onClick={() => addField()}>
            + Add Field
          </button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-10 card rounded-2xl mb-4">
            <div className="text-3xl mb-3">🗺</div>
            <div className="font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No fields yet</div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Add fields manually or click a suggestion below
            </div>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {fields.map((field, idx) => (
              <FieldRow
                key={`${field.key}-${idx}`}
                field={field}
                onUpdate={(p) => updateField(idx, p)}
                onRemove={() => removeField(idx)}
                onMoveUp={() => moveField(idx, -1)}
                onMoveDown={() => moveField(idx, 1)}
                isFirst={idx === 0}
                isLast={idx === fields.length - 1}
              />
            ))}
          </div>
        )}

        {/* Suggestions */}
        {unusedSuggestions.length > 0 && (
          <div className="mb-5">
            <div className="section-title mb-2">Quick add</div>
            <div className="flex flex-wrap gap-2">
              {unusedSuggestions.map(s => (
                <button
                  key={s.key}
                  className="tag cursor-pointer transition-colors"
                  style={{ ':hover': { borderColor: 'var(--accent-primary)' } }}
                  onClick={() => addField(s)}
                >
                  + {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(fields)}
          >
            {saveMutation.isPending ? 'Saving...' : '✓ Save Blueprint'}
          </button>
          {saveMutation.isSuccess && (
            <span className="text-sm" style={{ color: 'var(--accent-secondary)' }}>Saved!</span>
          )}
        </div>
      </section>

      {/* ── CSV Import ───────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
          Import Vocabulary
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          CSV with one word per cell. Gemini will fill in all blueprint fields in batches of 10.
          Make sure you have saved your blueprint first.
        </p>

        {importState === 'idle' || importState === 'error' ? (
          <label
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            <span className="text-4xl">📄</span>
            <div className="text-center">
              <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                Drop CSV here or click to browse
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                One word per cell — any column layout
              </div>
            </div>
            {importError && (
              <div className="text-xs px-3 py-2 rounded-lg w-full text-center"
                style={{ background: 'rgba(225,112,85,0.1)', color: 'var(--accent-danger)', border: '1px solid rgba(225,112,85,.2)' }}>
                ✕ {importError}
              </div>
            )}
            <input
              type="file" accept=".csv,.txt" className="hidden"
              onChange={e => e.target.files[0] && handleCSV(e.target.files[0])}
            />
          </label>
        ) : importState === 'done' ? (
          <div className="card p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Import complete!</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {importedCards.length} card{importedCards.length !== 1 ? 's' : ''} added to your deck.
            </div>
            <button
              className="btn-secondary mt-4 text-xs"
              onClick={() => { setImportState('idle'); setImportedCards([]) }}
            >
              Import more
            </button>
          </div>
        ) : (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-4" style={{ animation: 'pulse 2s infinite' }}>✨</div>
            <div className="font-medium mb-3" style={{ color: 'var(--text-primary)' }}>{progressMsg}</div>
            <div className="progress-bar w-48 mx-auto">
              <div className="progress-fill" style={{ width: `${progressPercent}%`, transition: 'width 0.1s linear' }} />
            </div>
            <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>This may take a minute for large lists</div>
          </div>
        )}
      </section>

      {/* ── Manual add ──────────────────────────────────── */}
      <section>
        <h2 className="font-display font-semibold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>
          Add Card Manually
        </h2>
        <ManualCardForm
          deckId={deckId}
          fields={fields}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cards', deckId] })
            toast.success('Card added!')
          }}
        />
      </section>
    </div>
  )
}

// ── FieldRow ──────────────────────────────────────────────
function FieldRow({ field, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card p-4 rounded-xl">
      <div className="flex items-center gap-3">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            disabled={isFirst}
            className="btn-ghost p-0.5 text-xs disabled:opacity-20"
            onClick={onMoveUp}
          >▲</button>
          <button
            disabled={isLast}
            className="btn-ghost p-0.5 text-xs disabled:opacity-20"
            onClick={onMoveDown}
          >▼</button>
        </div>

        {/* Field config */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="input text-sm py-1.5 w-36"
              value={field.label}
              onChange={e => onUpdate({ label: e.target.value })}
              placeholder="Label"
            />
            <input
              className="input text-sm py-1.5 w-28 font-mono"
              value={field.key}
              onChange={e => onUpdate({ key: e.target.value.replace(/\s/g, '_').toLowerCase() })}
              placeholder="key"
            />
            <select
              className="input text-xs py-1.5 w-36"
              value={field.field_type}
              onChange={e => onUpdate({ field_type: e.target.value })}
            >
              {FIELD_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer flex-shrink-0"
              style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={!!field.show_on_front}
                onChange={e => onUpdate({ show_on_front: e.target.checked })}
              />
              Show on front
            </label>
          </div>

          <input
            className="input text-xs py-1.5 w-full"
            value={field.description || ''}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder={`Describe this field for the AI — e.g. "The Japanese translation of the ${field.label || 'target'} word"`}
          />

          {field.field_type === 'example' && (
            <div className="text-xs px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(0,212,168,.08)', color: 'var(--accent-secondary)', border: '1px solid rgba(0,212,168,.2)' }}>
              ✦ Cloze: Gemini will wrap the target word with {'{{word}}'} — enabling fill-in-the-blank study
            </div>
          )}
        </div>

        <button
          className="btn-ghost p-1.5 text-xs flex-shrink-0"
          style={{ color: 'var(--accent-danger)' }}
          onClick={onRemove}
          title="Remove field"
        >✕</button>
      </div>
    </div>
  )
}

// ── ManualCardForm ────────────────────────────────────────
function ManualCardForm({ deckId, fields, onSaved }) {
  const [word, setWord] = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!word.trim()) return
    setSaving(true)
    try {
      await api.createCard({ deck_id: deckId, word: word.trim(), fields: fieldValues })
      setWord('')
      setFieldValues({})
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div>
        <label className="section-title block mb-1.5">Word / Vocab *</label>
        <input
          className="input"
          value={word}
          onChange={e => setWord(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="Enter the target language word"
          autoComplete="off"
        />
      </div>

      {fields.map(f => (
        <div key={f.key}>
          <label className="section-title block mb-1.5">
            {f.label}
            {f.field_type === 'example' && (
              <span className="ml-2 normal-case font-normal" style={{ color: 'var(--text-muted)' }}>
                — use {'{{word}}'} to mark the cloze target
              </span>
            )}
          </label>
          {f.field_type === 'example' ? (
            <textarea
              className="input text-sm resize-none"
              rows={2}
              value={fieldValues[f.key] || ''}
              onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
              placeholder={`e.g. 나는 {{사랑}}해. (wrap the target word with {{word}})`}
            />
          ) : (
            <input
              className="input text-sm"
              value={fieldValues[f.key] || ''}
              onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.description || f.label}
            />
          )}
        </div>
      ))}

      <button
        className="btn-primary"
        disabled={!word.trim() || saving}
        onClick={handleSave}
      >
        {saving ? 'Saving...' : saved ? '✓ Added!' : 'Add Card'}
      </button>
    </div>
  )
}
