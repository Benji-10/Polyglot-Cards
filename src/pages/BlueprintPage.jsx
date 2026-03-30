import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import Papa from 'papaparse'

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text', desc: 'Regular text field' },
  { value: 'example', label: 'Example', desc: 'Sentence with cloze support — AI will mark the target word with {{word}}' },
]

const SUGGESTED_FIELDS = [
  { key: 'reading', label: 'Reading / Phonetic', description: 'The pronunciation guide for the word (e.g. romanisation, furigana, pinyin)', field_type: 'text' },
  { key: 'japanese', label: 'Japanese', description: 'The Japanese equivalent or translation of the target word', field_type: 'text' },
  { key: 'chinese', label: 'Chinese (Simplified)', description: 'The Chinese (Simplified) equivalent or translation', field_type: 'text' },
  { key: 'hanja', label: 'Hanja', description: 'The Hanja (Chinese characters used in Korean) form of the word', field_type: 'text' },
  { key: 'example', label: 'Example Sentence', description: 'A natural example sentence using the target word in context', field_type: 'example' },
  { key: 'definition', label: 'Definition', description: 'A brief definition or explanation of the word in English', field_type: 'text' },
  { key: 'notes', label: 'Notes', description: 'Additional grammar notes, register, or usage information', field_type: 'text' },
]

export default function BlueprintPage() {
  const { deckId } = useParams()
  const qc = useQueryClient()
  const [fields, setFields] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [importState, setImportState] = useState('idle') // idle|parsing|generating|done|error
  const [importResults, setImportResults] = useState(null)
  const [importError, setImportError] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [manualCard, setManualCard] = useState(null)

  const { data: deck } = useQuery({ queryKey: ['deck', deckId], queryFn: () => api.getDecks().then(d => d.find(x => x.id === deckId)) })

  useQuery({
    queryKey: ['blueprint', deckId],
    queryFn: () => api.getBlueprintFields(deckId),
    onSuccess: (data) => { if (!fields) setFields(data.length ? data : []) },
  })

  const saveMutation = useMutation({
    mutationFn: (f) => api.saveBlueprintFields(deckId, f),
    onSuccess: (data) => { setFields(data); qc.invalidateQueries(['blueprint', deckId]) },
  })

  const batchMutation = useMutation({
    mutationFn: (cards) => api.batchCreateCards(cards),
    onSuccess: (res) => {
      setImportResults(res)
      setImportState('done')
      qc.invalidateQueries(['cards', deckId])
    },
    onError: (e) => { setImportError(e.message); setImportState('error') },
  })

  const addField = (suggested) => {
    const base = suggested || { key: `field_${Date.now()}`, label: 'New Field', description: '', field_type: 'text', show_on_front: false }
    setFields(prev => [...(prev || []), { ...base, position: (prev || []).length }])
  }

  const updateField = (idx, patch) => setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  const removeField = (idx) => setFields(prev => prev.filter((_, i) => i !== idx))
  const moveField = (idx, dir) => {
    setFields(prev => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const handleCSV = useCallback((file) => {
    setImportState('parsing')
    setImportError(null)
    Papa.parse(file, {
      complete: async (res) => {
        try {
          const vocab = res.data.flat().map(v => String(v).trim()).filter(Boolean)
          if (!vocab.length) { setImportError('No words found in CSV'); setImportState('error'); return }

          setImportState('generating')
          setProgressMsg(`Generating ${vocab.length} cards with Gemini...`)

          const genRes = await api.generateCards(deckId, { vocab, targetLanguage: deck?.target_language || 'Korean' }, fields || [])
          const cards = genRes.cards.map(c => ({ deck_id: deckId, word: c.word, fields: c }))

          setProgressMsg(`Saving ${cards.length} cards...`)
          await batchMutation.mutateAsync(cards)
        } catch (e) {
          setImportError(e.message)
          setImportState('error')
        }
      },
      error: (e) => { setImportError(e.message); setImportState('error') },
    })
  }, [deckId, deck, fields])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleCSV(file)
  }, [handleCSV])

  if (!fields) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading blueprint...</div>

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <div className="section-title mb-1">Blueprint & Import</div>
        <h1 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {deck?.name || 'Deck'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Define the fields that Gemini will fill in for each card, then import your vocabulary.
        </p>
      </div>

      {/* Blueprint fields */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Card Fields</h2>
          <button className="btn-primary text-xs py-1.5 px-3" onClick={() => addField()}>+ Add Field</button>
        </div>

        {fields.length === 0 && (
          <div className="text-center py-8 card rounded-2xl">
            <div className="text-3xl mb-3">🗺</div>
            <div className="font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No fields defined yet</div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Add fields below or pick from suggestions</div>
          </div>
        )}

        <div className="space-y-3">
          {fields.map((field, idx) => (
            <FieldRow key={idx} field={field} idx={idx}
              onUpdate={(p) => updateField(idx, p)}
              onRemove={() => removeField(idx)}
              onMoveUp={() => moveField(idx, -1)}
              onMoveDown={() => moveField(idx, 1)}
              isFirst={idx === 0} isLast={idx === fields.length - 1}
            />
          ))}
        </div>

        {/* Suggestions */}
        <div className="mt-5">
          <div className="section-title mb-2">Suggestions</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_FIELDS.filter(s => !fields.find(f => f.key === s.key)).map(s => (
              <button key={s.key} className="tag cursor-pointer hover:border-purple-500 transition-colors" onClick={() => addField(s)}>
                + {s.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary mt-5" disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(fields)}>
          {saveMutation.isPending ? 'Saving...' : '✓ Save Blueprint'}
        </button>
        {saveMutation.isSuccess && <span className="ml-3 text-sm" style={{ color: 'var(--accent-secondary)' }}>Saved!</span>}
      </section>

      {/* CSV Import */}
      <section className="mb-10">
        <h2 className="font-display font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Import Vocabulary</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Upload a CSV with one vocabulary word per cell (single column or multiple). Gemini will generate all blueprint fields automatically in batches of 10.
        </p>

        {importState === 'idle' || importState === 'error' ? (
          <label
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors hover:border-purple-500"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
            <span className="text-4xl">📄</span>
            <div className="text-center">
              <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Drop CSV here or click to browse</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>One word per cell — any column layout</div>
            </div>
            {importError && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(225,112,85,0.1)', color: 'var(--accent-danger)' }}>{importError}</div>}
            <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files[0] && handleCSV(e.target.files[0])} />
          </label>
        ) : importState === 'done' ? (
          <div className="card p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Import complete!</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{importResults?.inserted} cards added to your deck.</div>
            <button className="btn-secondary mt-4 text-xs" onClick={() => { setImportState('idle'); setImportResults(null) }}>Import More</button>
          </div>
        ) : (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-4 animate-pulse-soft">✨</div>
            <div className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{progressMsg}</div>
            <div className="progress-bar w-48 mx-auto">
              <div className="progress-fill" style={{ width: importState === 'parsing' ? '20%' : '65%' }} />
            </div>
          </div>
        )}
      </section>

      {/* Manual card add */}
      <section>
        <h2 className="font-display font-semibold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>Add Card Manually</h2>
        <ManualCardForm deckId={deckId} fields={fields}
          onSaved={() => qc.invalidateQueries(['cards', deckId])} />
      </section>
    </div>
  )
}

function FieldRow({ field, idx, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="card p-4 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <button disabled={isFirst} className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveUp}>▲</button>
          <button disabled={isLast} className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveDown}>▼</button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <input className="input text-sm py-1.5 w-32" value={field.label}
              onChange={e => onUpdate({ label: e.target.value })} placeholder="Label" />
            <input className="input text-sm py-1.5 w-28 font-mono" value={field.key}
              onChange={e => onUpdate({ key: e.target.value.replace(/\s/g,'_').toLowerCase() })} placeholder="key" />
            <select className="input text-xs py-1.5 w-28" value={field.field_type}
              onChange={e => onUpdate({ field_type: e.target.value })}>
              {FIELD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={field.show_on_front} onChange={e => onUpdate({ show_on_front: e.target.checked })} />
              Show on front
            </label>
          </div>
          {expanded && (
            <div className="mt-2">
              <input className="input text-xs py-1.5" value={field.description}
                onChange={e => onUpdate({ description: e.target.value })}
                placeholder="Describe this field for the AI (e.g. 'The Japanese translation of the Korean word')" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button className="btn-ghost p-1.5 text-xs" onClick={() => setExpanded(e => !e)}>
            {expanded ? '▴' : '▾'} AI Hint
          </button>
          <button className="btn-ghost p-1.5 text-xs" style={{ color: 'var(--accent-danger)' }} onClick={onRemove}>✕</button>
        </div>
      </div>
    </div>
  )
}

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
        <label className="section-title block mb-1.5">Word / Vocab</label>
        <input className="input" value={word} onChange={e => setWord(e.target.value)} placeholder="Enter the target language word" />
      </div>
      {fields.map(f => (
        <div key={f.key}>
          <label className="section-title block mb-1.5">{f.label}</label>
          <input className="input" value={fieldValues[f.key] || ''}
            onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.description || f.label} />
        </div>
      ))}
      <button className="btn-primary" disabled={!word.trim() || saving} onClick={handleSave}>
        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Add Card'}
      </button>
    </div>
  )
}
