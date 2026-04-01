import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAppStore } from '../store/appStore'
import { getNextIntervalLabel } from '../lib/fsrs'
import { fuzzyMatch, parseCloze } from '../lib/fuzzy'
import { shuffle, fontForText } from '../lib/utils'
import { useStudyKeyboard } from '../hooks/useKeyboard'
import { DeckStatsBar } from '../components/shared/StatsBar'
import { useDeckStats } from '../hooks/useDeckStats'
import RubyText from '../components/shared/RubyText'

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

  const clozeAvailable = !!exampleField
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
function StudySession({ deckId, mode, deck, blueprint, config, allCards, dueCards, onEnd }) {
  const qc = useQueryClient()
  const exampleField = blueprint.find(f => f.field_type === 'example')

  const queue = useRef([])
  const [queueReady, setQueueReady] = useState(false)
  const [cardIdx, setCardIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0, again: 0, hard: 0 })

  // Per-card state
  // 'prompt'   → showing front / input
  // 'checking' → input submitted, brief moment before flip
  // 'revealed' → card flipped, showing back + rating buttons
  const [phase, setPhase] = useState('prompt')
  const [lastResult, setLastResult] = useState(null) // { correct, similarity, answer } — shown in revealed phase

  // Interaction-specific input state
  const [typingAnswer, setTypingAnswer] = useState('')
  const [choiceSelected, setChoiceSelected] = useState(null) // the chosen string
  const [clozeAnswer, setClozeAnswer] = useState('')
  const [choices, setChoices] = useState([])

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

  const currentCard = queueReady ? queue.current[cardIdx] : null
  const total = queue.current.length
  const sessionProgress = total > 0 ? (cardIdx / total) * 100 : 0

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
    resetCard()
    const next = cardIdx + 1
    if (next >= total) setDone(true)
    else setCardIdx(next)
  }

  // Reveal: check answer, set result, flip to revealed phase
  const reveal = (result = null) => {
    setLastResult(result)
    setPhase('revealed')
  }

  const submitTyping = () => {
    if (!currentCard || phase !== 'prompt') return
    const expected = getAnswer(currentCard, config.direction, blueprint, deck)
    const result = fuzzyMatch(typingAnswer, expected || '')
    reveal({ ...result, answer: expected })
  }

  const submitCloze = () => {
    if (!currentCard || phase !== 'prompt') return
    const clozeData = parseCloze(currentCard.fields?.[exampleField?.key] || '')
    const result = fuzzyMatch(clozeAnswer, clozeData.answer || '')
    reveal({ ...result, answer: clozeData.answer })
  }

  const submitChoice = (choice) => {
    if (phase !== 'prompt') return
    const correct = getAnswer(currentCard, config.direction, blueprint, deck)
    const isCorrect = choice === correct
    setChoiceSelected(choice)
    reveal({ correct: isCorrect, answer: correct, chosen: choice })
  }

  // Keyboard: Space/Enter flips in passive; 1-4 rates in revealed
  useStudyKeyboard({
    flipped: phase === 'revealed',
    onFlip: () => {
      if (config.interaction === 'passive' && phase === 'prompt') reveal(null)
    },
    onRate: (r) => {
      if (phase === 'revealed') advance(r)
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

  const card = currentCard
  const front = getFront(card, config.direction, blueprint, deck)
  const clozeData = (config.interaction === 'cloze' && exampleField)
    ? parseCloze(card.fields?.[exampleField.key] || '')
    : { hasCloze: false }

  const isRevealed = phase === 'revealed'

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
          card={card}
          front={front}
          blueprint={blueprint}
          flipped={isRevealed}
          deck={deck}
          onFlip={config.interaction === 'passive' ? () => reveal(null) : null}
          resultBadge={lastResult && isRevealed
            ? { correct: lastResult.correct, label: lastResult.correct ? `✓ ${Math.round((lastResult.similarity || 1) * 100)}%` : `✗ ${lastResult.answer || ''}` }
            : null}
        />

        {/* ── Prompt / input area — slides away on reveal ── */}
        <div className="w-full max-w-lg" style={{
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          opacity: isRevealed ? 0 : 1,
          transform: isRevealed ? 'translateY(8px)' : 'translateY(0)',
          pointerEvents: isRevealed ? 'none' : 'auto',
        }}>
          {config.interaction === 'passive' && (
            <button className="btn-primary w-full py-3 text-base" onClick={() => reveal(null)}>
              Reveal → <span className="text-xs opacity-50 ml-1">[Space]</span>
            </button>
          )}

          {config.interaction === 'typing' && (
            <div className="card p-5">
              <div className="section-title mb-2">
                Type the {config.direction === 'targetToSource' ? (deck?.source_language || 'English') : deck?.target_language} answer
              </div>
              <input className="input text-base" value={typingAnswer}
                onChange={e => setTypingAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitTyping()}
                placeholder="Your answer..." autoFocus />
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
                    {['A','B','C','D'][i]}
                  </span>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {config.interaction === 'cloze' && (
            clozeData.hasCloze ? (
              <div className="card p-5">
                {/* Word + definition hint */}
                <div className="flex items-start justify-between mb-3">
                  <div className="font-display text-xl font-bold" style={{ color: 'var(--accent-primary)', fontFamily: fontForText(card.word) }}>
                    {card.word}
                  </div>
                  {(() => {
                    const defField = blueprint.find(f => f.key === 'definition') || blueprint.find(f => f.key === 'reading')
                    const hint = defField ? card.fields?.[defField.key] : null
                    return hint ? <div className="text-sm text-right" style={{ color: 'var(--text-muted)', maxWidth: '55%' }}>{hint}</div> : null
                  })()}
                </div>
                <div className="text-center leading-loose mb-4"
                  style={{ color: 'var(--text-primary)', fontSize: '17px', fontFamily: fontForText(clozeData.before + clozeData.after) }}>
                  {clozeData.before}
                  <input
                    className="cloze-input"
                    style={{ width: `${Math.max((clozeData.answer?.length || 4) + 2, 4) * 0.95}em`, fontFamily: fontForText(clozeData.answer || '') }}
                    value={clozeAnswer}
                    onChange={e => setClozeAnswer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitCloze()}
                    autoFocus
                  />
                  {clozeData.after}
                </div>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => reveal({ correct: false, answer: clozeData.answer })}>Skip</button>
                  <button className="btn-primary flex-1" onClick={submitCloze}>Check</button>
                </div>
              </div>
            ) : (
              <div className="card p-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No example sentence. <button className="btn-ghost text-sm" onClick={() => advance(3)}>Skip →</button>
              </div>
            )
          )}
        </div>

        {/* ── Rating buttons — appear when revealed ── */}
        <div className="w-full max-w-lg" style={{
          transition: 'opacity 0.3s ease 0.2s, transform 0.3s ease 0.2s',
          opacity: isRevealed ? 1 : 0,
          transform: isRevealed ? 'translateY(0)' : 'translateY(12px)',
          pointerEvents: isRevealed ? 'auto' : 'none',
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
                    <span className="mr-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{['A','B','C','D'][i]}</span>
                    {choice}
                  </div>
                )
              })}
            </div>
          )}

          {/* Typing result shown above rating buttons */}
          {(config.interaction === 'typing' || config.interaction === 'cloze') && lastResult && (
            <div className="text-sm text-center font-medium mb-4"
              style={{ color: lastResult.correct ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>
              {lastResult.correct
                ? `✓ Correct! (${Math.round((lastResult.similarity || 1) * 100)}%)`
                : `✗ Answer: ${lastResult.answer}`}
            </div>
          )}

          {mode === 'learn' ? (
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
function getFront(card, direction, blueprint, deck) {
  if (direction === 'targetToSource') {
    return { word: card.word, label: deck?.target_language || 'Word', isTarget: true }
  }
  // sourceToTarget: find definition/reading field to show as prompt
  const defField = blueprint.find(f => f.key === 'definition') || blueprint.find(f => f.key === 'reading') || blueprint[0]
  const val = defField ? card.fields?.[defField.key] : null
  return { word: val || card.word, label: deck?.source_language || 'Source', isTarget: false, fieldKey: defField?.key, field: defField }
}

// ── Helper: what counts as the correct answer ──────────────
function getAnswer(card, direction, blueprint, deck) {
  if (direction === 'targetToSource') {
    const defField = blueprint.find(f => f.key === 'definition') || blueprint.find(f => f.key === 'reading') || blueprint[0]
    return defField ? card.fields?.[defField.key] : card.word
  }
  // sourceToTarget: the target word itself
  return card.word
}

// ── PassiveCard — 3D flip card ─────────────────────────────
function PassiveCard({ card, front, blueprint, flipped, deck, onFlip, resultBadge }) {
  const frontField = blueprint.find(f => f.show_on_front)

  return (
    <div className="w-full max-w-lg card-3d"
      style={{ cursor: !flipped && onFlip ? 'pointer' : 'default', height: '260px', position: 'relative' }}
      onClick={!flipped && onFlip ? onFlip : undefined}>
      <div className={`card-inner w-full h-full ${flipped ? 'flipped' : ''}`} style={{ position: 'relative' }}>
        {/* FRONT */}
        <div className="card-face card-elevated flex flex-col items-center justify-center p-8 rounded-2xl select-none">
          <div className="section-title mb-3">{front.label}</div>
          <div className="font-display text-5xl font-bold text-center leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: fontForText(front.word) }}>
            {front.word}
          </div>
          {front.isTarget && frontField && card.fields?.[frontField.key] && (
            <div className="mt-3 text-base" style={{ color: 'var(--text-secondary)', fontFamily: fontForText(card.fields[frontField.key]) }}>
              {card.fields[frontField.key]}
            </div>
          )}
          {onFlip && (
            <div className="absolute bottom-4 text-xs" style={{ color: 'var(--text-muted)' }}>tap to reveal · Space</div>
          )}
        </div>

        {/* BACK */}
        <div className="card-face card-back card-elevated flex flex-col p-6 rounded-2xl overflow-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)', fontFamily: fontForText(card.word) }}>
              {card.word}
            </div>
            {card.interval > 0 && <span className="tag text-xs">{card.interval}d interval</span>}
            {resultBadge && (
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: resultBadge.correct ? 'rgba(0,212,168,.15)' : 'rgba(225,112,85,.15)', color: resultBadge.correct ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>
                {resultBadge.label}
              </span>
            )}
          </div>
          <div className="space-y-2.5 flex-1 overflow-auto">
            {blueprint.map(field => {
              const value = card.fields?.[field.key]
              if (!value) return null
              return (
                <div key={field.key} className="flex gap-2 min-w-0">
                  <span className="section-title flex-shrink-0 mt-0.5" style={{ width: '72px' }}>{field.label}</span>
                  <div className="flex-1 min-w-0 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {field.field_type === 'example'
                      ? <ExampleDisplay text={value} />
                      : <RubyText value={value} fieldKey={field.key} cardFields={card.fields} phonetics={field.phonetics} />
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

function ExampleDisplay({ text }) {
  const { before, answer, after, hasCloze } = parseCloze(text)
  if (!hasCloze) return <span style={{ color: 'var(--text-primary)' }}>{text}</span>
  return (
    <span style={{ color: 'var(--text-primary)', fontFamily: fontForText(text) }}>
      {before}
      <mark style={{ background: 'rgba(124,106,240,0.2)', color: 'var(--accent-primary)', borderRadius: '3px', padding: '0 3px' }}>
        {answer}
      </mark>
      {after}
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
