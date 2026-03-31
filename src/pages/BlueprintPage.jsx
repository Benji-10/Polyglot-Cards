import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/shared/Toast'
import Papa from 'papaparse'

const FIELD_TYPE_OPTIONS = [
  { value: 'text',    label: 'Text' },
  { value: 'example', label: 'Example (cloze)' },
]

const SUGGESTED_FIELDS = [
  { key: 'reading',    label: 'Reading / Phonetic',   description: 'The pronunciation guide (romanisation, furigana, pinyin, etc.)',            field_type: 'text',    show_on_front: true  },
  { key: 'japanese',   label: 'Japanese',              description: 'The Japanese equivalent or translation of the target word',                  field_type: 'text',    show_on_front: false },
  { key: 'chinese',    label: 'Chinese (Simplified)',  description: 'The Chinese Simplified equivalent or translation',                           field_type: 'text',    show_on_front: false },
  { key: 'hanja',      label: 'Hanja',                 description: 'The Hanja (Chinese characters used in Korean) form of the word',             field_type: 'text',    show_on_front: false },
  { key: 'example',   label: 'Example Sentence',       description: 'A natural sentence using the target word. Wrap ONLY the target word with {{word}}.', field_type: 'example', show_on_front: false },
  { key: 'definition', label: 'Definition',            description: 'A brief English definition or explanation',                                  field_type: 'text',    show_on_front: false },
  { key: 'notes',      label: 'Notes',                 description: 'Grammar notes, register, or usage tips',                                    field_type: 'text',    show_on_front: false },
]

const BATCH_SIZE = 10

export default function BlueprintPage() {
  const { deckId } = useParams()
  const qc = useQueryClient()
  const toast = useToast()

  const [fields, setFields] = useState(null)
  const [importState, setImportState] = useState('idle') // idle | generating | done | error
  const [importError, setImportError] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [totalImported, setTotalImported] = useState(0)

  // Refs for animation — avoids stale closures entirely
  const rafRef = useRef(null)
  const progressRef = useRef(0) // actual current display value

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

  // Initialise local fields from server data — only once
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

  const batchSaveMutation = useMutation({
    mutationFn: (cards) => api.batchCreateCards(cards),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards', deckId] }),
    onError: (e) => toast.error(`Save error: ${e.message}`),
  })

  // ── Field management ────────────────────────────────────
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

  // ── Progress animation ──────────────────────────────────
  // Smoothly animate from current value to target over `duration` ms.
  // Uses a ref for current value so it's never stale across batches.
  const animateTo = (target, duration = 800) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const from = progressRef.current
    const start = performance.now()

    const step = (now) => {
      const t = Math.min((now - start) / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const value = from + (target - from) * eased
      progressRef.current = value
      setProgressPercent(value)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }

  // ── CSV Import ──────────────────────────────────────────
  // handleCSV uses a ref for fields so it never becomes stale in the closure
  const fieldsRef = useRef(fields)
  useEffect(() => { fieldsRef.current = fields }, [fields])
  const deckRef = useRef(deck)
  useEffect(() => { deckRef.current = deck }, [deck])

  const handleCSV = useCallback((file) => {
    setImportState('generating')
    setImportError(null)
    setTotalImported(0)
    progressRef.current = 0
    setProgressPercent(0)

    Papa.parse(file, {
      complete: async (res) => {
        try {
          const vocab = res.data.flat().map(v => String(v).trim()).filter(Boolean)
          if (!vocab.length) {
            setImportError('No words found in CSV')
            setImportState('error')
            return
          }

          // Split into batches
          const batches = []
          for (let i = 0; i < vocab.length; i += BATCH_SIZE) {
            batches.push(vocab.slice(i, i + BATCH_SIZE))
          }

          setProgressMsg(`0 / ${batches.length} batches`)
          let imported = 0

          for (let i = 0; i < batches.length; i++) {
            const batch = batches[i]
            setProgressMsg(`Batch ${i + 1} / ${batches.length} — asking Gemini...`)

            const genRes = await api.generateCards(
              deckId,
              { vocab: batch, targetLanguage: deckRef.current?.target_language || 'Korean' },
              fieldsRef.current || []
            )

            if (!genRes?.cards?.length) {
              toast.error(`Batch ${i + 1} returned no cards — check your Gemini API key`)
              continue
            }

            // Save this batch immediately
            const toSave = genRes.cards
              .filter(c => !c._error)
              .map(c => ({ deck_id: deckId, word: c.word, fields: c }))

            if (toSave.length) {
              await batchSaveMutation.mutateAsync(toSave)
              imported += toSave.length
              setTotalImported(imported)
            }

            // Animate progress to proportion of batches done
            const targetPct = ((i + 1) / batches.length) * 100
            animateTo(targetPct, 600)
            setProgressMsg(`Batch ${i + 1} / ${batches.length} done — ${imported} cards saved`)
          }

          // Snap to 100 at the end
          animateTo(100, 300)
          setImportState('done')
        } catch (e) {
          setImportError(e.message)
          setImportState('error')
        }
      },
      error: (e) => {
        setImportError(e.message)
        setImportState('error')
      },
    })
  }, [deckId]) // eslint-disable-line — uses refs for fields/deck to avoid stale closures

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleCSV(file)
  }, [handleCSV])

  // ── Render ──────────────────────────────────────────────
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

      {/* ── Blueprint fields ───────────────────────────── */}
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

        {unusedSuggestions.length > 0 && (
          <div className="mb-5">
            <div className="section-title mb-2">Quick add</div>
            <div className="flex flex-wrap gap-2">
              {unusedSuggestions.map(s => (
                <button
                  key={s.key}
                  className="tag cursor-pointer transition-all hover:border-purple-500"
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

      {/* ── CSV Import ─────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
          Import Vocabulary
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          CSV with one word per cell. The frontend calls Gemini once per batch of {BATCH_SIZE} so no request times out.
          Save your blueprint first.
        </p>

        {importState === 'idle' || importState === 'error' ? (
          <label
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors hover:border-purple-500"
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
              {totalImported} card{totalImported !== 1 ? 's' : ''} added to your deck.
            </div>
            <button
              className="btn-secondary mt-4 text-xs"
              onClick={() => { setImportState('idle'); setTotalImported(0); progressRef.current = 0; setProgressPercent(0) }}
            >
              Import more
            </button>
          </div>

        ) : (
          /* generating state */
          <div className="card p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>✨</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                  {progressMsg || 'Generating...'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {totalImported > 0 ? `${totalImported} cards saved so far` : 'Starting...'}
                </div>
              </div>
              <div className="text-sm font-mono tabular-nums" style={{ color: 'var(--accent-primary)' }}>
                {Math.round(progressPercent)}%
              </div>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
              Each batch is a separate request — large lists will take a few minutes
            </div>
          </div>
        )}
      </section>

      {/* ── Manual add ────────────────────────────────── */}
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

// ── FieldRow ────────────────────────────────────────────
function FieldRow({ field, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <div className="card p-4 rounded-xl">
      <div className="flex items-start gap-3">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
          <button disabled={isFirst}  className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveUp}>▲</button>
          <button disabled={isLast}   className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveDown}>▼</button>
        </div>

        {/* Config */}
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
            placeholder={`AI hint — e.g. "The Japanese reading of the ${field.label || 'target'} word"`}
          />

          {field.field_type === 'example' && (
            <div className="text-xs px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(0,212,168,.08)', color: 'var(--accent-secondary)', border: '1px solid rgba(0,212,168,.2)' }}>
              ✦ Cloze enabled — Gemini will wrap the target word with {'{{word}}'}
            </div>
          )}
        </div>

        <button
          className="btn-ghost p-1.5 text-xs flex-shrink-0"
          style={{ color: 'var(--accent-danger)' }}
          onClick={onRemove}
        >✕</button>
      </div>
    </div>
  )
}

// ── ManualCardForm ──────────────────────────────────────
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
              placeholder="e.g. 나는 {{사랑}}해."
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
