import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAppStore } from '../store/appStore'
import { scheduleCard, getNextIntervalLabel, isDue } from '../lib/fsrs'
import { fuzzyMatch, parseCloze } from '../lib/fuzzy'

// ─────────────────────────────────────────────
// STUDY PAGE ROUTER
// ─────────────────────────────────────────────
export default function StudyPage() {
  const { deckId, mode } = useParams()
  const navigate = useNavigate()
  const { settings } = useAppStore()
  const [sessionConfig, setSessionConfig] = useState(null)

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => api.getDecks().then(d => d.find(x => x.id === deckId)),
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

  if (!sessionConfig) {
    return (
      <SessionSetup
        mode={mode}
        deck={deck}
        allCards={allCards}
        dueCards={dueCards}
        blueprint={blueprint}
        settings={settings}
        onStart={setSessionConfig}
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
// SESSION SETUP SCREEN
// ─────────────────────────────────────────────
function SessionSetup({ mode, deck, allCards, dueCards, blueprint, settings, onStart, onBack }) {
  const exampleField = blueprint.find(f => f.field_type === 'example')
  const [config, setConfig] = useState({
    batchSize: settings.defaultBatchSize || 20,
    cardPool: 'all', // 'all' | 'seen' | 'unseen'
    useCloze: !!exampleField,
    frontField: deck?.card_front_field || 'auto',
    randomise: true,
  })

  const newCount = allCards.filter(c => c.srs_state === 'new' || !c.seen).length
  const dueCount = dueCards.length

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <button className="btn-ghost mb-6 flex items-center gap-2 text-sm" onClick={onBack}>
        ← Back
      </button>

      <div className="section-title mb-1">{deck?.name}</div>
      <h1 className="font-display text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {mode === 'learn' ? '🧠 Learn' : '🎯 Freestyle'}
      </h1>

      {mode === 'learn' && (
        <div className="card p-4 mb-6 flex gap-4">
          <div className="text-center flex-1">
            <div className="font-display text-2xl font-bold" style={{ color: 'var(--accent-danger)' }}>{dueCount}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Due for review</div>
          </div>
          <div className="w-px" style={{ background: 'var(--border)' }} />
          <div className="text-center flex-1">
            <div className="font-display text-2xl font-bold" style={{ color: 'var(--accent-secondary)' }}>{newCount}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>New cards</div>
          </div>
        </div>
      )}

      <div className="card p-5 space-y-5 mb-6">
        <Setting label="Batch size">
          <input type="number" min={5} max={200} className="input w-24 text-center"
            value={config.batchSize} onChange={e => setConfig(c => ({ ...c, batchSize: Number(e.target.value) }))} />
        </Setting>

        {mode === 'freestyle' && (
          <Setting label="Card pool">
            <div className="flex gap-2">
              {[['all','All'],['seen','Seen'],['unseen','Unseen']].map(([v,l]) => (
                <button key={v}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${config.cardPool === v ? 'font-medium' : ''}`}
                  style={{ borderColor: config.cardPool === v ? 'var(--accent-primary)' : 'var(--border)', color: config.cardPool === v ? 'var(--accent-primary)' : 'var(--text-secondary)', background: config.cardPool === v ? 'var(--accent-glow)' : 'transparent' }}
                  onClick={() => setConfig(c => ({ ...c, cardPool: v }))}>
                  {l}
                </button>
              ))}
            </div>
          </Setting>
        )}

        {exampleField && (
          <Setting label="Cloze mode">
            <Toggle value={config.useCloze} onChange={v => setConfig(c => ({ ...c, useCloze: v }))} />
          </Setting>
        )}

        <Setting label="Randomise order">
          <Toggle value={config.randomise} onChange={v => setConfig(c => ({ ...c, randomise: v }))} />
        </Setting>
      </div>

      <button className="btn-primary w-full text-base py-3"
        onClick={() => onStart(config)}
        disabled={allCards.length === 0}>
        {allCards.length === 0 ? 'No cards in deck' : 'Start Session →'}
      </button>
    </div>
  )
}

function Setting({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      className="w-11 h-6 rounded-full transition-colors relative"
      style={{ background: value ? 'var(--accent-primary)' : 'var(--bg-elevated)' }}
      onClick={() => onChange(!value)}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

// ─────────────────────────────────────────────
// STUDY SESSION
// ─────────────────────────────────────────────
function StudySession({ deckId, mode, deck, blueprint, config, allCards, dueCards, onEnd }) {
  const qc = useQueryClient()
  const exampleField = blueprint.find(f => f.field_type === 'example')

  // Build queue
  const queue = useRef([])
  const [queueReady, setQueueReady] = useState(false)
  const [cardIdx, setCardIdx] = useState(0)
  const [phase, setPhase] = useState('review') // 'review' | 'new' | 'done'
  const [flipped, setFlipped] = useState(false)
  const [clozeAnswer, setClozeAnswer] = useState('')
  const [clozeResult, setClozeResult] = useState(null) // null | {correct,similarity}
  const [showCloze, setShowCloze] = useState(false)
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0, again: 0 })

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }) => api.recordReview(cardId, rating),
    onSuccess: () => qc.invalidateQueries(['srs', deckId]),
  })

  useEffect(() => {
    let cards = []
    if (mode === 'learn') {
      // SRS: due first, then new
      const due = dueCards.slice(0, config.batchSize)
      const needed = config.batchSize - due.length
      const newCards = allCards.filter(c => c.srs_state === 'new' || (!c.seen && c.repetitions === 0)).slice(0, Math.max(0, needed))
      cards = [...due, ...newCards]
    } else {
      // Freestyle
      let pool = config.cardPool === 'seen' ? allCards.filter(c => c.seen)
               : config.cardPool === 'unseen' ? allCards.filter(c => !c.seen)
               : allCards
      if (config.randomise) pool = [...pool].sort(() => Math.random() - 0.5)
      cards = pool.slice(0, config.batchSize)
    }
    queue.current = cards
    setQueueReady(true)
  }, [])

  const currentCard = queueReady ? queue.current[cardIdx] : null
  const totalCards = queue.current.length
  const progress = totalCards > 0 ? ((cardIdx) / totalCards) * 100 : 0

  // Determine if we should show cloze for this card
  const clozeData = currentCard && config.useCloze && exampleField
    ? parseCloze(currentCard.fields?.[exampleField.key] || '')
    : { hasCloze: false }

  const handleFlip = () => {
    if (!flipped && clozeData.hasCloze && !showCloze) {
      setShowCloze(true)
      return
    }
    setFlipped(true)
  }

  const submitCloze = () => {
    if (!clozeData.answer) return
    const result = fuzzyMatch(clozeAnswer, clozeData.answer)
    setClozeResult(result)
    if (result.correct) setTimeout(() => setFlipped(true), 800)
  }

  const advance = (rating) => {
    if (mode === 'learn' && currentCard) {
      reviewMutation.mutate({ cardId: currentCard.id, rating })
      // Mark seen
      api.updateCard(currentCard.id, { seen: true })
    }

    setSessionStats(s => ({
      reviewed: s.reviewed + 1,
      correct: s.correct + (rating >= 3 ? 1 : 0),
      again: s.again + (rating === 1 ? 1 : 0),
    }))

    // Reset card state
    setFlipped(false)
    setShowCloze(false)
    setClozeAnswer('')
    setClozeResult(null)

    const next = cardIdx + 1
    if (next >= totalCards) {
      setPhase('done')
    } else {
      setCardIdx(next)
    }
  }

  if (!queueReady) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Building session...</div>

  if (phase === 'done' || totalCards === 0) {
    return <SessionComplete stats={sessionStats} total={totalCards} onEnd={onEnd} />
  }

  if (!currentCard) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button className="btn-ghost p-1.5 text-sm shrink-0" onClick={onEnd}>✕</button>
        <div className="flex-1">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          {cardIdx + 1} / {totalCards}
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <FlashCard
          card={currentCard}
          blueprint={blueprint}
          deck={deck}
          flipped={flipped}
          clozeData={clozeData}
          showCloze={showCloze}
          clozeAnswer={clozeAnswer}
          clozeResult={clozeResult}
          onClozeChange={setClozeAnswer}
          onClozeSubmit={submitCloze}
          onFlip={handleFlip}
        />

        {/* Actions */}
        <div className="mt-6 w-full max-w-lg">
          {!flipped ? (
            <button className="btn-primary w-full py-3 text-base"
              onClick={handleFlip}>
              {showCloze && !clozeResult ? 'Check Answer' : 'Reveal →'}
            </button>
          ) : (
            <div>
              {mode === 'learn' ? (
                <div>
                  <div className="section-title text-center mb-3">How well did you know this?</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { rating: 1, label: 'Again', cls: 'again' },
                      { rating: 2, label: 'Hard', cls: 'hard' },
                      { rating: 3, label: 'Good', cls: 'good' },
                      { rating: 4, label: 'Easy', cls: 'easy' },
                    ].map(({ rating, label, cls }) => (
                      <button key={rating} className={`rating-btn ${cls}`} onClick={() => advance(rating)}>
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-xs opacity-60">{getNextIntervalLabel(currentCard, rating)}</span>
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
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FLASH CARD COMPONENT
// ─────────────────────────────────────────────
function FlashCard({ card, blueprint, deck, flipped, clozeData, showCloze, clozeAnswer, clozeResult, onClozeChange, onClozeSubmit, onFlip }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (showCloze && inputRef.current) inputRef.current.focus()
  }, [showCloze])

  // Determine front field
  const frontBlueprint = blueprint.find(f => f.show_on_front)

  return (
    <div className="w-full max-w-lg card-3d cursor-pointer" onClick={!showCloze ? onFlip : undefined}
      style={{ height: '280px' }}>
      <div className={`card-inner w-full h-full ${flipped ? 'flipped' : ''}`} style={{ position: 'relative' }}>
        {/* Front */}
        <div className="card-face card-elevated flex flex-col items-center justify-center p-8 rounded-2xl select-none">
          <div className="section-title mb-3">{deck?.target_language || 'Word'}</div>
          <div className="font-display text-5xl font-bold text-center leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: /korean|korean/i.test(deck?.target_language || '') ? undefined : undefined }}>
            {card.word}
          </div>
          {frontBlueprint && card.fields?.[frontBlueprint.key] && (
            <div className="mt-3 text-base" style={{ color: 'var(--text-secondary)' }}>
              {card.fields[frontBlueprint.key]}
            </div>
          )}
          {!flipped && (
            <div className="absolute bottom-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              tap to reveal
            </div>
          )}
        </div>

        {/* Back */}
        <div className="card-face card-back card-elevated flex flex-col p-6 rounded-2xl overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
              {card.word}
            </div>
          </div>

          <div className="space-y-2.5 flex-1">
            {blueprint.map(field => {
              const value = card.fields?.[field.key]
              if (!value) return null

              if (field.field_type === 'example') {
                return (
                  <FieldRow key={field.key} label={field.label}>
                    <ExampleDisplay text={value} />
                  </FieldRow>
                )
              }

              return (
                <FieldRow key={field.key} label={field.label}>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{value}</span>
                </FieldRow>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cloze overlay (before flip) */}
      {showCloze && !flipped && clozeData.hasCloze && (
        <div className="absolute inset-0 card-elevated rounded-2xl flex flex-col items-center justify-center p-8"
          onClick={e => e.stopPropagation()}>
          <div className="section-title mb-4">Complete the sentence</div>
          <div className="text-center text-sm leading-relaxed mb-5" style={{ color: 'var(--text-primary)', maxWidth: '90%' }}>
            {clozeData.before}
            <input
              ref={inputRef}
              className={`cloze-input mx-1 ${clozeResult ? (clozeResult.correct ? 'correct' : 'incorrect') : ''}`}
              style={{ width: `${Math.max(clozeData.answer?.length || 4, 4) * 0.75}em` }}
              value={clozeAnswer}
              onChange={e => onClozeChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onClozeSubmit()}
              disabled={!!clozeResult}
            />
            {clozeData.after}
          </div>
          {clozeResult && !clozeResult.correct && (
            <div className="text-sm mb-3" style={{ color: 'var(--accent-danger)' }}>
              Answer: <strong>{clozeData.answer}</strong>
            </div>
          )}
          {!clozeResult && (
            <button className="btn-primary text-sm" onClick={onClozeSubmit}>Check</button>
          )}
          {clozeResult && !clozeResult.correct && (
            <button className="btn-secondary text-sm" onClick={() => onFlip()}>Reveal card</button>
          )}
        </div>
      )}
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div className="flex gap-2">
      <span className="section-title shrink-0 mt-0.5 w-20">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function ExampleDisplay({ text }) {
  // Display with cloze marker styled
  const { before, answer, after, hasCloze } = parseCloze(text)
  if (!hasCloze) return <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{text}</span>
  return (
    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
      {before}
      <mark style={{ background: 'rgba(124,106,240,0.2)', color: 'var(--accent-primary)', borderRadius: '3px', padding: '0 2px' }}>
        {answer}
      </mark>
      {after}
    </span>
  )
}

// ─────────────────────────────────────────────
// SESSION COMPLETE
// ─────────────────────────────────────────────
function SessionComplete({ stats, total, onEnd }) {
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0
  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center">
      <div className="text-6xl mb-6">{pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📖'}</div>
      <h2 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Session complete!</h2>
      <div className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Here's how you did</div>

      <div className="card p-6 grid grid-cols-3 gap-4 mb-8">
        <Stat label="Reviewed" value={stats.reviewed} />
        <Stat label="Got right" value={stats.correct} color="var(--accent-secondary)" />
        <Stat label="Again" value={stats.again} color="var(--accent-danger)" />
      </div>

      <div className="progress-bar mb-4">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>{pct}% accuracy</div>

      <button className="btn-primary w-full py-3" onClick={onEnd}>← Back to Setup</button>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-bold" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}
