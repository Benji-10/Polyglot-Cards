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

const valueText = (v) => {
  if (!v) return ''
  if (Array.isArray(v)) return v.map(it => it?.text || '').filter(Boolean).join(' ;;; ')
  if (typeof v === 'object') return v.text || ''
  return String(v)
}

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
  const [importMode, setImportMode] = useState('ai') // 'ai' | 'direct'
  const [importState, setImportState] = useState('idle')
  const [importError, setImportError] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [totalImported, setTotalImported] = useState(0)
  // Homograph review: cards pending user approval before saving
  const [homographPending, setHomographPending] = useState(null) // { groups, onConfirm }
  // Collision review: incoming cards that match an existing word
  const [collisionPending, setCollisionPending] = useState(null) // { collisions, noCollision, blueprint, onConfirm }

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
      const withMandatory = ensureMandatoryFields(normalised)
      setFields(withMandatory)
      originalBlueprintRef.current = withMandatory
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

  const computeFieldChanges = (oldFields, newFields) => {
    const regenFields = []

    for (const nf of newFields) {
      const of_ = oldFields.find(f => f.key === nf.key)

      if (!of_) {
        regenFields.push(nf)
        continue
      }

      const descChanged = of_.description !== nf.description
      const typeChanged = of_.field_type  !== nf.field_type

      // Phonetics: regen whenever the annotation set changes in a way that needs new data.
      // - Ruby changed to any different value (including switching between two non-'none' values)
      // - Any extra added (was not there before)
      // Does NOT regen when annotations are only removed (existing data stays in DB, just not shown).
      const oldPh = normalisePhonetics(of_.phonetics)
      const newPh = normalisePhonetics(nf.phonetics)
      const rubyChanged = newPh.ruby !== oldPh.ruby && newPh.ruby !== 'none'
      const extrasAdded = newPh.extras.some(k => !oldPh.extras.includes(k))
      const phonNeedsRegen = rubyChanged || extrasAdded

      if (descChanged || typeChanged || phonNeedsRegen) {
        regenFields.push({
          ...nf,
          _forceRegen: descChanged || typeChanged,
        })
      }
    }

    // Keys removed from blueprint → purge their data from all cards
    const newKeys = new Set(newFields.map(f => f.key))
    const deletedKeys = oldFields
      .filter(f => !MANDATORY_FIELD_KEYS.includes(f.key) && !newKeys.has(f.key))
      .map(f => f.key)

    // Also compute annotation sub-keys that were removed (e.g., fieldKey_english)
    // so we can delete them from card data
    const deletedAnnotationKeys = []
    for (const nf of newFields) {
      const of_ = oldFields.find(f => f.key === nf.key)
      if (!of_) continue
      const oldPh = normalisePhonetics(of_.phonetics)
      const newPh = normalisePhonetics(nf.phonetics)
      if (oldPh.ruby !== 'none' && oldPh.ruby !== newPh.ruby) {
        deletedAnnotationKeys.push(`${nf.key}_${oldPh.ruby}`)
      }
      oldPh.extras.forEach(k => {
        if (!newPh.extras.includes(k)) deletedAnnotationKeys.push(`${nf.key}_${k}`)
      })
    }

    return { regenFields, deletedKeys, deletedAnnotationKeys }
  }

  const runBackgroundRegen = async (savedFields, _allCards) => {
    const oldFields = originalBlueprintRef.current || []
    const { regenFields, deletedKeys, deletedAnnotationKeys } = computeFieldChanges(oldFields, savedFields)

    // Delete removed field data and removed annotation sub-keys from cards
    const allDeleted = [...deletedKeys, ...deletedAnnotationKeys]
    if (allDeleted.length > 0) {
      api.deleteCardFields(deckId, allDeleted).catch(e => console.error('Field delete error:', e))
    }

    if (regenFields.length === 0) {
      if (allDeleted.length > 0) qc.invalidateQueries({ queryKey: ['cards', deckId] })
      originalBlueprintRef.current = savedFields
      return
    }

    // Fetch fresh cards — avoids stale cache
    let freshCards
    try { freshCards = await api.getCards(deckId) }
    catch (e) { toast.error(`Could not fetch cards for refresh: ${e.message}`); return }
    if (!freshCards.length) { originalBlueprintRef.current = savedFields; return }

    // Only regen cards that are actually missing at least one regen field
    const getAnnotationKeys = (ph) => {
      if (!ph) return []
      if (Array.isArray(ph)) return ph.filter(k => k && k !== 'none')
      const keys = []
      if (ph.ruby && ph.ruby !== 'none') keys.push(ph.ruby)
      if (Array.isArray(ph.extras)) keys.push(...ph.extras)
      return keys
    }
    const fieldNeedsRegen = (card, field) => {
      if (field._forceRegen) return true
      const v = card.fields?.[field.key]
      if (!v || v === '') return true

      const annotationKeys = getAnnotationKeys(field.phonetics)
      const isArrayShape = Array.isArray(v)
      if (annotationKeys.length === 0) {
        if (field.field_type === 'example') {
          if (isArrayShape) return v.length === 0 || !v.some(it => it?.text)
          const text = typeof v === 'object' ? v.text : v
          return !text
        }
        return false
      }
      if (isArrayShape) {
        if (v.length === 0) return true
        return v.some(it => {
          if (!it?.text) return true
          const anns = it.annotations && typeof it.annotations === 'object' ? it.annotations : {}
          return annotationKeys.some(ak => !anns[ak])
        })
      }
      if (typeof v !== 'object') return true
      if (!v.text) return true
      return annotationKeys.some(ak => !v[ak])
    }
    const cardsNeedingRegen = freshCards.filter(card =>
      regenFields.some(f => fieldNeedsRegen(card, f))
    )
    if (cardsNeedingRegen.length === 0) {
      if (deletedKeys.length > 0) qc.invalidateQueries({ queryKey: ['cards', deckId] })
      originalBlueprintRef.current = savedFields
      return
    }

    // Use the same batch size as AI import — keeps regen and import batch counts comparable
    const batches = []
    for (let i = 0; i < cardsNeedingRegen.length; i += BATCH_SIZE) {
      batches.push(cardsNeedingRegen.slice(i, i + BATCH_SIZE))
    }

    setRegenState('running')
    setRegenMsg(`Refreshing ${regenFields.length} field${regenFields.length !== 1 ? 's' : ''} for ${cardsNeedingRegen.length} card${cardsNeedingRegen.length !== 1 ? 's' : ''} (${batches.length} batch${batches.length !== 1 ? 'es' : ''})…`)
    updateRegenBar(0)

    let totalPatched = 0
    let completedBatches = 0
    const failedBatchNums = []
    const targetLang = deckRef.current?.target_language || deck?.target_language || ''
    const allPatches = []

    // Helper: process one batch with independent retry
    const processBatch = async (batchIdx, batchCards) => {
      const vocabItems = batchCards.map(card => {
        const sense = card.fields?.context || card.fields?.source_translation || ''
        return sense ? `${card.word} (${sense})` : card.word
      })

      const MAX_RETRIES = 4
      let genRes = null
      let lastErr = null
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = 1500 * Math.pow(2, attempt - 1)
          await new Promise(r => setTimeout(r, delay))
        }
        try {
          genRes = await api.generateCards(deckId, {
            vocab: vocabItems,
            targetLanguage: targetLang,
            sourceLanguage: deckRef.current?.source_language || 'English',
            contextLanguage: deckRef.current?.context_language || 'target',
          }, regenFields)
          if (genRes?.cards?.length) { lastErr = null; break }
          lastErr = new Error('No cards returned')
        } catch (e) { lastErr = e }
      }

      if (lastErr || !genRes?.cards?.length) {
        console.error(`Regen batch ${batchIdx + 1} failed:`, lastErr?.message)
        failedBatchNums.push(batchIdx + 1)
        return
      }

      // With the nested annotation shape, Gemini returns each field as either:
      //   - a plain string (source_translation, context, unannotated fields)
      //   - an object { text, annotationType, ... } (annotated/example fields)
      // We patch by field key — the deep-merge in cards-patch handles nested merging.
      const changedFieldKeys = regenFields.map(f => f.key)

      genRes.cards.filter(c => !c._error).forEach((genCard, idx) => {
        const card = batchCards[idx]
        if (!card) return
        const fieldData = {}
        changedFieldKeys.forEach(k => {
          const v = genCard[k]
          if (v !== undefined && v !== null && v !== '') fieldData[k] = v
        })
        if (regenFields.some(f => fieldData[f.key] != null)) {
          allPatches.push({ id: card.id, word: card.word, fields: fieldData })
        }
      })
    }

    // Run batches 2 at a time (parallel) — doubles throughput within rate limit
    const CONCURRENCY = 2
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const chunk = batches.slice(i, i + CONCURRENCY)
      const startBatchIdx = i

      // Animate progress bar across this chunk
      const chunkStart = (i / batches.length) * 90 // reserve last 10% for saving
      const chunkEnd   = (Math.min(i + CONCURRENCY, batches.length) / batches.length) * 90
      const startTime  = performance.now()
      const ESTIMATE   = 12000 // slightly longer — two batches in parallel

      if (regenRafRef.current) cancelAnimationFrame(regenRafRef.current)
      const tickRegen = () => {
        const t = Math.min((performance.now() - startTime) / ESTIMATE, 0.9)
        updateRegenBar(chunkStart + (chunkEnd - chunkStart) * t)
        if (t < 0.9) regenRafRef.current = requestAnimationFrame(tickRegen)
      }
      regenRafRef.current = requestAnimationFrame(tickRegen)
      setRegenMsg(`Batches ${startBatchIdx + 1}–${Math.min(startBatchIdx + CONCURRENCY, batches.length)} / ${batches.length} — generating…`)

      await Promise.all(chunk.map((batchCards, j) => processBatch(startBatchIdx + j, batchCards)))

      if (regenRafRef.current) cancelAnimationFrame(regenRafRef.current)
      completedBatches += chunk.length
      updateRegenBar((completedBatches / batches.length) * 90)
    }

    // Saving phase — the last 10% of the bar
    if (allPatches.length > 0) {
      setRegenMsg(`Saving ${allPatches.length} card${allPatches.length !== 1 ? 's' : ''}…`)
      updateRegenBar(90)
      try {
        await api.patchCards(deckId, allPatches)
        totalPatched = allPatches.length
      } catch (e) {
        console.error('Regen patch failed:', e)
        failedBatchNums.push('save')
      }
    }

    qc.invalidateQueries({ queryKey: ['cards', deckId] })
    updateRegenBar(100)

    const anyFailed = failedBatchNums.length > 0
    if (anyFailed) {
      originalBlueprintRef.current = oldFields
      setRegenState('error')
      setRegenMsg(`${totalPatched} cards updated. Failures: batch${failedBatchNums.length > 1 ? 'es' : ''} ${failedBatchNums.join(', ')} — save again to retry.`)
      toast.error(`Some card updates failed. Save the blueprint again to retry.`)
    } else {
      originalBlueprintRef.current = savedFields
      setRegenState('done')
      setRegenMsg(`${totalPatched} card${totalPatched !== 1 ? 's' : ''} refreshed`)
    }
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
  // Keys are stable identifiers generated once at creation — they never change,
  // even when the user renames the label.
  const makeKey = () => `f_${Math.random().toString(36).slice(2, 8)}`

  const addField = suggested => {
    const base = suggested
      ? { ...suggested, key: suggested.key || makeKey(), phonetics: normalisePhonetics(suggested.phonetics) }
      : { key: makeKey(), label: 'New Field', description: '', field_type: 'text', show_on_front: false, phonetics: { ruby: 'none', extras: [] } }
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

  // ── CSV Import (AI) ──────────────────────────────────────
  const handleCSV = useCallback(file => {
    setImportState('generating')
    setImportError(null)
    setTotalImported(0)

    Papa.parse(file, {
      complete: async res => {
        try {
          const vocab = res.data.flat().map(v => String(v).trim()).filter(Boolean)
          if (!vocab.length) { setImportError('No words found in CSV'); setImportState('error'); return }

          // Warn if the CSV looks like a structured file (multiple populated columns per row)
          // — the AI importer expects a flat word list, not headers + data
          const rows = res.data.filter(r => Array.isArray(r) && r.some(c => String(c).trim()))
          if (rows.length >= 2) {
            const firstRowCols = rows[0].filter(c => String(c).trim()).length
            const secondRowCols = rows[1].filter(c => String(c).trim()).length
            if (firstRowCols > 1 && secondRowCols > 1) {
              setImportError(
                'This looks like a structured CSV with multiple columns. ' +
                'The AI importer expects a plain word list (one word per cell). ' +
                'Use the "Direct CSV" tab if you want to import a structured file.'
              )
              setImportState('error')
              return
            }
          }

          const batches = []
          for (let i = 0; i < vocab.length; i += BATCH_SIZE) batches.push(vocab.slice(i, i + BATCH_SIZE))
          progress.reset(batches.length)
          setProgressMsg('Generating cards…')

          let allGeneratedCards = []
          let failedBatchCount = 0

          // Helper: fetch one batch with independent exponential backoff retry
          const fetchBatch = async (batchIdx) => {
            const MAX_RETRIES = 4
            let genRes = null
            let lastErr = null
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              if (attempt > 0) {
                const delay = 1500 * Math.pow(2, attempt - 1)
                await new Promise(r => setTimeout(r, delay))
              }
              try {
                genRes = await api.generateCards(deckId, {
                  vocab: batches[batchIdx],
                  targetLanguage: deckRef.current?.target_language || deck?.target_language || '',
                  sourceLanguage: deckRef.current?.source_language || 'English',
                  contextLanguage: deckRef.current?.context_language || 'target',
                }, fieldsRef.current || [])
                if (genRes?.cards?.length) { lastErr = null; break }
                lastErr = new Error('No cards returned from API')
              } catch (e) { lastErr = e }
            }
            return { batchIdx, genRes, lastErr }
          }

          // Validate cards from a batch result
          const requiredKeys = (fieldsRef.current || []).map(f => f.key).filter(k => !MANDATORY_FIELD_KEYS.includes(k))
          const validateCards = (cards) => cards.filter(c => {
            if (c._error || !c.word) return false
            if (requiredKeys.length === 0) return true
            return requiredKeys.some(k => c[k] && c[k] !== '')
          })

          // Rolling pipeline: 2 batches in-flight at once.
          // As soon as any slot frees up, the next batch starts immediately.
          const CONCURRENCY = 2
          let nextBatch = 0
          let completedCount = 0

          await new Promise(resolve => {
            const launch = () => {
              while (nextBatch < batches.length && (nextBatch - completedCount) < CONCURRENCY) {
                const idx = nextBatch++
                progress.startBatch(idx)
                fetchBatch(idx).then(({ genRes, lastErr }) => {
                  completedCount++
                  if (lastErr || !genRes?.cards?.length) {
                    failedBatchCount++
                  } else {
                    allGeneratedCards.push(...validateCards(genRes.cards))
                    setProgressMsg(`${allGeneratedCards.length} card${allGeneratedCards.length !== 1 ? 's' : ''} generated…`)
                  }
                  progress.completeBatch(idx)
                  if (completedCount >= batches.length) resolve()
                  else launch()
                })
              }
            }
            launch()
            if (batches.length === 0) resolve()
          })

          if (!allGeneratedCards.length) {
            setImportError(failedBatchCount > 0 ? `All ${failedBatchCount} batch${failedBatchCount !== 1 ? 'es' : ''} failed — check your connection and try again` : 'No valid cards generated')
            setImportState('error')
            return
          }

          // ── Saving phase — update progress bar for this step ──
          setProgressMsg(`Saving ${allGeneratedCards.length} cards…`)

          // ── Detect homographs ──────────────────────────────
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

          // Function that detects collisions then saves
          const proceedToCollisionCheck = async (cardsToSave) => {
            // Build word → array of existing cards (a word can have multiple for homographs)
            const existingByWord = {}
            for (const c of allCardsRef.current) {
              if (!existingByWord[c.word]) existingByWord[c.word] = []
              existingByWord[c.word].push(c)
            }

            // For each incoming card, find the best matching existing card.
            // Match by _sense if available (context/source_translation field), then by index.
            const usedExistingIds = new Set()
            const collisions = []
            const noCollision = []

            for (const incoming of cardsToSave) {
              const existingArr = existingByWord[incoming.word]
              if (!existingArr || existingArr.length === 0) {
                noCollision.push(incoming)
                continue
              }

              // Try to match by sense (context or source_translation field)
              const incomingSense = (incoming._sense || incoming.source_translation || '').toLowerCase().trim()
              let match = null

              if (incomingSense) {
                match = existingArr.find(e => {
                  if (usedExistingIds.has(e.id)) return false
                  const eSense = (e.fields?.context || e.fields?.source_translation || '').toLowerCase().trim()
                  return eSense === incomingSense || eSense.includes(incomingSense) || incomingSense.includes(eSense)
                })
              }

              // Fall back to first unmatched existing card
              if (!match) match = existingArr.find(e => !usedExistingIds.has(e.id))

              if (match) {
                usedExistingIds.add(match.id)
                collisions.push({ incoming, existing: match })
              } else {
                // All existing cards for this word are already matched — this is a new sense
                noCollision.push(incoming)
              }
            }

            if (collisions.length === 0) {
              await saveCards(noCollision)
            } else {
              setImportState('review')
              setCollisionPending({
                collisions,
                noCollision,
                blueprint: fieldsRef.current || [],
                onConfirm: async (decisions) => {
                  setCollisionPending(null)
                  setImportState('generating')

                  const toAdd = [...noCollision]
                  const toUpdate = []
                  for (const { incoming, existing, action } of decisions) {
                    if (action === 'add')    toAdd.push(incoming)
                    if (action === 'update') toUpdate.push({ incoming, existing })
                  }

                  if (toUpdate.length) {
                    // Patch by id — correct for homographs
                    const patches = toUpdate.map(({ incoming, existing }) => {
                      const { _meanings, _sense, _error, word, ...fields } = incoming
                      return { id: existing.id, word, fields }
                    })
                    await api.patchCards(deckId, patches).catch(() => {})
                  }

                  await saveCards(toAdd)
                },
              })
            }
          }

          // Function that actually saves the chosen cards
          const saveCards = async (cardsToSave) => {
            const toSave = cardsToSave.map(c => {
              // Strip internal meta fields — everything else is card field data
              const { _meanings, _sense, _error, word, ...fields } = c
              return { deck_id: deckId, word, fields }
            })
            if (toSave.length) {
              await batchSaveMutation.mutateAsync(toSave)
              setTotalImported(prev => prev + toSave.length)
            }
            setImportState('done')
            qc.invalidateQueries({ queryKey: ['cards', deckId] })
          }

          if (homographGroups.length === 0) {
            // No homographs — check collisions then save
            await proceedToCollisionCheck(allGeneratedCards)
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
                await proceedToCollisionCheck([...nonHomographCards, ...approvedHomographCards])
              },
            })
          }
        } catch (e) { setImportError(e.message); setImportState('error') }
      },
      error: e => { setImportError(e.message); setImportState('error') },
    })
  }, [deckId, progress]) // eslint-disable-line

  const handleDrop = useCallback(e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCSV(f) }, [handleCSV])

  // ── Direct CSV import (no AI) ───────────────────────────
  // Row 1: headers — word, [field keys], optional SRS columns
  // Row 2: metadata JSON per field column (label, description, field_type, show_on_front, phonetics)
  //        — only present in files exported from this app
  // Row 3+: card data
  const handleDirectCSV = useCallback(file => {
    setImportState('generating')
    setImportError(null)
    setTotalImported(0)

    Papa.parse(file, {
      header: false,       // parse raw rows so we can handle the metadata row ourselves
      skipEmptyLines: true,
      complete: async res => {
        try {
          const allRows = res.data
          if (allRows.length < 2) { setImportError('CSV needs at least a header and one data row'); setImportState('error'); return }

          const headers = allRows[0].map(h => String(h).trim())
          if (!headers.includes('word')) { setImportError('CSV must have a "word" column'); setImportState('error'); return }

          const SRS_COLS = new Set(['srs_state', 'last_reviewed', 'interval', 'stability', 'difficulty', 'repetitions', 'seen'])

          // Detect metadata row: row 2 where at least one blueprint field column contains JSON with "label"
          let metaRow = null
          let dataStartIdx = 1
          const row2 = allRows[1]
          const hasMeta = row2.some((cell, i) => {
            if (!cell || headers[i] === 'word' || SRS_COLS.has(headers[i])) return false
            try { const p = JSON.parse(cell); return typeof p === 'object' && 'label' in p } catch { return false }
          })
          if (hasMeta) { metaRow = row2; dataStartIdx = 2 }

          const fieldCols = headers.filter(h => h !== 'word' && !SRS_COLS.has(h))

          // If we have a metadata row, update the blueprint with the imported field definitions
          if (metaRow) {
            const newFields = []
            for (let i = 0; i < headers.length; i++) {
              const h = headers[i]
              if (h === 'word' || SRS_COLS.has(h) || MANDATORY_FIELD_KEYS.includes(h)) continue
              try {
                const meta = JSON.parse(metaRow[i] || '{}')
                newFields.push({
                  key:           h,
                  label:         meta.label        || h,
                  description:   meta.description  || '',
                  field_type:    meta.field_type   || 'text',
                  show_on_front: meta.show_on_front || false,
                  phonetics:     normalisePhonetics(meta.phonetics),
                  position:      newFields.length,
                })
              } catch {
                newFields.push({ key: h, label: h, description: '', field_type: 'text', show_on_front: false, phonetics: { ruby: 'none', extras: [] }, position: newFields.length })
              }
            }
            if (newFields.length > 0) {
              // Keep mandatory fields, prepend them, save blueprint
              const mandatory = (fieldsRef.current || []).filter(f => MANDATORY_FIELD_KEYS.includes(f.key))
              const merged = [...mandatory, ...newFields]
              try {
                await api.saveBlueprintFields(deckId, merged)
                qc.invalidateQueries({ queryKey: ['blueprint', deckId] })
                setFields(merged.map(f => ({ ...f, phonetics: normalisePhonetics(f.phonetics) })))
                originalBlueprintRef.current = merged
              } catch (e) {
                console.error('Blueprint update failed:', e)
              }
            }
          }

          // Parse data rows into cards
          const wordIdx = headers.indexOf('word')
          const colIdx  = (col) => headers.indexOf(col)
          const cardsToSave = allRows.slice(dataStartIdx)
            .filter(row => row[wordIdx]?.trim())
            .map(row => {
              const card = { deck_id: deckId, word: row[wordIdx].trim(), fields: {} }
              for (const col of fieldCols) {
                const idx = colIdx(col)
                if (idx >= 0 && row[idx] !== undefined && row[idx] !== '') {
                  const raw = row[idx]
                  // Field values that are objects were exported as JSON — try to parse them back
                  try {
                    const parsed = JSON.parse(raw)
                    card.fields[col] = (parsed && typeof parsed === 'object') ? parsed : raw
                  } catch {
                    card.fields[col] = raw
                  }
                }
              }
              if (row[colIdx('srs_state')])     card.srs_state     = row[colIdx('srs_state')]
              if (row[colIdx('last_reviewed')]) card.last_reviewed  = row[colIdx('last_reviewed')]
              if (row[colIdx('interval')])      card.interval       = Number(row[colIdx('interval')]) || 0
              if (row[colIdx('stability')])     card.stability      = Number(row[colIdx('stability')]) || 0
              if (row[colIdx('difficulty')])    card.difficulty     = Number(row[colIdx('difficulty')]) || 5
              if (row[colIdx('repetitions')])   card.repetitions    = Number(row[colIdx('repetitions')]) || 0
              return card
            })

          if (!cardsToSave.length) { setImportError('No valid data rows found'); setImportState('error'); return }

          // Collision check — word → array to handle homographs
          const existingByWord = {}
          for (const c of allCardsRef.current) {
            if (!existingByWord[c.word]) existingByWord[c.word] = []
            existingByWord[c.word].push(c)
          }
          const usedIds = new Set()
          const collisions = []
          const noCollision = []
          for (const incoming of cardsToSave) {
            const arr = existingByWord[incoming.word]
            if (!arr?.length) { noCollision.push(incoming); continue }
            const match = arr.find(e => !usedIds.has(e.id))
            if (match) { usedIds.add(match.id); collisions.push({ incoming, existing: match }) }
            else noCollision.push(incoming)
          }

          const saveDirect = async (toAdd, toUpdate) => {
            if (toUpdate.length) {
              const patches = toUpdate.map(({ incoming, existing }) => ({
                id: existing.id, word: incoming.word, fields: incoming.fields,
              }))
              await api.patchCards(deckId, patches).catch(() => {})
            }
            if (toAdd.length) {
              await batchSaveMutation.mutateAsync(toAdd)
              setTotalImported(toAdd.length)
            }
            qc.invalidateQueries({ queryKey: ['cards', deckId] })
            setImportState('done')
          }

          if (collisions.length === 0) {
            await saveDirect(cardsToSave, [])
          } else {
            setImportState('review')
            setCollisionPending({
              collisions,
              noCollision,
              blueprint: fieldsRef.current || [],
              onConfirm: async (decisions) => {
                setCollisionPending(null)
                setImportState('generating')
                const toAdd = [...noCollision]
                const toUpdate = []
                for (const { incoming, existing, action } of decisions) {
                  if (action === 'add')    toAdd.push(incoming)
                  if (action === 'update') toUpdate.push({ incoming, existing })
                }
                await saveDirect(toAdd, toUpdate)
              },
            })
          }
        } catch (e) { setImportError(e.message); setImportState('error') }
      },
      error: e => { setImportError(e.message); setImportState('error') },
    })
  }, [deckId, batchSaveMutation, qc]) // eslint-disable-line

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

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
          {[['ai', '✨ AI (fill fields)'], ['direct', '📋 Direct CSV']].map(([v, l]) => (
            <button key={v}
              className="text-xs px-3 py-1.5 rounded-lg transition-all font-medium"
              style={{
                background: importMode === v ? 'var(--bg-card)' : 'transparent',
                color: importMode === v ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: importMode === v ? 'var(--shadow-card)' : 'none',
              }}
              onClick={() => { setImportMode(v); setImportState('idle'); setImportError(null) }}>
              {l}
            </button>
          ))}
        </div>

        {importMode === 'ai' && (
          <>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Drop a CSV with one word per cell — Gemini fills all blueprint fields in batches of {BATCH_SIZE}.
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
              <ImportDone totalImported={totalImported} onReset={() => { setImportState('idle'); setTotalImported(0); progress.reset(1) }} />
            ) : importState === 'review' ? (
              <ImportReviewing />
            ) : (
              <ImportProgress progressMsg={progressMsg} totalImported={totalImported} displayPct={progress.displayPct} barRef={progress.barRef} />
            )}
          </>
        )}

        {importMode === 'direct' && (
          <>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              CSV with headers matching blueprint field keys. First column must be <code className="font-mono">word</code>.
              Optional SRS columns: <code className="font-mono">srs_state</code>, <code className="font-mono">last_reviewed</code>, <code className="font-mono">interval</code>.
            </p>
            <div className="text-xs mb-4 px-3 py-2 rounded-lg font-mono overflow-x-auto"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              word,{fields.filter(f => !MANDATORY_FIELD_KEYS.includes(f.key)).map(f => f.key).join(',')}
            </div>
            {importState === 'idle' || importState === 'error' ? (
              <label onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleDirectCSV(e.dataTransfer.files[0]) }}
                onDragOver={e => e.preventDefault()}
                className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors hover:border-purple-500"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                <span className="text-4xl">📋</span>
                <div className="text-center">
                  <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Drop structured CSV or click to browse</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Headers must match field keys shown above</div>
                </div>
                {importError && (
                  <div className="text-xs px-3 py-2 rounded-lg w-full text-center"
                    style={{ background: 'rgba(225,112,85,0.1)', color: 'var(--accent-danger)', border: '1px solid rgba(225,112,85,.2)' }}>
                    ✕ {importError}
                  </div>
                )}
                <input type="file" accept=".csv,.txt" className="hidden" onChange={e => e.target.files[0] && handleDirectCSV(e.target.files[0])} />
              </label>
            ) : importState === 'done' ? (
              <ImportDone totalImported={totalImported} onReset={() => { setImportState('idle'); setTotalImported(0) }} />
            ) : importState === 'review' ? (
              <ImportReviewing />
            ) : (
              <div className="card p-6 text-center">
                <div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Saving cards…</div>
              </div>
            )}
          </>
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

      {/* ── Collision review modal ──────────────────────── */}
      {collisionPending && (
        <CollisionModal
          collisions={collisionPending.collisions}
          blueprint={collisionPending.blueprint}
          onConfirm={(decisions) => collisionPending.onConfirm(decisions)}
          onClose={() => { setCollisionPending(null); setImportState('done') }}
        />
      )}
    </div>
  )
}

// ── Shared import status sub-components ────────────────────
function ImportDone({ totalImported, onReset }) {
  return (
    <div className="card p-6 text-center">
      <div className="text-4xl mb-3">✅</div>
      <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Import complete!</div>
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{totalImported} card{totalImported !== 1 ? 's' : ''} added.</div>
      <button className="btn-secondary mt-4 text-xs" onClick={onReset}>Import more</button>
    </div>
  )
}

function ImportReviewing() {
  return (
    <div className="card p-6 text-center">
      <div className="text-4xl mb-3">🔍</div>
      <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Reviewing…</div>
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Check the popup to confirm which cards to import.</div>
    </div>
  )
}

function ImportProgress({ progressMsg, totalImported, displayPct, barRef }) {
  const isSaving = progressMsg?.includes('Saving')
  const barColor = isSaving
    ? 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary))'
    : 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))'

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {isSaving ? 'Saving cards…' : progressMsg || 'Generating…'}
        </div>
        <div className="text-sm font-mono tabular-nums" style={{ color: 'var(--accent-primary)' }}>
          {displayPct}%
        </div>
      </div>
      <div className="progress-bar">
        <div ref={barRef} className="import-progress-fill" style={{ width: '0%', background: barColor }} />
      </div>
      {!isSaving && (
        <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {totalImported > 0 ? `${totalImported} card${totalImported !== 1 ? 's' : ''} ready` : 'AI is filling in card fields…'}
        </div>
      )}
    </div>
  )
}

// Keys that are mandatory — always present, cannot be deleted
export const MANDATORY_FIELD_KEYS = ['source_translation', 'context']

// Default definitions for mandatory fields
const MANDATORY_DEFAULTS = {
  source_translation: {
    key: 'source_translation',
    label: 'Translation',
    description: 'A single short translation of the word in the source language. One word or a very short phrase only — no alternatives, no slash-separated variants.',
    field_type: 'text',
    show_on_front: false,
    phonetics: { ruby: 'none', extras: [] },
  },
  context: {
    key: 'context',
    label: 'Context',
    description: 'Grammatical or usage context to disambiguate — e.g. "(masculine singular)", "(verb, informal)", "(pl.)". Shown on card front in Target→Source mode. Leave empty if not needed.',
    field_type: 'text',
    show_on_front: false,
    phonetics: { ruby: 'none', extras: [] },
  },
}

/**
 * Ensure mandatory fields exist in the fields array.
 * If missing, prepend them. Never removes or reorders existing ones.
 */
function ensureMandatoryFields(fields) {
  const result = [...fields]
  for (const key of [...MANDATORY_FIELD_KEYS].reverse()) {
    if (!result.find(f => f.key === key)) {
      result.unshift({ ...MANDATORY_DEFAULTS[key], phonetics: normalisePhonetics(MANDATORY_DEFAULTS[key].phonetics) })
    }
  }
  return result
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
  const isMandatory = MANDATORY_FIELD_KEYS.includes(field.key)

  const setRuby = ruby => onUpdate({ phonetics: { ...ph, ruby } })
  const toggleExtra = key => {
    const next = ph.extras.includes(key) ? ph.extras.filter(k => k !== key) : [...ph.extras, key]
    onUpdate({ phonetics: { ...ph, extras: next } })
  }

  // ── Mandatory field — fully locked, compact display ────────
  if (isMandatory) {
    const descriptions = {
      source_translation: 'Single clean word in your source language. Used as the typing target in Source → Target mode.',
      context: 'Grammatical hint shown on the card front (Target → Source) to disambiguate homographs. Generated in the target language.',
    }
    const colors = {
      source_translation: { bg: 'rgba(0,212,168,.08)', border: 'rgba(0,212,168,.25)', text: 'var(--accent-secondary)', icon: '🎯' },
      context:            { bg: 'var(--accent-glow)',   border: 'rgba(124,106,240,.3)', text: 'var(--accent-primary)',   icon: '💡' },
    }
    const c = colors[field.key] || colors.context
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${c.border}`, background: c.bg }}>
        <div className="p-3 flex items-center gap-3">
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button disabled={isFirst} className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveUp}>▲</button>
            <button disabled={isLast}  className="btn-ghost p-0.5 text-xs disabled:opacity-20" onClick={onMoveDown}>▼</button>
          </div>
          <span style={{ fontSize: '14px' }}>{c.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: c.text }}>{field.label}</span>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{field.key}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>🔒 mandatory</span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{descriptions[field.key]}</div>
          </div>
          <div className="w-7 flex-shrink-0" />
        </div>
      </div>
    )
  }

  // ── Regular editable field ─────────────────────────────────
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
            <input className="input text-sm py-1.5 flex-1 min-w-32" value={field.label}
              onChange={e => onUpdate({ label: e.target.value })} placeholder="Label" />
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

          {/* Phonetics panel — available for all field types */}
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
        </div>

        <button className="btn-ghost p-1.5 text-xs flex-shrink-0" style={{ color: 'var(--accent-danger)' }} onClick={onRemove}>✕</button>
      </div>
    </div>
  )
}

// ── ManualCardForm ──────────────────────────────────────────
function ManualCardForm({ deckId, fields, onSaved }) {
  const [word, setWord] = useState('')
  // fieldValues stores { fieldKey: string } — always plain text per input
  const [fieldValues, setFieldValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const getAnnotationKeys = (ph) => {
    if (!ph) return []
    if (Array.isArray(ph)) return ph.filter(k => k && k !== 'none')
    const keys = []
    if (ph.ruby && ph.ruby !== 'none') keys.push(ph.ruby)
    if (Array.isArray(ph.extras)) keys.push(...ph.extras)
    return keys
  }

  const handleSave = async () => {
    if (!word.trim()) return
    setSaving(true)
    try {
      // Wrap annotated/example field values as [{ text, annotations }]
      const builtFields = {}
      for (const f of fields) {
        const text = fieldValues[f.key] || ''
        if (!text) continue
        const annotationKeys = getAnnotationKeys(f.phonetics)
        const isStructured = annotationKeys.length > 0 || f.field_type === 'example'
        if (!isStructured) {
          builtFields[f.key] = text
        } else {
          const annotations = {}
          for (const ak of annotationKeys) {
            const v = fieldValues[`${f.key}__${ak}`] || ''
            if (v) annotations[ak] = v
          }
          if (f.field_type === 'example') {
            const lines = text.split(' ;;; ').map(s => s.trim()).filter(Boolean)
            const annoByKey = {}
            Object.entries(annotations).forEach(([k, raw]) => {
              annoByKey[k] = String(raw).split(' ;;; ').map(s => s.trim())
            })
            builtFields[f.key] = lines.map((line, i) => {
              const ann = {}
              Object.entries(annoByKey).forEach(([k, arr]) => { if (arr[i]) ann[k] = arr[i] })
              return { text: line, annotations: ann }
            })
          } else {
            builtFields[f.key] = [{ text, annotations }]
          }
        }
      }
      await api.createCard({ deck_id: deckId, word: word.trim(), fields: builtFields })
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
      {fields.map(f => {
        const annotationKeys = getAnnotationKeys(f.phonetics)
        return (
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
              <>
                <textarea className="input text-sm resize-none" rows={2} value={fieldValues[f.key] || ''}
                  onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                  placeholder="e.g. She {{loves}} him. ;;; Their {{love}} is eternal." />
                {annotationKeys.map(ak => (
                  <div key={ak} className="mt-1.5">
                    <label className="section-title block mb-1">{ak}</label>
                    <textarea className="input text-xs resize-none" rows={2}
                      value={fieldValues[`${f.key}__${ak}`] || ''}
                      onChange={e => setFieldValues(v => ({ ...v, [`${f.key}__${ak}`]: e.target.value }))}
                      placeholder={`${ak} — same order, separated by  ;;; `} />
                  </div>
                ))}
              </>
            ) : (
              <>
                <input className="input text-sm" value={fieldValues[f.key] || ''}
                  onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.description || f.label} />
                {annotationKeys.map(ak => (
                  <div key={ak} className="mt-1.5">
                    <label className="section-title block mb-1">{ak}</label>
                    <input className="input text-xs" value={fieldValues[`${f.key}__${ak}`] || ''}
                      onChange={e => setFieldValues(v => ({ ...v, [`${f.key}__${ak}`]: e.target.value }))} />
                  </div>
                ))}
              </>
            )}
          </div>
        )
      })}
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
                const rawPreview = defField ? s.card[defField.key] : ''
                const preview = valueText(rawPreview)
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

// ── CollisionModal ─────────────────────────────────────────
// Shows words that already exist in the deck and lets the user choose
// what to do: update existing fields, add as a new card, or skip.
const COLLISION_ACTIONS = [
  { value: 'update', label: 'Update', sub: 'Overwrite existing card', color: 'var(--accent-primary)' },
  { value: 'add',    label: 'Add',    sub: 'Keep both as new card',   color: 'var(--accent-secondary)' },
  { value: 'skip',   label: 'Skip',   sub: 'Discard incoming',        color: 'var(--text-muted)' },
]

function CollisionModal({ collisions, blueprint, onConfirm, onClose }) {
  // Store { incoming, existing, action } so onConfirm has the existing card id
  const [decisions, setDecisions] = useState(() =>
    collisions.map(({ incoming, existing }) => ({ incoming, existing, action: 'update' }))
  )

  const setAction = (idx, action) =>
    setDecisions(prev => prev.map((d, i) => i === idx ? { ...d, action } : d))

  const skipped  = decisions.filter(d => d.action === 'skip').length
  const imported = decisions.length - skipped

  const defField = blueprint?.find(f => f.key === 'source_translation')
    || blueprint?.find(f => f.key === 'definition')

  return (
    <Modal title="Duplicate Words Detected" onClose={onClose} size="lg">
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        {collisions.length} word{collisions.length !== 1 ? 's' : ''} already exist{collisions.length === 1 ? 's' : ''} in this deck. Choose what to do with each.
      </p>

      <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
        {decisions.map(({ incoming, action }, idx) => {
          const existing   = collisions[idx].existing
          const rawExisting = defField ? existing.fields?.[defField.key] : null
          const rawIncoming = defField ? incoming[defField.key] : null
          const existingVal = valueText(rawExisting)
          const incomingVal = valueText(rawIncoming)

          return (
            <div key={incoming.word + idx} className="rounded-xl p-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="mb-3">
                <div className="font-display font-bold text-base mb-1" style={{ color: 'var(--accent-primary)' }}>
                  {incoming.word}
                </div>
                <div className="flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>
                    <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Existing: </span>
                    {existingVal || '—'}
                  </span>
                  {incomingVal && incomingVal !== existingVal && (
                    <span>
                      <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>New: </span>
                      {incomingVal}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {COLLISION_ACTIONS.map(opt => (
                  <button key={opt.value}
                    className="flex-1 flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-xl border text-xs transition-all"
                    style={{
                      borderColor: action === opt.value ? opt.color : 'var(--border)',
                      background:  action === opt.value ? `rgba(0,0,0,0.2)` : 'transparent',
                      color:       action === opt.value ? opt.color : 'var(--text-secondary)',
                      boxShadow:   action === opt.value ? `0 0 0 1px ${opt.color}` : 'none',
                    }}
                    onClick={() => setAction(idx, opt.value)}>
                    <span className="font-semibold">{opt.label}</span>
                    <span className="opacity-60 text-center leading-tight">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Apply-to-all row */}
      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Apply to all:</span>
        {COLLISION_ACTIONS.map(opt => (
          <button key={opt.value}
            className="btn-ghost text-xs py-1 px-2.5"
            style={{ color: opt.color }}
            onClick={() => setDecisions(prev => prev.map(d => ({ ...d, action: opt.value })))}>
            {opt.label} all
          </button>
        ))}
      </div>

      <div className="flex gap-3 mt-4">
        <button className="btn-secondary flex-1" onClick={onClose}>Cancel import</button>
        <button className="btn-primary flex-1" onClick={() => onConfirm(decisions)}>
          Confirm — {imported} card{imported !== 1 ? 's' : ''}{skipped > 0 ? ` (${skipped} skipped)` : ''}
        </button>
      </div>
    </Modal>
  )
}
