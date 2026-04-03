import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/shared/Toast'
import { useAppStore } from '../store/appStore'
import Modal from '../components/shared/Modal'
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
// Drives the progress bar by updating a DOM element directly via a ref,
// bypassing React's state batching which defers updates during async awaits.
// The text % uses React state (updates every ~100ms to avoid jank).
// ──────────────────────────────────────────────────────────
function usePredictiveProgress() {
  const rafRef         = useRef(null)
  const barRef         = useRef(null)   // ref to the <div class="import-progress-fill"> DOM node
  const valueRef       = useRef(0)      // current % value (ground truth)
  const [displayPct, setDisplayPct] = useState(0) // for the text label only

  const batchTimesRef  = useRef([])
  const batchStartRef  = useRef(null)
  const fromRef        = useRef(0)
  const ceilingRef     = useRef(0)
  const durationRef    = useRef(INITIAL_ESTIMATE_MS)
  const totalRef       = useRef(1)
  const lastTextRef    = useRef(0)      // last time we updated text state

  const updateBar = useCallback((pct) => {
    valueRef.current = pct
    if (barRef.current) barRef.current.style.width = `${pct}%`
    // Update text label at most every 100ms to avoid React thrashing
    const now = performance.now()
    if (now - lastTextRef.current > 100) {
      lastTextRef.current = now
      setDisplayPct(Math.round(pct))
    }
  }, [])

  const tick = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const step = () => {
      const elapsed = performance.now() - (batchStartRef.current ?? performance.now())
      const t = Math.min(elapsed / durationRef.current, 1)
      const value = fromRef.current + (ceilingRef.current - fromRef.current) * t
      updateBar(value)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }, [updateBar])

  const reset = useCallback((totalBatches) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    totalRef.current       = Math.max(totalBatches, 1)
    valueRef.current       = 0
    batchTimesRef.current  = []
    batchStartRef.current  = null
    fromRef.current        = 0
    ceilingRef.current     = 0
    if (barRef.current) barRef.current.style.width = '0%'
    setDisplayPct(0)
  }, [])

  const startBatch = useCallback((batchIndex) => {
    batchStartRef.current = performance.now()
    fromRef.current    = (batchIndex / totalRef.current) * 100
    ceilingRef.current = ((batchIndex + 1) / totalRef.current) * 100
    const times = batchTimesRef.current
    durationRef.current = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : INITIAL_ESTIMATE_MS
    tick()
  }, [tick])

  const completeBatch = useCallback(() => {
    const elapsed = performance.now() - (batchStartRef.current ?? performance.now())
    batchTimesRef.current = [...batchTimesRef.current, elapsed]
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    updateBar(ceilingRef.current)
    setDisplayPct(Math.round(ceilingRef.current))
  }, [updateBar])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])
  return { barRef, displayPct, reset, startBatch, completeBatch }
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
  // Homograph review: cards pending user approval before saving
  const [homographPending, setHomographPending] = useState(null) // { groups: [{word, senses: [{card, selected}]}], onConfirm }

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

  // Track original blueprint to diff against on save
  const originalBlueprintRef = useRef(null)

  useEffect(() => {
    if (blueprintData !== undefined && fields === null) {
      const normalised = (blueprintData ?? []).map(f => ({
        ...f,
        phonetics: normalisePhonetics(f.phonetics),
      }))
      setFields(normalised)
      // Store original as deep copy for diffing
      originalBlueprintRef.current = normalised
    }
  }, [blueprintData]) // eslint-disable-line

  // ── Background regen state ───────────────────────────────
  const [regenState, setRegenState] = useState('idle') // idle | running | done | error
  const [regenMsg, setRegenMsg] = useState('')
  const [regenProgress, setRegenProgress] = useState(0) // 0-100
  const regenBarRef = useRef(null)
  const regenRafRef = useRef(null)

  const updateRegenBar = (pct) => {
    setRegenProgress(Math.round(pct))
    if (regenBarRef.current) regenBarRef.current.style.width = `${pct}%`
  }

  // Compute which fields need AI regeneration:
  // - New fields (key didn't exist before)
  // - Changed description/hint/phonetics/type (hint to AI changed = output changes)
  // - NOT deletions (no AI needed to remove data)
  // - NOT fields where all cards already have the data populated
  const computeFieldsNeedingRegen = (oldFields, newFields, cards) => {
    const needRegen = []
    for (const nf of newFields) {
      const of_ = oldFields.find(f => f.key === nf.key)
      if (!of_) {
        // Brand new field — needs AI for all cards
        needRegen.push(nf)
        continue
      }
      // Check if anything that affects AI output changed
      const descChanged = of_.description !== nf.description
      const typeChanged = of_.field_type !== nf.field_type
      const phonChanged = JSON.stringify(of_.phonetics) !== JSON.stringify(nf.phonetics)
      if (!descChanged && !typeChanged && !phonChanged) continue

      // Field definition changed — but check if cards already have this data
      // If ALL cards already have this field populated, no need to regenerate
      const cardsNeedingField = cards.filter(c => {
        const val = c.fields?.[nf.key]
        return !val || val === ''
      })
      if (cardsNeedingField.length === 0 && cards.length > 0) {
        // All cards already have data — skip AI for this field
        continue
      }
      needRegen.push(nf)
    }
    return needRegen
  }

  const runBackgroundRegen = async (savedFields, allCards) => {
    const oldFields = originalBlueprintRef.current || []
    const changedFields = computeFieldsNeedingRegen(oldFields, savedFields, allCards)

    if (changedFields.length === 0 || allCards.length === 0) {
      originalBlueprintRef.current = savedFields
      return
    }

    // Batch size scales with number of changed fields — no arbitrary cap
    // Keep total field×word generations under 250 per batch
    const MAX_TOTAL = 250
    const wordsPerBatch = Math.max(1, Math.floor(MAX_TOTAL / changedFields.length))
    const words = allCards.map(c => c.word)
    const batches = []
    for (let i = 0; i < words.length; i += wordsPerBatch) batches.push(words.slice(i, i + wordsPerBatch))

    setRegenState('running')
    setRegenMsg(`Updating ${changedFields.length} field${changedFields.length !== 1 ? 's' : ''} across ${allCards.length} cards…`)
    updateRegenBar(0)

    let done = 0
    const targetLang = deckRef.current?.target_language || 'Korean'

    for (let i = 0; i < batches.length; i++) {
      const batchWords = batches[i]

      // Animate bar toward this batch ceiling
      const batchCeil = ((i + 1) / batches.length) * 100
      const batchStart = (i / batches.length) * 100
      const startTime = performance.now()
      const ESTIMATE = 9000
      if (regenRafRef.current) cancelAnimationFrame(regenRafRef.current)
      const tickRegen = () => {
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / ESTIMATE, 1)
        updateRegenBar(batchStart + (batchCeil - batchStart) * t)
        if (t < 1) regenRafRef.current = requestAnimationFrame(tickRegen)
      }
      regenRafRef.current = requestAnimationFrame(tickRegen)

      try {
        const genRes = await api.generateCards(
          deckId,
          { vocab: batchWords, targetLanguage: targetLang },
          changedFields // Only send changed fields to generate
        )

        if (genRes?.cards?.length) {
          // Build patches: for each returned card, only pick keys from changedFields
          const changedKeys = changedFields.flatMap(f => {
            const keys = [f.key]
            // Include phonetic sub-keys
            const ph = f.phonetics
            if (ph && !Array.isArray(ph)) {
              if (ph.ruby && ph.ruby !== 'none') keys.push(`${f.key}_${ph.ruby}`)
              ;(ph.extras || []).forEach(k => keys.push(`${f.key}_${k}`))
            }
            return keys
          })

          const patches = genRes.cards
            .filter(c => c.word && !c._error)
            .map(c => {
              const fields = {}
              changedKeys.forEach(k => { if (k in c && k !== 'word') fields[k] = c[k] })
              return { word: c.word, fields }
            })
            .filter(p => Object.keys(p.fields).length > 0)

          if (patches.length > 0) {
            await api.patchCards(deckId, patches)
            done += patches.length
          }
        }
      } catch (e) {
        console.error('Regen batch error:', e)
      }

      if (regenRafRef.current) cancelAnimationFrame(regenRafRef.current)
      updateRegenBar(batchCeil)
      setRegenMsg(`Updated ${done} cards…`)
    }

    qc.invalidateQueries({ queryKey: ['cards', deckId] })
    originalBlueprintRef.current = savedFields
    setRegenState('done')
    setRegenMsg(`${done} card${done !== 1 ? 's' : ''} refreshed`)
    updateRegenBar(100)
  }

  const allCardsRef = useRef([])
  const { data: allCards = [] } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => api.getCards(deckId),
    enabled: !!deckId,
  })
  useEffect(() => { allCardsRef.current = allCards }, [allCards])

  const saveMutation = useMutation({
    mutationFn: f => api.saveBlueprintFields(deckId, f),
    onSuccess: saved => {
      const normalised = saved.map(f => ({ ...f, phonetics: normalisePhonetics(f.phonetics) }))
      setFields(normalised)
      qc.setQueryData(['blueprint', deckId], saved)
      toast.success('Blueprint saved!')
      // Kick off background regeneration if there are cards to update
      if (allCardsRef.current.length > 0) {
        runBackgroundRegen(normalised, allCardsRef.current)
      }
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

          let allGeneratedCards = []
          for (let i = 0; i < batches.length; i++) {
            setProgressMsg(`Batch ${i + 1} / ${batches.length}`)
            progress.startBatch(i)

            // Retry each batch up to 3 times before giving up
            let genRes = null
            let lastErr = null
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                genRes = await api.generateCards(
                  deckId,
                  { vocab: batches[i], targetLanguage: deckRef.current?.target_language || 'Korean' },
                  fieldsRef.current || []
                )
                lastErr = null
                break
              } catch (e) {
                lastErr = e
                if (attempt < 2) {
                  setProgressMsg(`Batch ${i + 1} / ${batches.length} — retrying (${attempt + 1}/3)…`)
                  await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
                }
              }
            }

            if (lastErr || !genRes?.cards?.length) {
              const msg = lastErr?.message || 'No cards returned'
              toast.error(`Batch ${i + 1} failed: ${msg}`)
              setProgressMsg(`Batch ${i + 1} / ${batches.length} — failed, continuing…`)
              progress.completeBatch(i)
              continue
            }

            progress.completeBatch(i)
            allGeneratedCards.push(...genRes.cards.filter(c => !c._error))
            setProgressMsg(`Batch ${i + 1} / ${batches.length} — ${allGeneratedCards.length} cards generated`)
          }

          if (!allGeneratedCards.length) {
            setImportState('done')
            return
          }

          // ── Detect homographs ──────────────────────────────
          // Group cards by word. Any word with multiple cards (multiple meanings) is a homograph.
          const wordGroups = {}
          for (const card of allGeneratedCards) {
            if (!wordGroups[card.word]) wordGroups[card.word] = []
            wordGroups[card.word].push(card)
          }

          const homographGroups = Object.entries(wordGroups)
            .filter(([, cards]) => cards.length > 1)
            .map(([word, cards]) => ({
              word,
              senses: cards.map(c => ({ card: c, selected: true, sense: c._sense || '' })),
            }))

          // Function that actually saves the chosen cards
          const saveCards = async (cardsToSave) => {
            const toSave = cardsToSave.map(c => {
              // Strip internal _ fields before saving
              const { _meanings, _sense, _error, ...fields } = c
              return { deck_id: deckId, word: c.word, fields }
            })
            if (toSave.length) {
              await batchSaveMutation.mutateAsync(toSave)
              setTotalImported(toSave.length)
            }
            setImportState('done')
            qc.invalidateQueries({ queryKey: ['cards', deckId] })
          }

          if (homographGroups.length === 0) {
            // No homographs — save immediately
            await saveCards(allGeneratedCards)
          } else {
            // Pause import and show homograph review modal
            setImportState('review')
            setHomographPending({
              groups: homographGroups,
              allCards: allGeneratedCards,
              onConfirm: async (approvedHomographCards) => {
                setHomographPending(null)
                setImportState('generating')
                // Replace homograph words with only the approved senses
                const homographWords = new Set(homographGroups.map(g => g.word))
                const nonHomographCards = allGeneratedCards.filter(c => !homographWords.has(c.word))
                await saveCards([...nonHomographCards, ...approvedHomographCards])
              },
            })
          }
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
          {saveMutation.isSuccess && regenState === 'idle' && (
            <span className="text-sm" style={{ color: 'var(--accent-secondary)' }}>Saved!</span>
          )}
        </div>

        {/* Background regen progress */}
        {regenState !== 'idle' && (
          <div className="mt-3 rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm" style={{ animation: regenState === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none' }}>
                {regenState === 'done' ? '✅' : regenState === 'error' ? '❌' : '⚡'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {regenState === 'done' ? 'Cards updated' : 'Updating existing cards…'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{regenMsg}</div>
              </div>
              <div className="text-xs font-mono tabular-nums flex-shrink-0" style={{ color: 'var(--accent-primary)' }}>
                {regenProgress}%
              </div>
            </div>
            <div className="progress-bar">
              <div ref={regenBarRef} className="import-progress-fill" style={{ width: '0%' }} />
            </div>
            {regenState === 'done' && (
              <button className="btn-ghost text-xs mt-2 py-1" onClick={() => { setRegenState('idle'); setRegenProgress(0) }}>
                Dismiss
              </button>
            )}
          </div>
        )}
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
        ) : importState === 'review' ? (
          <div className="card p-6 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Reviewing homographs…</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Check the popup to confirm which meanings to import.</div>
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
                {progress.displayPct}%
              </div>
            </div>
            <div className="progress-bar">
              <div ref={progress.barRef} className="import-progress-fill" style={{ width: '0%' }} />
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

      {/* ── Homograph review modal ──────────────────────── */}
      {homographPending && (
        <HomographModal
          groups={homographPending.groups}
          blueprint={fields}
          onConfirm={(approved) => homographPending.onConfirm(approved)}
          onClose={() => { setHomographPending(null); setImportState('done') }}
        />
      )}
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

// ── HomographModal ──────────────────────────────────────────
// Shows homograph groups and lets the user pick which meanings to keep.
function HomographModal({ groups, blueprint, onConfirm, onClose }) {
  // Each group has { word, senses: [{card, sense, selected}] }
  const [localGroups, setLocalGroups] = useState(() =>
    groups.map(g => ({
      ...g,
      senses: g.senses.map(s => ({ ...s, selected: true })),
    }))
  )

  const toggle = (gIdx, sIdx) => {
    setLocalGroups(prev => prev.map((g, gi) => gi !== gIdx ? g : {
      ...g,
      senses: g.senses.map((s, si) => si !== sIdx ? s : { ...s, selected: !s.selected }),
    }))
  }

  const handleConfirm = () => {
    const approved = localGroups.flatMap(g => g.senses.filter(s => s.selected).map(s => s.card))
    onConfirm(approved)
  }

  const totalSelected = localGroups.reduce((n, g) => n + g.senses.filter(s => s.selected).length, 0)

  // Find the definition/reading field to preview meaning
  const defField = blueprint?.find(f => f.key === 'definition') || blueprint?.find(f => f.key === 'reading')

  return (
    <Modal title="Homograph Review" onClose={onClose} size="lg">
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        The following words have multiple distinct meanings. Select which meanings you want to import as separate cards.
      </p>
      <div className="space-y-5 max-h-96 overflow-auto pr-1">
        {localGroups.map((g, gIdx) => (
          <div key={g.word} className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="font-display text-lg font-bold mb-3" style={{ color: 'var(--accent-primary)' }}>
              {g.word}
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                {g.senses.length} meanings
              </span>
            </div>
            <div className="space-y-2">
              {g.senses.map((s, sIdx) => {
                const preview = defField ? s.card[defField.key] : ''
                return (
                  <label key={sIdx} className="flex items-start gap-3 cursor-pointer p-2 rounded-lg transition-colors hover:bg-white/5">
                    <input type="checkbox" checked={s.selected} onChange={() => toggle(gIdx, sIdx)} className="mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      {s.sense && (
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.sense}</div>
                      )}
                      {preview && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{preview}</div>
                      )}
                      {!s.sense && !preview && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Meaning {sIdx + 1}</div>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-5">
        <button className="btn-secondary flex-1" onClick={onClose}>Skip all homographs</button>
        <button className="btn-primary flex-1" onClick={handleConfirm} disabled={totalSelected === 0}>
          Import {totalSelected} card{totalSelected !== 1 ? 's' : ''} →
        </button>
      </div>
    </Modal>
  )
}
