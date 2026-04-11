import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAppStore } from '../store/appStore'
import { getNextIntervalLabel } from '../lib/fsrs'
import { fuzzyMatch, parseCloze, pickRandomExample } from '../lib/fuzzy'
import { shuffle, fontForText } from '../lib/utils'
import { useStudyKeyboard } from '../hooks/useKeyboard'
import { DeckStatsBar } from '../components/shared/StatsBar'
import { useDeckStats } from '../hooks/useDeckStats'
import RubyText from '../components/shared/RubyText'

const fieldText = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(v => v?.text).filter(Boolean).join(' ;;; ')
  if (typeof value === 'object') return value.text || ''
  return String(value)
}

// ─────────────────────────────────────────────
// Card modes:
//   direction:    'targetToSource' | 'sourceToTarget'
//   interaction:  'passive' | 'typing' | 'multipleChoice' | 'cloze'
//
// 'passive'        → show front, flip, manual 1-4 rating
// 'typing'         → show front, type the answer, auto-rate (correct=3, wrong=1)
// 'multipleChoice' → show front, pick from 4 options, auto-rate
// 'cloze'          → show example sentence with blank, type, auto-rate
//
// Auto-rated modes (typing/choice/cloze) do NOT show 1-4 buttons.
// ─────────────────────────────────────────────

export default function StudyPage() {
  const { deckId, mode } = useParams()
  const navigate = useNavigate()
  const { settings, sessionConfigs, saveSessionConfig } = useAppStore()
  const [sessionConfig, setSessionConfig] = useState(null)
  const sessionModeRef = useRef(null)

  // Reset session when mode param changes (learn ↔ freestyle switch)
  useEffect(() => {
    setSessionConfig(null)
    sessionModeRef.current = null
  }, [mode])

  const { data: deck } = useQuery({
    queryKey: ['decks'],
    queryFn: api.getDecks,
    select: (decks) => decks.find(d => d.id === deckId),
  })

  const { data: blueprint = [] } = useQuery({
    queryKey: ['blueprint', deckId],
    queryFn: () => api.getBlueprintFields(deckId),
  })

  const { data: allCards = [] } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => api.getCards(deckId),
  })

  const { data: dueCards = [] } = useQuery({
    queryKey: ['srs', deckId],
    queryFn: () => api.getSRSCards(deckId),
    enabled: mode === 'learn',
  })

  const { stats } = useDeckStats(deckId)

  if (!sessionConfig) {
    return (
      <SessionSetup
        mode={mode}
        deck={deck}
        allCards={allCards}
        dueCards={dueCards}
        blueprint={blueprint}
        settings={settings}
        savedConfig={sessionConfigs?.[deckId]}
        stats={stats}
        onStart={(cfg) => {
          sessionModeRef.current = mode
          saveSessionConfig(deckId, cfg)
          setSessionConfig(cfg)
        }}
        onBack={() => navigate('/')}
      />
    )
  }

  return (
    <StudySession
      deckId={deckId}
      mode={mode}
      deck={deck}
      blueprint={blueprint}
      config={sessionConfig}
      allCards={allCards}
      dueCards={dueCards}
      strictAccents={deck?.strict_accents !== false}
      strictMode={deck?.strict_mode === true}
      animationsEnabled={settings.animationsEnabled !== false}
      onEnd={() => setSessionConfig(null)}
    />
  )
}

// ─────────────────────────────────────────────
// SESSION SETUP
// ─────────────────────────────────────────────
function SessionSetup({ mode, deck, allCards, dueCards, blueprint, settings, savedConfig, stats, onStart, onBack }) {
  const exampleField = blueprint.find(f => f.field_type === 'example')
  const sourceField = blueprint.find(f => f.key === 'definition') || blueprint.find(f => f.key === 'reading') || blueprint[0]

  const [config, setConfig] = useState({
    batchSize: savedConfig?.batchSize ?? settings.defaultBatchSize ?? 20,
    cardPool: savedConfig?.cardPool ?? 'all',
    randomise: savedConfig?.randomise ?? true,
    direction: savedConfig?.direction ?? 'targetToSource',
    interaction: savedConfig?.interaction ?? 'passive',
  })

  const availableCount = (() => {
    if (mode === 'learn') return dueCards.length + (stats.new || 0)
    const pool = config.cardPool === 'seen'   ? allCards.filter(c => c.seen)
               : config.cardPool === 'unseen' ? allCards.filter(c => !c.seen)
               : allCards
    return pool.length
  })()

  // Cloze only makes sense sourceToTarget (fill in the target word from context)
  // and only when there's an example field
  const clozeAvailable = !!exampleField && config.direction === 'sourceToTarget'

  // If direction changes and cloze is no longer available, fall back to passive
  const prevDirection = useRef(config.direction)
  useEffect(() => {
    if (prevDirection.current !== config.direction) {
      prevDirection.current = config.direction
      if (config.interaction === 'cloze' && !clozeAvailable) {
        setConfig(c => ({ ...c, interaction: 'passive' }))
      }
    }
  }, [config.direction, clozeAvailable]) // eslint-disable-line
  const sourceLang = deck?.source_language || 'English'
  const targetLang = deck?.target_language || 'Target'

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <button className="btn-ghost mb-6 flex items-center gap-2 text-sm" onClick={onBack}>← Back</button>

      <div className="section-title mb-1">{deck?.name}</div>
      <h1 className="font-display text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {mode === 'learn' ? '🧠 Learn' : '🎯 Freestyle'}
      </h1>

      {mode === 'learn' ? (
        <div className="card p-5 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="text-center">
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--accent-danger)' }}>{dueCards.length}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Due for review</div>
            </div>
            <div className="text-center">
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--accent-secondary)' }}>{stats.new || 0}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>New cards</div>
            </div>
          </div>
          <DeckStatsBar stats={stats} />
        </div>
      ) : (
        <div className="card p-4 mb-6">
          <DeckStatsBar stats={stats} />
          <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{availableCount} cards in pool</div>
        </div>
      )}

      <div className="card p-5 space-y-5 mb-6">
        {/* Direction */}
        <div>
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Card direction</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'targetToSource', label: `${targetLang} →`, sub: sourceLang },
              { v: 'sourceToTarget', label: `${sourceLang} →`, sub: targetLang },
            ].map(({ v, label, sub }) => (
              <button key={v}
                className="flex flex-col items-center p-3 rounded-xl border transition-all text-sm"
                style={{ borderColor: config.direction === v ? 'var(--accent-primary)' : 'var(--border)', background: config.direction === v ? 'var(--accent-glow)' : 'transparent', color: config.direction === v ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                onClick={() => setConfig(c => ({ ...c, direction: v }))}>
                <span className="font-medium">{label}</span>
                <span className="text-xs mt-0.5" style={{ color: config.direction === v ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Interaction */}
        <div>
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Study mode</div>
          <div className="space-y-1.5">
            {[
              { v: 'passive',        label: '👁 Passive',         sub: 'Flip card, rate 1–4 yourself',         available: true },
              { v: 'typing',         label: '⌨ Typing',           sub: 'Type the answer — auto-rated',          available: true },
              { v: 'multipleChoice', label: '🔲 Multiple choice',  sub: 'Pick from 4 options — auto-rated',      available: allCards.length >= 4 },
              { v: 'cloze',          label: '✦ Cloze',            sub: 'Fill in the blank from example',        available: clozeAvailable },
            ].map(({ v, label, sub, available }) => (
              <button key={v} disabled={!available}
                className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-40"
                style={{ borderColor: config.interaction === v ? 'var(--accent-primary)' : 'var(--border)', background: config.interaction === v ? 'var(--accent-glow)' : 'transparent' }}
                onClick={() => available && setConfig(c => ({ ...c, interaction: v }))}>
                <span className="text-sm font-medium flex-1" style={{ color: config.interaction === v ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                  {label}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</span>
              </button>
            ))}
          </div>
        </div>

        <ConfigRow label="Batch size" desc="Cards per session">
          <input type="number" min={1} max={500} className="input w-24 text-center"
            value={config.batchSize}
            onChange={e => setConfig(c => ({ ...c, batchSize: Math.max(1, Number(e.target.value)) }))} />
        </ConfigRow>

        {mode === 'freestyle' && (
          <ConfigRow label="Card pool">
            <div className="flex gap-2">
              {[['all','All'],['seen','Seen'],['unseen','Unseen']].map(([v, l]) => (
                <SegmentButton key={v} label={l} active={config.cardPool === v}
                  onClick={() => setConfig(c => ({ ...c, cardPool: v }))} />
              ))}
            </div>
          </ConfigRow>
        )}

        <ConfigRow label="Randomise order">
          <Toggle value={config.randomise} onChange={v => setConfig(c => ({ ...c, randomise: v }))} />
        </ConfigRow>
      </div>

      <button className="btn-primary w-full text-base py-3"
        onClick={() => onStart(config)} disabled={availableCount === 0}>
        {availableCount === 0
          ? (mode === 'learn' ? 'Nothing due — great job!' : 'No cards in pool')
          : `Start →`}
      </button>
    </div>
  )
}

function ConfigRow({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        {desc && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}

function SegmentButton({ label, active, onClick }) {
  return (
    <button className="text-xs px-3 py-1.5 rounded-lg border transition-all" onClick={onClick}
      style={{ borderColor: active ? 'var(--accent-primary)' : 'var(--border)', color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', background: active ? 'var(--accent-glow)' : 'transparent' }}>
      {label}
    </button>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button role="switch" aria-checked={value}
      className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0"
      style={{ background: value ? 'var(--accent-primary)' : 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      onClick={() => onChange(!value)}>
      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white"
        style={{ left: value ? '24px' : '3px', transition: 'left 0.2s' }} />
    </button>
  )
}

// ─────────────────────────────────────────────
// STUDY SESSION
// ─────────────────────────────────────────────
function StudySession({ deckId, mode, deck, blueprint, config, allCards, dueCards, strictAccents = true, strictMode = false, animationsEnabled = true, onEnd }) {
  const qc = useQueryClient()
  const exampleField = blueprint.find(f => f.field_type === 'example')

  const queue = useRef([])
  const [queueReady, setQueueReady] = useState(false)
  const [cardIdx, setCardIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0, again: 0, hard: 0 })

  const [phase, setPhase] = useState('prompt')
  const [lastResult, setLastResult] = useState(null)
  const [typingAnswer, setTypingAnswer] = useState('')
  const [choiceSelected, setChoiceSelected] = useState(null)
  const [clozeAnswer, setClozeAnswer] = useState('')
  const [choices, setChoices] = useState([])

  // Card flip fix:
  // frontCardIdx updates immediately when advancing (new front is visible as card rotates back)
  // backCardIdx updates after the 500ms animation (old back stays visible during rotation)
  const [frontCardIdx, setFrontCardIdx] = useState(0)
  const [backCardIdx, setBackCardIdx]   = useState(0)
  const flipTimerRef = useRef(null)

  // Focus refs
  const typingInputRef    = useRef(null)
  const clozeInputRef     = useRef(null)
  const continueButtonRef = useRef(null)

  const typingAssist = useMemo(() => extractTypingAssist(allCards), [allCards])

  const insertIntoInput = (input, setValue, text) => {
    if (!input) { setValue(prev => prev + text); return }
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const next = input.value.slice(0, start) + text + input.value.slice(end)
    setValue(next)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const applyMarkToInput = (input, setValue, preset) => {
    if (!input) return
    const cursor = input.selectionStart ?? input.value.length
    const next = applyCombiningMark(input.value, cursor, preset)
    setValue(next.value)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(next.cursor, next.cursor)
    })
  }

  const romanisedCandidates = (card) => {
    if (!deck?.allow_latin_typing) return []
    const candidates = new Set()
    const reading = card?.fields?.reading
    const readText = fieldText(reading)
    if (readText) candidates.add(readText)
    if (card?.fields?._latin) candidates.add(String(card.fields._latin))
    for (const v of Object.values(card?.fields || {})) {
      if (Array.isArray(v)) {
        v.forEach(it => {
          Object.entries(it?.annotations || {}).forEach(([k, val]) => {
            if (ROMANISATION_KEYS.includes(k) && val) candidates.add(String(val))
          })
        })
      } else if (v && typeof v === 'object') {
        Object.entries(v).forEach(([k, val]) => {
          if (ROMANISATION_KEYS.includes(k) && val) candidates.add(String(val))
        })
      }
    }
    return Array.from(candidates)
  }

  const bestMatch = (input, expectedList) => {
    let best = { correct: false, similarity: 0, exact: false }
    let bestAnswer = expectedList[0] || ''
    expectedList.forEach(ans => {
      const r = fuzzyMatch(input, ans || '', { strictAccents, strictMode })
      if (r.correct || r.similarity > best.similarity) {
        best = r
        bestAnswer = ans
      }
    })
    return { ...best, answer: bestAnswer }
  }

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }) => api.recordReview(cardId, rating),
    onSuccess: (updated) => {
      qc.setQueryData(['cards', deckId], old => old?.map(c => c.id === updated.id ? updated : c))
      qc.invalidateQueries({ queryKey: ['srs', deckId] })
    },
  })

  useEffect(() => {
    let cards = []
    if (mode === 'learn') {
      const due = config.randomise ? shuffle([...dueCards]) : [...dueCards]
      const dueLimited = due.slice(0, config.batchSize)
      const needed = config.batchSize - dueLimited.length
      const newPool = allCards.filter(c => c.srs_state === 'new' || (c.repetitions === 0 && !c.seen))
      cards = [...dueLimited, ...(needed > 0 ? newPool.slice(0, needed) : [])]
    } else {
      let pool = config.cardPool === 'seen'   ? allCards.filter(c => c.seen)
               : config.cardPool === 'unseen' ? allCards.filter(c => !c.seen)
               : allCards
      if (config.randomise) pool = shuffle([...pool])
      cards = pool.slice(0, config.batchSize)
    }
    queue.current = cards
    setQueueReady(true)
  }, []) // eslint-disable-line

  const currentCard  = queueReady ? queue.current[cardIdx]      : null
  const frontCard    = queueReady ? queue.current[frontCardIdx]  : null
  const backCard     = queueReady ? queue.current[backCardIdx]   : null
  const total        = queue.current.length
  const sessionProgress = total > 0 ? (cardIdx / total) * 100 : 0

  // Memoize clozeData by card id — must be above early returns (rules of hooks)
  const clozeData = useMemo(() => {
    if (config.interaction !== 'cloze' || !exampleField || !currentCard) return { hasCloze: false }
    const fieldVal = currentCard.fields?.[exampleField.key]
    const raw = fieldText(fieldVal)
    return parseCloze(raw)
  }, [currentCard?.id, config.interaction, exampleField?.key]) // eslint-disable-line

  // Generate multiple choice options when card changes
  useEffect(() => {
    if (!currentCard || config.interaction !== 'multipleChoice') return
    const correctAnswer = getAnswer(currentCard, config.direction, blueprint, deck)
    const others = allCards
      .filter(c => c.id !== currentCard.id)
      .map(c => getAnswer(c, config.direction, blueprint, deck))
      .filter(Boolean)
    const wrong = shuffle(others).slice(0, 3)
    setChoices(shuffle([correctAnswer, ...wrong]))
  }, [cardIdx, queueReady]) // eslint-disable-line

  const resetCard = () => {
    setPhase('prompt')
    setLastResult(null)
    setTypingAnswer('')
    setChoiceSelected(null)
    setClozeAnswer('')
  }

  // Focus the active input whenever we enter the prompt phase.
  // When animations are off, focus immediately (no transition to wait for).
  // When animations are on, wait 60ms for the height:auto transition to complete.
  useEffect(() => {
    if (phase !== 'prompt') return
    const delay = animationsEnabled ? 60 : 0
    const id = setTimeout(() => {
      if (config.interaction === 'typing') typingInputRef.current?.focus()
      else if (config.interaction === 'cloze') clozeInputRef.current?.focus()
    }, delay)
    return () => clearTimeout(id)
  }, [phase, config.interaction, animationsEnabled])

  // Cleanup flip timer on unmount
  useEffect(() => () => { if (flipTimerRef.current) clearTimeout(flipTimerRef.current) }, [])

  const isPassive = config.interaction === 'passive'
  const isActive  = !isPassive

  const advance = (rating) => {
    if (!currentCard) return
    if (mode === 'learn') reviewMutation.mutate({ cardId: currentCard.id, rating })
    if (!currentCard.seen) api.updateCard(currentCard.id, { seen: true }).catch(() => {})
    setSessionStats(s => ({
      reviewed: s.reviewed + 1,
      correct: s.correct + (rating >= 3 ? 1 : 0),
      again: s.again + (rating === 1 ? 1 : 0),
      hard: s.hard + (rating === 2 ? 1 : 0),
    }))
    const next = cardIdx + 1
    if (next >= total) { setDone(true); return }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setCardIdx(next)
    setFrontCardIdx(next)
    if (!animationsEnabled) {
      setBackCardIdx(next)
      resetCard()
      return
    }
    setPhase('flipping-back')
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    flipTimerRef.current = setTimeout(() => {
      setBackCardIdx(next)
      resetCard()
    }, 500)
  }

  const advanceActive = () => {
    if (!currentCard) return
    if (!currentCard.seen && mode !== 'learn') {
      api.updateCard(currentCard.id, { seen: true }).catch(() => {})
    }
    if (isActive && mode !== 'learn') {
      const rating = lastResult?.correct ? 3 : 1
      setSessionStats(s => ({
        reviewed: s.reviewed + 1,
        correct: s.correct + (rating >= 3 ? 1 : 0),
        again: s.again + (rating === 1 ? 1 : 0),
        hard: 0,
      }))
    }
    const next = cardIdx + 1
    if (next >= total) { setDone(true); return }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setCardIdx(next)
    setFrontCardIdx(next)
    if (!animationsEnabled) {
      setBackCardIdx(next)
      resetCard()
      return
    }
    setPhase('flipping-back')
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    flipTimerRef.current = setTimeout(() => {
      setBackCardIdx(next)
      resetCard()
    }, 500)
  }

  const reveal = (result = null) => {
    setLastResult(result)
    setPhase('revealed')
    // Blur active input so Space/Enter fires the keyboard handler, not the input
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (isActive && result !== null && mode === 'learn') {
      const autoRating = result.correct
        ? (config.interaction === 'multipleChoice' ? 2 : 3)
        : 1
      reviewMutation.mutate({ cardId: currentCard.id, rating: autoRating })
      if (!currentCard.seen) api.updateCard(currentCard.id, { seen: true }).catch(() => {})
      setSessionStats(s => ({
        reviewed: s.reviewed + 1,
        correct: s.correct + (autoRating >= 3 ? 1 : 0),
        again: s.again + (autoRating === 1 ? 1 : 0),
        hard: s.hard + (autoRating === 2 ? 1 : 0),
      }))
    }
  }

  const submitTyping = () => {
    if (!currentCard || phase !== 'prompt') return
    const expected = getAnswer(currentCard, config.direction, blueprint, deck)
    const expectedList = [expected, ...(config.direction === 'sourceToTarget' ? romanisedCandidates(currentCard) : [])].filter(Boolean)
    const result = bestMatch(typingAnswer, expectedList)
    reveal({ ...result, answer: expected, typed: typingAnswer })
  }

  const submitCloze = () => {
    if (!currentCard || phase !== 'prompt') return
    const fieldVal = currentCard.fields?.[exampleField?.key]
    const raw = fieldText(fieldVal)
    const clozeData = parseCloze(raw)
    const expectedList = [clozeData.answer, ...(config.direction === 'sourceToTarget' ? romanisedCandidates(currentCard) : [])].filter(Boolean)
    const result = bestMatch(clozeAnswer, expectedList)
    reveal({ ...result, answer: clozeData.answer, typed: clozeAnswer })
  }

  const submitChoice = (choice) => {
    if (phase !== 'prompt') return
    const correct = getAnswer(currentCard, config.direction, blueprint, deck)
    const isCorrect = choice === correct
    setChoiceSelected(choice)
    reveal({ correct: isCorrect, answer: correct, chosen: choice })
  }

  useStudyKeyboard({
    phase,
    isPassive,
    onReveal: () => reveal(null),
    onAdvance: advanceActive,
    onRate: (r) => advance(r),
    onDigit: (digit) => {
      if (config.interaction !== 'multipleChoice' || phase !== 'prompt') return
      const choice = choices[digit - 1]
      if (choice !== undefined) submitChoice(choice)
    },
    onExit: onEnd,
    enabled: !done,
  })

  if (!queueReady) {
    return <div className="flex items-center justify-center h-64"><div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Building session...</div></div>
  }
  if (done || total === 0) {
    return <SessionComplete stats={sessionStats} total={total} mode={mode} onEnd={onEnd} />
  }

  const card      = currentCard   // SRS logic target
  const front     = frontCard ? getFront(frontCard, config.direction, blueprint, deck, exampleField) : null

  // flipped: card shows back; flipping-back: card rotating back to face-down
  const isRevealed    = phase === 'revealed'
  const isPrompt      = phase === 'prompt'
  const isFlipped     = phase === 'revealed'

  if (!card || !front || !frontCard || !backCard) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button className="btn-ghost text-lg leading-none p-1.5 flex-shrink-0" onClick={onEnd} title="Exit">✕</button>
        <div className="flex-1">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${sessionProgress}%` }} />
          </div>
        </div>
        <div className="text-xs flex-shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {cardIdx + 1} / {total}
        </div>
        {mode === 'learn' && card && (
          <div className="text-xs flex-shrink-0 px-2 py-0.5 rounded-full"
            style={{ background: card.srs_state === 'new' ? 'var(--accent-glow)' : 'rgba(0,212,168,.1)', color: card.srs_state === 'new' ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
            {card.srs_state === 'new' || card.repetitions === 0 ? '✦ New' : '↻ Review'}
          </div>
        )}
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5">

        {/* ── The flip card — shown in all modes ── */}
        <PassiveCard
          frontCard={frontCard}
          backCard={backCard}
          front={front}
          blueprint={blueprint}
          flipped={isFlipped}
          deck={deck}
          animationsEnabled={animationsEnabled}
          onFlip={config.interaction === 'passive' ? () => reveal(null) : null}
          resultBadge={lastResult && isRevealed
            ? { correct: lastResult.correct, label: lastResult.correct ? `✓ ${Math.round((lastResult.similarity || 1) * 100)}%` : `✗ ${lastResult.answer || ''}` }
            : null}
        />

        {/* ── Prompt / input area — collapses to zero height when not in prompt phase ── */}
        <div className="w-full max-w-lg" style={{
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          opacity: isPrompt ? 1 : 0,
          transform: isPrompt ? 'translateY(0)' : 'translateY(6px)',
          pointerEvents: isPrompt ? 'auto' : 'none',
          height: isPrompt ? 'auto' : 0,
          overflow: 'hidden',
        }}>
          {config.interaction === 'passive' && (
            <button className="btn-primary w-full py-3 text-base" onClick={() => reveal(null)}>
              Reveal → <span className="text-xs opacity-50 ml-1">[Space]</span>
            </button>
          )}

          {config.interaction === 'typing' && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">
                  Type the {config.direction === 'targetToSource' ? (deck?.source_language || 'English') : deck?.target_language} answer
                </div>
                {!front.isTarget && front.context && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)', border: '1px solid rgba(124,106,240,.2)' }}>
                    {front.context}
                  </span>
                )}
              </div>
              <input ref={typingInputRef} className="input text-base" value={typingAnswer}
                onChange={e => setTypingAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitTyping()}
                placeholder="Your answer..." data-accent-input="1" />
              {typingAssist && config.direction === 'sourceToTarget' && (
                <AccentBar assist={typingAssist}
                  onInsert={ch => insertIntoInput(typingInputRef.current, setTypingAnswer, ch)}
                  onApplyMark={preset => applyMarkToInput(typingInputRef.current, setTypingAnswer, preset)} />
              )}
              <button className="btn-primary mt-3 w-full" onClick={submitTyping}>Check</button>
            </div>
          )}

          {config.interaction === 'multipleChoice' && (
            <div className="grid grid-cols-1 gap-2">
              {choices.map((choice, i) => (
                <button key={i}
                  className="w-full text-left px-4 py-3 rounded-xl border text-sm transition-all"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'transparent' }}
                  onClick={() => submitChoice(choice)}>
                  <span className="mr-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {`${i + 1}. ${['A','B','C','D'][i]}`}
                  </span>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {config.interaction === 'cloze' && (
            clozeData.hasCloze ? (
              <div className="card p-5">
                {/* Show source language hint — the definition, NOT the target word (that's the answer) */}
                {(() => {
                  const hintField = blueprint.find(f => f.key === 'source_translation')
                    || blueprint.find(f => f.key === 'definition')
                    || blueprint.find(f => f.key === 'reading')
                  const hint = hintField ? card.fields?.[hintField.key] : null
                  const ctx  = card.fields?.context || null
                  return hint ? (
                    <div className="flex items-center justify-between mb-3">
                      <div className="section-title">{deck?.source_language || 'English'}</div>
                      <div className="text-right">
                        <div className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>{hint}</div>
                        {ctx && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{ctx}</div>}
                      </div>
                    </div>
                  ) : (
                    <div className="section-title mb-3">Complete the sentence</div>
                  )
                })()}
                <div className="text-center leading-loose mb-4"
                  style={{ color: 'var(--text-primary)', fontSize: '17px', fontFamily: fontForText(clozeData.before + clozeData.after) }}>
                  {clozeData.before}
                  <input
                    ref={clozeInputRef}
                    className="cloze-input"
                    style={{ width: `${Math.max((clozeData.answer?.length || 4) + 2, 4) * 0.95}em`, fontFamily: fontForText(clozeData.answer || '') }}
                    value={clozeAnswer}
                    onChange={e => setClozeAnswer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitCloze()}
                    data-accent-input="1"
                  />
                  {clozeData.after}
                </div>
                {typingAssist && config.direction === 'sourceToTarget' && (
                  <AccentBar assist={typingAssist}
                    onInsert={ch => insertIntoInput(clozeInputRef.current, setClozeAnswer, ch)}
                    onApplyMark={preset => applyMarkToInput(clozeInputRef.current, setClozeAnswer, preset)} />
                )}
                <button className="btn-primary mt-3 w-full" onClick={submitCloze}>Check</button>
              </div>
            ) : (
              <div className="card p-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No example sentence. <button className="btn-ghost text-sm" onClick={advanceActive}>Skip →</button>
              </div>
            )
          )}
        </div>

        {/* ── Rating buttons — only visible when revealed, takes no space otherwise ── */}
        <div className="w-full max-w-lg" style={{
          transition: isRevealed ? 'opacity 0.25s ease 0.15s, transform 0.25s ease 0.15s' : 'none',
          opacity: isRevealed ? 1 : 0,
          transform: isRevealed ? 'translateY(0)' : 'translateY(10px)',
          pointerEvents: isRevealed ? 'auto' : 'none',
          height: isRevealed ? 'auto' : 0,
          overflow: 'hidden',
        }}>
          {/* Show choice result colours when in multipleChoice mode */}
          {config.interaction === 'multipleChoice' && lastResult && (
            <div className="grid grid-cols-1 gap-2 mb-4">
              {choices.map((choice, i) => {
                const correct = choice === getAnswer(card, config.direction, blueprint, deck)
                const isChosen = choice === lastResult.chosen
                let borderColor = 'var(--border)'
                let bg = 'transparent'
                if (correct) { borderColor = 'var(--accent-secondary)'; bg = 'rgba(0,212,168,.08)' }
                else if (isChosen) { borderColor = 'var(--accent-danger)'; bg = 'rgba(225,112,85,.08)' }
                return (
                  <div key={i} className="w-full text-left px-4 py-3 rounded-xl border text-sm"
                    style={{ borderColor, background: bg, color: 'var(--text-primary)' }}>
                    <span className="mr-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{`${i + 1}. ${['A','B','C','D'][i]}`}</span>
                    {choice}
                  </div>
                )
              })}
            </div>
          )}

          {/* Typing/cloze result */}
          {(config.interaction === 'typing' || config.interaction === 'cloze') && lastResult && (
            <div className="text-sm text-center mb-4 space-y-1">
              {lastResult.correct ? (
                <div className="font-medium" style={{ color: 'var(--accent-secondary)' }}>
                  ✓ Correct! {lastResult.similarity < 1 && `(${Math.round(lastResult.similarity * 100)}%)`}
                </div>
              ) : (
                <>
                  <div style={{ color: 'var(--accent-danger)' }}>
                    <span className="font-medium">✗ You typed: </span>
                    <span className="font-mono">{lastResult.typed || '—'}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    <span>Correct: </span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{lastResult.answer}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Active modes: just advance (SRS already recorded) */}
          {isActive ? (
            <button ref={continueButtonRef} className="btn-secondary w-full py-3 text-sm" onClick={advanceActive}>
              Continue <span className="opacity-40 ml-1 text-xs">[Space]</span>
            </button>
          ) : mode === 'learn' ? (
            <div>
              <div className="section-title text-center mb-3">How well did you know this?</div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { rating: 1, label: 'Again', cls: 'again', key: '1' },
                  { rating: 2, label: 'Hard',  cls: 'hard',  key: '2' },
                  { rating: 3, label: 'Good',  cls: 'good',  key: '3' },
                  { rating: 4, label: 'Easy',  cls: 'easy',  key: '4' },
                ].map(({ rating, label, cls, key }) => (
                  <button key={rating} className={`rating-btn ${cls}`} onClick={() => advance(rating)}>
                    <span className="text-xs font-medium">{label}</span>
                    <span className="text-xs opacity-60">{getNextIntervalLabel(card, rating)}</span>
                    <span className="text-xs opacity-30">[{key}]</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button className="btn-danger flex-1 py-3" onClick={() => advance(1)}>✗ Didn't know</button>
              <button className="btn-primary flex-1 py-3" onClick={() => advance(3)}>✓ Got it</button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Helper: what to show on front ──────────────────────────
function getFront(card, direction, blueprint, deck, exampleField) {
  const contextLanguage = deck?.context_language || 'target'

  if (direction === 'targetToSource') {
    const context = card.fields?.context || null
    let clozeSentence = null
    if (contextLanguage === 'cloze' && exampleField) {
      const fieldVal = card.fields?.[exampleField.key]
      const raw = fieldText(fieldVal)
      if (raw) {
        const { before, answer, after, hasCloze } = parseCloze(raw)
        clozeSentence = hasCloze ? { before, answer, after } : null
      }
    }
    return {
      word: card.word,
      label: deck?.target_language || 'Word',
      isTarget: true,
      context: contextLanguage !== 'cloze' ? context : null,
      clozeSentence,
    }
  }

  // sourceToTarget: show source_translation as the prompt (always a plain string)
  const srcField = blueprint.find(f => f.key === 'source_translation')
    || blueprint.find(f => f.key === 'definition')
    || blueprint.find(f => f.key === 'reading')
    || blueprint[0]
  const rawVal = srcField ? card.fields?.[srcField.key] : null
  // source_translation is always a plain string, but guard for object shape just in case
  const val = fieldText(rawVal)
  return {
    word: val || card.word,
    label: deck?.source_language || 'Source',
    isTarget: false,
    context: null,
    clozeSentence: null,
    fieldKey: srcField?.key,
    field: srcField,
  }
}

// ── Helper: what counts as the correct answer ──────────────
function getAnswer(card, direction, blueprint, deck) {
  if (direction === 'targetToSource') {
    const srcField = blueprint.find(f => f.key === 'source_translation')
      || blueprint.find(f => f.key === 'definition')
      || blueprint.find(f => f.key === 'reading')
      || blueprint[0]
    const raw = srcField ? card.fields?.[srcField.key] : null
    // Fields may be objects { text, ... } or plain strings
    return fieldText(raw) || card.word
  }
  return card.word
}

// ── PassiveCard — 3D flip card ─────────────────────────────
function PassiveCard({ frontCard, backCard, front, blueprint, flipped, deck, onFlip, resultBadge, animationsEnabled = true }) {
  const frontField = blueprint.find(f => f.show_on_front && f.key !== 'context')

  return (
    <div className="w-full max-w-lg card-3d"
      style={{ cursor: !flipped && onFlip ? 'pointer' : 'default', height: '280px', position: 'relative' }}
      onClick={!flipped && onFlip ? onFlip : undefined}>
      <div
        className={`card-inner w-full h-full ${flipped ? 'flipped' : ''}`}
        style={{ position: 'relative', transition: animationsEnabled ? undefined : 'none' }}
      >

        {/* FRONT — uses frontCard, updates immediately on advance */}
        <div className="card-face card-elevated flex flex-col items-center justify-center p-8 rounded-2xl select-none">
          <div className="section-title mb-3">{front.label}</div>
          <div className="font-display text-5xl font-bold text-center leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: fontForText(front.word) }}>
            {front.word}
          </div>

          {/* Context — shown on targetToSource front to disambiguate homographs.
              Either a short text hint (context field) or a cloze sentence with blank. */}
          {front.isTarget && front.clozeSentence && (
            <div className="mt-3 px-3 py-2 rounded-lg text-center w-full"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: fontForText(front.clozeSentence.before + front.clozeSentence.after) }}>
                {front.clozeSentence.before}
                <span className="px-1.5 rounded font-medium" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>___</span>
                {front.clozeSentence.after}
              </div>
            </div>
          )}
          {front.isTarget && front.context && !front.clozeSentence && (
            <div className="mt-3 px-3 py-1.5 rounded-lg text-center"
              style={{ background: 'var(--accent-glow)', border: '1px solid rgba(124,106,240,.2)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--accent-primary)', fontFamily: fontForText(front.context) }}>
                {front.context}
              </div>
            </div>
          )}

          {/* show_on_front field — e.g. reading/phonetic */}
          {front.isTarget && frontField && frontCard?.fields?.[frontField.key] && (
            <div className="mt-3 text-base" style={{ color: 'var(--text-secondary)', fontFamily: fontForText(frontCard.fields[frontField.key]) }}>
              {frontCard.fields[frontField.key]}
            </div>
          )}
          {onFlip && (
            <div className="absolute bottom-4 text-xs" style={{ color: 'var(--text-muted)' }}>tap to reveal · Space</div>
          )}
        </div>

        {/* BACK — uses backCard, updates after flip-back animation to avoid leaking next answer */}
        <div className="card-face card-back card-elevated flex flex-col p-6 rounded-2xl overflow-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)', fontFamily: fontForText(backCard?.word || '') }}>
              {backCard?.word}
            </div>
            {backCard?.interval > 0 && <span className="tag text-xs">{backCard.interval}d interval</span>}
            {resultBadge && (
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: resultBadge.correct ? 'rgba(0,212,168,.15)' : 'rgba(225,112,85,.15)', color: resultBadge.correct ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>
                {resultBadge.label}
              </span>
            )}
          </div>
          <div className="space-y-2.5 flex-1 overflow-auto">
            {blueprint.map(field => {
              const value = backCard?.fields?.[field.key]
              // value may be a string (unannotated) or object { text, ... } (annotated/example)
              const textVal = fieldText(value)
              if (!textVal) return null
              return (
                <div key={field.key} className="flex gap-2 min-w-0">
                  <span className="section-title flex-shrink-0 mt-0.5 truncate" style={{ width: '110px' }} title={field.label}>{field.label}</span>
                  <div className="flex-1 min-w-0 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {field.field_type === 'example'
                      ? <ExampleDisplay fieldValue={value} cardId={backCard?.id} />
                      : <RubyText fieldValue={value} phonetics={field.phonetics} />
                    }
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PromptCard — non-flipping, just shows the prompt ───────
function PromptCard({ front, deck }) {
  return (
    <div className="card-elevated flex flex-col items-center justify-center p-8 rounded-2xl" style={{ minHeight: '140px' }}>
      <div className="section-title mb-3">{front.label}</div>
      <div className="font-display text-4xl font-bold text-center leading-tight"
        style={{ color: 'var(--text-primary)', fontFamily: fontForText(front.word) }}>
        {front.word}
      </div>
    </div>
  )
}

function ExampleDisplay({ fieldValue, cardId }) {
  const pickIndex = (count) => {
    if (count <= 1) return 0
    const seed = String(cardId || '')
    let hash = 0
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    return Math.abs(hash) % count
  }

  // Preferred shape: [{ text, annotations: { ... } }, ...]
  if (Array.isArray(fieldValue)) {
    const rows = fieldValue.filter(v => v && typeof v === 'object' && v.text)
    const idx = pickIndex(rows.length)
    const picked = rows[idx] || rows[0]
    if (!picked) return null
    const sentence = picked.text
    const annotations = Object.entries(picked.annotations || {})
    return renderExample(sentence, annotations)
  }

  // Legacy shape fallback
  const raw = fieldValue && typeof fieldValue === 'object' ? fieldValue.text : (fieldValue || '')
  const annotations = fieldValue && typeof fieldValue === 'object'
    ? Object.entries(fieldValue).filter(([k]) => k !== 'text')
    : []

  // Pick a sentence index once per card — same index applies to all annotation lines
  const sentenceParts = raw.split(' ;;; ').map(s => s.trim()).filter(Boolean)
  const idx = pickIndex(sentenceParts.length)
  const sentence = sentenceParts[idx] || raw

  return renderExample(sentence, annotations.map(([key, annoRaw]) => [key, annoPartsFor(annoRaw, idx)]))
}

function annoPartsFor(annoRaw, idx) {
  const annoParts = (annoRaw || '').split(' ;;; ').map(s => s.trim()).filter(Boolean)
  return annoParts[idx] || annoRaw || ''
}

function renderExample(sentence, annotations) {
  const renderSentence = (text) => {
    const { before: b, answer: a, after: af, hasCloze: hc } = parseCloze(text)
    if (!hc) return <span>{text}</span>
    return (
      <>
        {b}
        <mark style={{ background: 'rgba(124,106,240,0.2)', color: 'var(--accent-primary)', borderRadius: '3px', padding: '0 3px' }}>
          {a}
        </mark>
        {af}
      </>
    )
  }
  return (
    <span style={{ color: 'var(--text-primary)', fontFamily: fontForText(sentence) }}>
      {renderSentence(sentence)}
      {annotations.map(([key, annoSentence]) => {
        if (!annoSentence) return null
        return (
          <span key={key} className="block text-xs mt-1" style={{ color: 'var(--text-muted)', fontFamily: fontForText(annoSentence) }}>
            {renderSentence(annoSentence)}
          </span>
        )
      })}
    </span>
  )
}

// ─────────────────────────────────────────────
// SESSION COMPLETE
// ─────────────────────────────────────────────
function SessionComplete({ stats, total, mode, onEnd }) {
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0
  const emoji = pct >= 90 ? '🎉' : pct >= 70 ? '💪' : pct >= 50 ? '📖' : '🔄'

  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center animate-slide-up">
      <div className="text-6xl mb-6">{total === 0 ? '✅' : emoji}</div>
      <h2 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        {total === 0 ? 'All done!' : 'Session complete!'}
      </h2>
      <div className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        {total === 0 ? 'No cards available.' : `You reviewed ${stats.reviewed} card${stats.reviewed !== 1 ? 's' : ''}.`}
      </div>

      {stats.reviewed > 0 && (
        <div className="card p-5 mb-6">
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Reviewed', value: stats.reviewed },
              { label: 'Correct',  value: stats.correct,  color: 'var(--accent-secondary)' },
              { label: 'Hard',     value: stats.hard,     color: '#fdcb6e' },
              { label: 'Again',    value: stats.again,    color: 'var(--accent-danger)' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="font-display text-2xl font-bold" style={{ color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div className="progress-bar mb-2">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{pct}% correct</div>
        </div>
      )}

      <button className="btn-primary w-full py-3 text-base" onClick={onEnd}>← Back to Setup</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// ACCENT KEYBOARD HELPERS
// ─────────────────────────────────────────────

// Languages where we DON'T show an accent bar — either too many accents,
// completely different script, or no relevant accented Latin chars.
const SKIP_ACCENT_LANGS = new Set([
  'korean', 'japanese', 'chinese', 'arabic', 'russian', 'thai',
  'vietnamese', 'hindi', 'hebrew', 'latvian', 'lithuanian', 'greek',
])

// Unicode ranges that are Latin extended (accented Latin letters)
// Excludes CJK, Arabic, Hebrew, Cyrillic, Thai, Devanagari, etc.
function isLatinExtended(ch) {
  const cp = ch.codePointAt(0)
  // Latin-1 Supplement accented (À–ÿ, excluding ×÷)
  if (cp >= 0xC0 && cp <= 0xFF && cp !== 0xD7 && cp !== 0xF7) return true
  // Latin Extended-A (Ā–ž)
  if (cp >= 0x0100 && cp <= 0x017F) return true
  // Latin Extended-B (partial — common accented chars)
  if (cp >= 0x0180 && cp <= 0x024F) return true
  return false
}

function extractTypingAssist(cards) {
  if (!cards?.length) return []

  const specialFreq = {}
  for (const card of cards) {
    const text = card?.word || ''
    if (!text || typeof text !== 'string') continue
    for (const ch of text) {
      if (isLatinExtended(ch) && ch.normalize('NFD') === ch) {
        const lower = ch.toLowerCase()
        specialFreq[lower] = (specialFreq[lower] || 0) + 1
      }
    }
  }

  const specialChars = Object.entries(specialFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([ch]) => ch)

  return { diacritics: getDiacriticPresets(), specialChars }
}

function applyCombiningMark(value, cursor, preset) {
  const before = value.slice(0, cursor)
  const after = value.slice(cursor)
  const m = before.match(/([\s\S])([\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff]*)$/u)
  if (!m) return { value, cursor }
  const base = m[1]
  const marks = Array.from(m[2] || '')
  const start = before.length - (base + (m[2] || '')).length

  const nextMarks = marks.filter(mark => {
    const p = getDiacriticPresets().find(x => x.mark === mark)
    return !p || p.group !== preset.group
  })
  if (!nextMarks.includes(preset.mark)) nextMarks.push(preset.mark)

  const rebuilt = (base + nextMarks.join('')).normalize('NFC')
  const nextValue = value.slice(0, start) + rebuilt + after
  const nextCursor = start + rebuilt.length
  return { value: nextValue, cursor: nextCursor }
}

/**
 * Diacritics hotkeys (1-0) transform the previous character.
 * Special chars are optional one-click inserts (e.g. þ, ð, ł).
 */
function AccentBar({ assist, onInsert, onApplyMark }) {
  useEffect(() => {
    if (!assist?.diacritics?.length) return
    const handler = (e) => {
      if (!['INPUT','TEXTAREA'].includes(e.target.tagName)) return
      const idx = DIACRITIC_KEYS.indexOf(e.key)
      if (idx === -1 || idx >= assist.diacritics.length) return
      if (!e.target.dataset.accentInput) return
      e.preventDefault()
      onApplyMark(assist.diacritics[idx])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [assist, onApplyMark])

  if (!assist) return null

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1 flex-wrap justify-center">
        {assist.diacritics.map((d) => (
          <button
            key={d.key}
            type="button"
            tabIndex={-1}
            onClick={() => onApplyMark(d)}
            className="flex flex-col items-center justify-center rounded-lg border transition-all"
            style={{ width: '36px', height: '36px', borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '14px', position: 'relative' }}
            title={`Apply ${d.label} to previous character (press ${d.key})`}>
            ◌{d.label}
            <span style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', color: 'var(--text-muted)', lineHeight: 1 }}>{d.key}</span>
          </button>
        ))}
      </div>
      {assist.specialChars?.length > 0 && (
        <div className="flex gap-1 flex-wrap justify-center">
          {assist.specialChars.map(ch => (
            <button key={ch} type="button" tabIndex={-1} onClick={() => onInsert(ch)}
              className="rounded-lg border px-2 py-1 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
              {ch}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
