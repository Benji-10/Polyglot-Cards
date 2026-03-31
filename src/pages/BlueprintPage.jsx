import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/shared/Toast'
import { useAppStore } from '../store/appStore'
import Papa from 'papaparse'

const BATCH_SIZE = 25
const INITIAL_ESTIMATE_MS = 11800

const FIELD_TYPE_OPTIONS = [
  { value: 'text',    label: 'Text' },
  { value: 'example', label: 'Example (cloze)' },
]

// Ruby options — mutually exclusive, shown in a dropdown
export const RUBY_OPTIONS = [
  { key: 'none',                   label: 'None' },
  { key: 'furigana',               label: 'Furigana (hiragana above kanji)',         hint: 'Japanese' },
  { key: 'romaji',                 label: 'Rōmaji (Latin romanisation)',              hint: 'Japanese' },
  { key: 'pinyin',                 label: 'Pīnyīn (tonal romanisation)',              hint: 'Mandarin' },
  { key: 'bopomofo',               label: 'Bopomofo / Zhùyīn (ㄅㄆㄇ)',              hint: 'Mandarin' },
  { key: 'jyutping',               label: 'Jyutping',                                hint: 'Cantonese' },
  { key: 'hangulRomanisation',     label: 'Romanisation (Revised Romanisation)',      hint: 'Korean' },
  { key: 'romanisation',           label: 'Transliteration (Latin script)',           hint: 'Arabic / Farsi / Russian / etc.' },
  { key: 'cyrillicTranslit',       label: 'Cyrillic Transliteration',                hint: 'Russian / Ukrainian' },
  { key: 'cantoneseRomanisation',  label: 'Yale / Cantonese Romanisation',           hint: 'Cantonese alt.' },
  { key: 'tones',                  label: 'Tone marks / numbered tones',             hint: 'Mandarin / Thai / Vietnamese' },
]

// Extra annotations — can be combined, shown as checkboxes
export const EXTRA_OPTIONS = [
  { key: 'diacritics',      label: 'Vowel marks / diacritics',   hint: 'Tashkeel for Arabic, Harakat for Farsi, nikud for Hebrew, etc.' },
  { key: 'ipa',             label: 'IPA',                         hint: 'International Phonetic Alphabet — shown as /…/' },
  { key: 'english',         label: 'English gloss',               hint: 'Translation shown below the word' },
]

// ── usePredictiveProgress ──────────────────────────────────
function usePredictiveProgress() {
  const rafRef      = useRef(null)
  const displayRef  = useRef(0)
  const [display, setDisplay] = useState(0)
  const batchTimesRef  = useRef([])
  const batchStartRef  = useRef(null)
  const totalRef       = useRef(1)
  const ceilingRef     = useRef(0)

  const animateTo = useCallback((target, durationMs) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const safeTarget = Math.min(Math.max(target, 0), 100)
    const from = displayRef.current
    if (from >= safeTarget) return
    const t0 = performance.now()
    const step = (now) => {
      const elapsed = now - t0
      const p = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const value = Math.min(from + (safeTarget - from) * eased, safeTarget)
      displayRef.current = value
      setDisplay(value)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [])

  const reset = useCallback((totalBatches) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    totalRef.current      = Math.max(totalBatches, 1)
    displayRef.current    = 0
    batchTimesRef.current = []
    batchStartRef.current = null
    ceilingRef.current    = 0
    setDisplay(0)
  }, [])

  const startBatch = useCallback((batchIndex) => {
    batchStartRef.current = performance.now()
    const ceiling = ((batchIndex + 1) / totalRef.current) * 100
    ceilingRef.current = ceiling
    const times = batchTimesRef.current
    const estimate = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : INITIAL_ESTIMATE_MS
    animateTo(ceiling, estimate)
  }, [animateTo])

  const completeBatch = useCallback(() => {
    const elapsed = performance.now() - (batchStartRef.current ?? performance.now())
    batchTimesRef.current = [...batchTimesRef.current, elapsed]
    const ceiling = ceilingRef.current
    if (displayRef.current < ceiling) animateTo(ceiling, 250)
  }, [animateTo])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])
  return { percent: display, reset, startBatch, completeBatch }
}

// ── Main component ─────────────────────────────────────────
export default function BlueprintPage() {
  const { deckId } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const { settings } = useAppStore()

  const [fields, setFields] = useState(null)
  const [importState, setImportState] = useState('idle')
  const [importError, setImportError] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [totalImported, setTotalImported] = useState(0)

  const progress = usePredictiveProgress()

  const { data: deck } = useQuery({
    queryKey: ['decks'],
    queryFn: api.getDecks,
    select: d => d.find(x => x.id === deckId),
  })

  const { data: blueprintData, isLoading: blueprintLoading } = useQuery({
    queryKey: ['blueprint', deckId],
    queryFn: () => api.getBlueprintFields(deckId),
    enabled: !!deckId,
  })

  useEffect(() => {
    if (blueprintData !== undefined && fields === null) {
      setFields((blueprintData ?? []).map(f => ({
        ...f,
        // Normalise phonetics to new shape
        phonetics: normalisePhonetics(f.phonetics),
      })))
    }
  }, [blueprintData]) // eslint-disable-line

  const saveMutation = useMutation({
    mutationFn: f => api.saveBlueprintFields(deckId, f),
    onSuccess: saved => {
      setFields(saved.map(f => ({ ...f, phonetics: normalisePhonetics(f.phonetics) })))
      qc.setQueryData(['blueprint', deckId], saved)
      toast.success('Blueprint saved!')
    },
    onError: e => toast.error(`Save failed: ${e.message}`),
  })

  const batchSaveMutation = useMutation({
    mutationFn: cards => api.batchCreateCards(cards),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards', deckId] }),
    onError: e => toast.error(`Save error: ${e.message}`),
  })

  // ── Field management ────────────────────────────────────
  const addField = suggested => {
    const base = suggested
      ? { ...suggested, phonetics: normalisePhonetics(suggested.phonetics) }
      : { key: `field_${Date.now()}`, label: 'New Field', description: '', field_type: 'text', show_on_front: false, phonetics: { ruby: 'none', extras: [] } }
    setFields(prev => [...prev, { ...base, position: prev.length }])
  }

  const updateField = (idx, patch) => setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  const removeField = idx => setFields(prev => prev.filter((_, i) => i !== idx))
  const moveField = (idx, dir) => {
    setFields(prev => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const fieldsRef = useRef(fields)
  useEffect(() => { fieldsRef.current = fields }, [fields])
  const deckRef = useRef(deck)
  useEffect(() => { deckRef.current = deck }, [deck])

  // ── CSV Import ──────────────────────────────────────────
  const handleCSV = useCallback(file => {
    setImportState('generating')
    setImportError(null)
    setTotalImported(0)

    Papa.parse(file, {
      complete: async res => {
        try {
          const vocab = res.data.flat().map(v => String(v).trim()).filter(Boolean)
          if (!vocab.length) { setImportError('No words found in CSV'); setImportState('error'); return }

          const batches = []
          for (let i = 0; i < vocab.length; i += BATCH_SIZE) batches.push(vocab.slice(i, i + BATCH_SIZE))
          progress.reset(batches.length)
          setProgressMsg(`0 / ${batches.length} batches`)

          let imported = 0
          for (let i = 0; i < batches.length; i++) {
            setProgressMsg(`Batch ${i + 1} / ${batches.length}`)
            progress.startBatch(i)

            const genRes = await api.generateCards(
              deckId,
              { vocab: batches[i], targetLanguage: deckRef.current?.target_language || 'Korean' },
              fieldsRef.current || []
            )
            progress.completeBatch(i)

            if (!genRes?.cards?.length) { toast.error(`Batch ${i + 1} returned no cards`); continue }

            const toSave = genRes.cards.filter(c => !c._error).map(c => ({ deck_id: deckId, word: c.word, fields: c }))
            if (toSave.length) {
              await batchSaveMutation.mutateAsync(toSave)
              imported += toSave.length
              setTotalImported(imported)
            }
            setProgressMsg(`Batch ${i + 1} / ${batches.length} — ${imported} cards saved`)
          }

          setImportState('done')
        } catch (e) { setImportError(e.message); setImportState('error') }
      },
      error: e => { setImportError(e.message); setImportState('error') },
    })
  }, [deckId, progress]) // eslint-disable-line

  const handleDrop = useCallback(e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCSV(f) }, [handleCSV])

  if (blueprintLoading || fields === null) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="section-title mb-1">Blueprint & Import</div>
        <div className="font-display text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>{deck?.name || '...'}</div>
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}</div>
      </div>
    )
  }

  const usedKeys = new Set(fields.map(f => f.key))
  const quickAdd = (settings.quickAddFields || []).filter(s => !usedKeys.has(s.key))

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <div className="section-title mb-1">Blueprint & Import</div>
        <h1 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{deck?.name || 'Deck'}</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Define fields Gemini fills for each card, then import your vocab.</p>
      </div>

      {/* ── Fields ─────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Card Fields</h2>
          <button className="btn-primary text-xs py-1.5 px-3" onClick={() => addField()}>+ Add Field</button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-10 card rounded-2xl mb-4">
            <div className="text-3xl mb-3">🗺</div>
            <div className="font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No fields yet</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Add fields or use quick-add below</div>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {fields.map((field, idx) => (
              <FieldRow key={idx} field={field}
                onUpdate={p => updateField(idx, p)}
                onRemove={() => removeField(idx)}
                onMoveUp={() => moveField(idx, -1)}
                onMoveDown={() => moveField(idx, 1)}
                isFirst={idx === 0} isLast={idx === fields.length - 1}
              />
            ))}
          </div>
        )}

        {quickAdd.length > 0 && (
          <div className="mb-5">
            <div className="section-title mb-2">Quick add</div>
            <div className="flex flex-wrap gap-2">
              {quickAdd.map(s => (
                <button key={s.key} className="tag cursor-pointer transition-all hover:border-purple-500" onClick={() => addField(s)}>
                  + {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(fields)}>
            {saveMutation.isPending ? 'Saving...' : '✓ Save Blueprint'}
          </button>
          {saveMutation.isSuccess && <span className="text-sm" style={{ color: 'var(--accent-secondary)' }}>Saved!</span>}
        </div>
      </section>

      {/* ── Import ─────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Import Vocabulary</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          CSV with one word per cell. One request per batch of {BATCH_SIZE} — no timeouts. Save blueprint first.
        </p>

        {importState === 'idle' || importState === 'error' ? (
          <label onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors hover:border-purple-500"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
            <span className="text-4xl">📄</span>
            <div className="text-center">
              <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Drop CSV here or click to browse</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>One word per cell — any column layout</div>
            </div>
            {importError && (
              <div className="text-xs px-3 py-2 rounded-lg w-full text-center"
                style={{ background: 'rgba(225,112,85,0.1)', color: 'var(--accent-danger)', border: '1px solid rgba(225,112,85,.2)' }}>
                ✕ {importError}
              </div>
            )}
            <input type="file" accept=".csv,.txt" className="hidden" onChange={e => e.target.files[0] && handleCSV(e.target.files[0])} />
          </label>
        ) : importState === 'done' ? (
          <div className="card p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Import complete!</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{totalImported} card{totalImported !== 1 ? 's' : ''} added.</div>
            <button className="btn-secondary mt-4 text-xs"
              onClick={() => { setImportState('idle'); setTotalImported(0); progress.reset(1) }}>
              Import more
            </button>
          </div>
        ) : (
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl flex-shrink-0" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>✨</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{progressMsg || 'Generating...'}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {totalImported > 0 ? `${totalImported} cards saved so far` : 'Starting first batch...'}
                </div>
              </div>
              <div className="text-sm font-mono tabular-nums flex-shrink-0" style={{ color: 'var(--accent-primary)' }}>
                {Math.round(progress.percent)}%
              </div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Estimated time adapts based on completed batches
            </div>
          </div>
        )}
      </section>

      {/* ── Manual add ─────────────────────────────────── */}
      <section>
        <h2 className="font-display font-semibold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>Add Card Manually</h2>
        <ManualCardForm deckId={deckId} fields={fields}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['cards', deckId] }); toast.success('Card added!') }} />
      </section>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────
function normalisePhonetics(ph) {
  if (!ph) return { ruby: 'none', extras: [] }
  if (Array.isArray(ph)) {
    const RUBY_KEYS = RUBY_OPTIONS.map(o => o.key).filter(k => k !== 'none')
    const ruby = ph.find(k => RUBY_KEYS.includes(k)) || 'none'
    const extras = ph.filter(k => !RUBY_KEYS.includes(k))
    return { ruby, extras }
  }
  if (typeof ph === 'object') return { ruby: ph.ruby || 'none', extras: ph.extras || [] }
  return { ruby: 'none', extras: [] }
}

// ── FieldRow ────────────────────────────────────────────────
function FieldRow({ field, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [showPhonetics, setShowPhonetics] = useState(false)
  const ph = normalisePhonetics(field.phonetics)
  const hasAnnotations = ph.ruby !== 'none' || ph.extras.length > 0

  const setRuby = ruby => onUpdate({ phonetics: { ...ph, ruby } })
  const toggleExtra = key => {
    const next = ph.extras.includes(key) ? ph.extras.filter(k => k !== key) : [...ph.extras, key]
    onUpdate({ phonetics: { ...ph, extras: next } })
  }

  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
          <button disabled={isFirst}  className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveUp}>▲</button>
          <button disabled={isLast}   className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveDown}>▼</button>
        </div>

        {/* Config */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input className="input text-sm py-1.5 w-36" value={field.label}
              onChange={e => onUpdate({ label: e.target.value })} placeholder="Label" />
            <input className="input text-sm py-1.5 w-28 font-mono" value={field.key}
              onChange={e => onUpdate({ key: e.target.value.replace(/\s/g,'_').toLowerCase() })} placeholder="key" />
            <select className="input text-xs py-1.5 w-36" value={field.field_type}
              onChange={e => onUpdate({ field_type: e.target.value })}>
              {FIELD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={!!field.show_on_front} onChange={e => onUpdate({ show_on_front: e.target.checked })} />
              Show on front
            </label>
          </div>

          <input className="input text-xs py-1.5 w-full" value={field.description || ''}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder="AI hint — describe what to put in this field" />

          {field.field_type === 'example' && (
            <div className="text-xs px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(0,212,168,.08)', color: 'var(--accent-secondary)', border: '1px solid rgba(0,212,168,.2)' }}>
              ✦ Cloze enabled — Gemini wraps the target word with {'{{word}}'}
            </div>
          )}

          {/* Phonetics panel */}
          {field.field_type !== 'example' && (
            <div>
              <button className="flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: hasAnnotations ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                onClick={() => setShowPhonetics(s => !s)}>
                <span>{showPhonetics ? '▾' : '▸'}</span>
                Phonetic annotations
                {hasAnnotations && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)' }}>
                    {[ph.ruby !== 'none' ? ph.ruby : null, ...ph.extras].filter(Boolean).join(', ')}
                  </span>
                )}
              </button>

              {showPhonetics && (
                <div className="mt-2 p-3 rounded-xl space-y-3"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

                  {/* Ruby dropdown */}
                  <div>
                    <div className="section-title mb-1.5">Ruby (shown above the word)</div>
                    <select className="input text-xs py-1.5" value={ph.ruby} onChange={e => setRuby(e.target.value)}>
                      {RUBY_OPTIONS.map(o => (
                        <option key={o.key} value={o.key}>
                          {o.label}{o.hint ? ` — ${o.hint}` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Only one ruby annotation can be shown at a time.
                    </div>
                  </div>

                  {/* Extras checkboxes */}
                  <div>
                    <div className="section-title mb-1.5">Additional annotations</div>
                    <div className="space-y-1.5">
                      {EXTRA_OPTIONS.map(opt => (
                        <label key={opt.key} className="flex items-start gap-2.5 cursor-pointer py-0.5">
                          <input type="checkbox" className="mt-0.5 flex-shrink-0"
                            checked={ph.extras.includes(opt.key)}
                            onChange={() => toggleExtra(opt.key)} />
                          <div>
                            <div className="text-xs font-medium" style={{ color: ph.extras.includes(opt.key) ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              {opt.label}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.hint}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  {hasAnnotations && (
                    <div className="text-xs pt-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      Gemini will generate:{' '}
                      <span style={{ color: 'var(--accent-secondary)' }}>
                        {[ph.ruby !== 'none' && `${ph.ruby} (ruby)`, ...ph.extras].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button className="btn-ghost p-1.5 text-xs flex-shrink-0" style={{ color: 'var(--accent-danger)' }} onClick={onRemove}>✕</button>
      </div>
    </div>
  )
}

// ── ManualCardForm ──────────────────────────────────────────
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
      setWord(''); setFieldValues({}); setSaved(true); onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="card p-5 space-y-3">
      <div>
        <label className="section-title block mb-1.5">Word / Vocab *</label>
        <input className="input" value={word} onChange={e => setWord(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="Enter the target language word" autoComplete="off" />
      </div>
      {fields.map(f => (
        <div key={f.key}>
          <label className="section-title block mb-1.5">
            {f.label}
            {f.field_type === 'example' && (
              <span className="ml-2 normal-case font-normal" style={{ color: 'var(--text-muted)' }}>
                — use {'{{word}}'} to mark cloze
              </span>
            )}
          </label>
          {f.field_type === 'example' ? (
            <textarea className="input text-sm resize-none" rows={2} value={fieldValues[f.key] || ''}
              onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
              placeholder="e.g. 나는 {{사랑}}해." />
          ) : (
            <input className="input text-sm" value={fieldValues[f.key] || ''}
              onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.description || f.label} />
          )}
        </div>
      ))}
      <button className="btn-primary" disabled={!word.trim() || saving} onClick={handleSave}>
        {saving ? 'Saving...' : saved ? '✓ Added!' : 'Add Card'}
      </button>
    </div>
  )
}
