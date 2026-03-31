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
//import RubyText from '../components/shared/RubyText'

// ─────────────────────────────────────────────
// TOP-LEVEL ROUTER
// ─────────────────────────────────────────────
export default function StudyPage() {
  const { deckId, mode } = useParams()
  const navigate = useNavigate()
  const { settings } = useAppStore()
  const [sessionConfig, setSessionConfig] = useState(null)

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
        stats={stats}
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
// SESSION SETUP
// ─────────────────────────────────────────────
function SessionSetup({ mode, deck, allCards, dueCards, blueprint, settings, stats, onStart, onBack }) {
  const exampleField = blueprint.find(f => f.field_type === 'example')

  const [config, setConfig] = useState({
    batchSize: settings.defaultBatchSize || 20,
    cardPool: 'all',
    useCloze: !!exampleField,
    randomise: true,
  })

  const availableCount = (() => {
    if (mode === 'learn') return dueCards.length + (stats.new || 0)
    const pool = config.cardPool === 'seen'   ? allCards.filter(c => c.seen)
               : config.cardPool === 'unseen' ? allCards.filter(c => !c.seen)
               : allCards
    return pool.length
  })()

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <button className="btn-ghost mb-6 flex items-center gap-2 text-sm" onClick={onBack}>
        ← Back
      </button>

      <div className="section-title mb-1">{deck?.name}</div>
      <h1 className="font-display text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {mode === 'learn' ? '🧠 Learn' : '🎯 Freestyle'}
      </h1>

      {mode === 'learn' ? (
        <div className="card p-5 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="text-center">
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--accent-danger)' }}>
                {dueCards.length}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Due for review</div>
            </div>
            <div className="text-center">
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--accent-secondary)' }}>
                {stats.new || 0}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>New cards</div>
            </div>
          </div>
          <DeckStatsBar stats={stats} />
        </div>
      ) : (
        <div className="card p-4 mb-6">
          <DeckStatsBar stats={stats} />
          <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            {availableCount} cards in selected pool
          </div>
        </div>
      )}

      <div className="card p-5 space-y-5 mb-6">
        <ConfigRow label="Batch size" desc="Cards per session">
          <input
            type="number" min={1} max={500} className="input w-24 text-center"
            value={config.batchSize}
            onChange={e => setConfig(c => ({ ...c, batchSize: Math.max(1, Number(e.target.value)) }))}
          />
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

        {exampleField && (
          <ConfigRow label="Cloze mode" desc="Fill-in-the-blank before reveal">
            <Toggle value={config.useCloze} onChange={v => setConfig(c => ({ ...c, useCloze: v }))} />
          </ConfigRow>
        )}

        <ConfigRow label="Randomise order">
          <Toggle value={config.randomise} onChange={v => setConfig(c => ({ ...c, randomise: v }))} />
        </ConfigRow>
      </div>

      <div className="flex gap-4 mb-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span><kbd className="px-1.5 py-0.5 rounded text-xs border" style={{borderColor:'var(--border)',background:'var(--bg-elevated)'}}>Space</kbd> flip</span>
        {mode === 'learn' && <span><kbd className="px-1.5 py-0.5 rounded text-xs border" style={{borderColor:'var(--border)',background:'var(--bg-elevated)'}}>1–4</kbd> rate</span>}
        <span><kbd className="px-1.5 py-0.5 rounded text-xs border" style={{borderColor:'var(--border)',background:'var(--bg-elevated)'}}>Esc</kbd> exit</span>
      </div>

      <button className="btn-primary w-full text-base py-3" onClick={() => onStart(config)} disabled={availableCount === 0}>
        {availableCount === 0
          ? (mode === 'learn' ? 'Nothing due — great job!' : 'No cards in pool')
          : `Start ${mode === 'learn' ? 'Learning' : 'Freestyle'} →`}
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
      style={{
        borderColor: active ? 'var(--accent-primary)' : 'var(--border)',
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-glow)' : 'transparent',
        fontWeight: active ? 500 : 400,
      }}>
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
  const [flipped, setFlipped] = useState(false)
  const [clozeMode, setClozeMode] = useState(false)
  const [clozeAnswer, setClozeAnswer] = useState('')
  const [clozeResult, setClozeResult] = useState(null)
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0, again: 0, hard: 0 })

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }) => api.recordReview(cardId, rating),
    onSuccess: (updated) => {
      qc.setQueryData(['cards', deckId], old => old?.map(c => c.id === updated.id ? updated : c))
      qc.invalidateQueries({ queryKey: ['srs', deckId] })
    },
  })

  // Build queue once on mount
  useEffect(() => {
    let cards = []
    if (mode === 'learn') {
      const due = config.randomise ? shuffle([...dueCards]) : [...dueCards]
      const dueLimited = due.slice(0, config.batchSize)
      const needed = config.batchSize - dueLimited.length
      const newPool = allCards.filter(c => c.srs_state === 'new' || (c.repetitions === 0 && !c.seen))
      const newCards = needed > 0 ? newPool.slice(0, needed) : []
      cards = [...dueLimited, ...newCards]
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
  const progress = total > 0 ? (cardIdx / total) * 100 : 0
  const clozeData = (currentCard && config.useCloze && exampleField)
    ? parseCloze(currentCard.fields?.[exampleField.key] || '')
    : { hasCloze: false }

  const handleFlip = () => {
    if (!flipped && !clozeMode && clozeData.hasCloze) {
      setClozeMode(true)
      return
    }
    setFlipped(true)
    setClozeMode(false)
  }

  const handleClozeSubmit = () => {
    if (!clozeData.answer || clozeResult) return
    const result = fuzzyMatch(clozeAnswer, clozeData.answer)
    setClozeResult({ ...result, answer: clozeData.answer })
    if (result.correct) setTimeout(() => setFlipped(true), 700)
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
    setFlipped(false)
    setClozeMode(false)
    setClozeAnswer('')
    setClozeResult(null)
    const next = cardIdx + 1
    if (next >= total) setDone(true)
    else setCardIdx(next)
  }

  useStudyKeyboard({
    flipped,
    onFlip: handleFlip,
    onRate: (r) => { if (flipped) advance(r) },
    onExit: onEnd,
    enabled: !done,
  })

  if (!queueReady) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Building session...</div>
      </div>
    )
  }

  if (done || total === 0) {
    return <SessionComplete stats={sessionStats} total={total} mode={mode} onEnd={onEnd} />
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Progress header */}
      <div className="flex items-center gap-3 mb-8">
        <button className="btn-ghost text-lg leading-none p-1.5 flex-shrink-0" onClick={onEnd} title="Exit (Esc)">✕</button>
        <div className="flex-1">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="text-xs flex-shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {cardIdx + 1} / {total}
        </div>
        {mode === 'learn' && currentCard && (
          <div className="text-xs flex-shrink-0 px-2 py-0.5 rounded-full"
            style={{ background: currentCard.srs_state === 'new' ? 'var(--accent-glow)' : 'rgba(0,212,168,.1)', color: currentCard.srs_state === 'new' ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
            {currentCard.srs_state === 'new' || currentCard.repetitions === 0 ? '✦ New' : '↻ Review'}
          </div>
        )}
      </div>

      {/* Card + Actions */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <FlashCard
          card={currentCard}
          blueprint={blueprint}
          deck={deck}
          flipped={flipped}
          clozeMode={clozeMode}
          clozeData={clozeData}
          clozeAnswer={clozeAnswer}
          clozeResult={clozeResult}
          onClozeChange={setClozeAnswer}
          onClozeSubmit={handleClozeSubmit}
          onFlip={handleFlip}
        />

        <div className="w-full max-w-lg">
          {!flipped && !clozeMode && (
            <button className="btn-primary w-full py-3 text-base" onClick={handleFlip}>
              {clozeData.hasCloze && config.useCloze ? 'Fill in blank →' : 'Reveal →'}
            </button>
          )}

          {clozeMode && !flipped && (
            <div className="flex gap-3">
              {!clozeResult ? (
                <>
                  <button className="btn-secondary flex-1 py-3" onClick={handleFlip}>Skip</button>
                  <button className="btn-primary flex-1 py-3" onClick={handleClozeSubmit}>Check answer</button>
                </>
              ) : !clozeResult.correct ? (
                <button className="btn-primary w-full py-3" onClick={handleFlip}>Reveal card →</button>
              ) : null}
            </div>
          )}

          {flipped && (
            mode === 'learn' ? (
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
                      <span className="text-xs opacity-60">{getNextIntervalLabel(currentCard, rating)}</span>
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
            )
          )}
        </div>

        {flipped && mode === 'learn' && (
          <div className="flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            {['Again','Hard','Good','Easy'].map((l, i) => (
              <span key={l}><kbd className="px-1 py-0.5 rounded border text-xs" style={{borderColor:'var(--border)',background:'var(--bg-elevated)'}}>{i+1}</kbd> {l}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FLASH CARD
// ─────────────────────────────────────────────
function FlashCard({ card, blueprint, deck, flipped, clozeMode, clozeData, clozeAnswer, clozeResult, onClozeChange, onClozeSubmit, onFlip }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (clozeMode && !flipped && inputRef.current) inputRef.current.focus()
  }, [clozeMode, flipped])

  const frontField = blueprint.find(f => f.show_on_front)

  return (
    <div className="w-full max-w-lg card-3d" style={{ height: '280px', position: 'relative' }}>
      <div className={`card-inner w-full h-full ${flipped ? 'flipped' : ''}`} style={{ position: 'relative' }}>

        {/* FRONT */}
        <div className="card-face card-elevated flex flex-col items-center justify-center p-8 rounded-2xl select-none cursor-pointer"
          onClick={onFlip}>
          <div className="section-title mb-3">{deck?.target_language || 'Word'}</div>
          <div className="font-display text-5xl font-bold text-center leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: fontForText(card.word) }}>
            {card.word}
          </div>
          {frontField && card.fields?.[frontField.key] && (
            <div className="mt-3 text-base" style={{ color: 'var(--text-secondary)', fontFamily: fontForText(card.fields[frontField.key]) }}>
              {card.fields[frontField.key]}
            </div>
          )}
          <div className="absolute bottom-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            {clozeData.hasCloze ? 'tap for cloze' : 'tap to reveal'} · Space
          </div>
        </div>

        {/* BACK */}
        <div className="card-face card-back card-elevated flex flex-col p-6 rounded-2xl overflow-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)', fontFamily: fontForText(card.word) }}>
              {card.word}
            </div>
            {card.interval > 0 && (
              <span className="tag text-xs">{card.interval}d interval</span>
            )}
          </div>
          <div className="space-y-2.5 flex-1 overflow-auto">
            {blueprint.map(field => {
              const value = card.fields?.[field.key]
              if (!value) return null
              return (
                <div key={field.key} className="flex gap-2 min-w-0">
                  <span className="section-title flex-shrink-0 mt-0.5" style={{ width: '72px' }}>
                    {field.label}
                  </span>
                  <div className="flex-1 min-w-0 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {field.field_type === 'example'
                      ? <ExampleDisplay text={value} />
                      : <RubyText
                          value={value}
                          fieldKey={field.key}
                          cardFields={card.fields}
                          phonetics={field.phonetics || []}
                        />
                    }
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* CLOZE OVERLAY */}
      {clozeMode && !flipped && clozeData.hasCloze && (
        <div className="absolute inset-0 card-elevated rounded-2xl flex flex-col items-center justify-center p-8"
          style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
          <div className="section-title mb-5">Complete the sentence</div>
          <div className="text-center leading-loose mb-4"
            style={{ color: 'var(--text-primary)', fontSize: '15px', fontFamily: fontForText(clozeData.before + clozeData.after), maxWidth: '90%' }}>
            {clozeData.before}
            <input
              ref={inputRef}
              className={`cloze-input ${clozeResult ? (clozeResult.correct ? 'correct' : 'incorrect') : ''}`}
              style={{ width: `${Math.max((clozeData.answer?.length || 4) + 2, 4) * 0.95}em`, fontFamily: fontForText(clozeData.answer || '') }}
              value={clozeAnswer}
              onChange={e => onClozeChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onClozeSubmit()}
              disabled={!!clozeResult}
            />
            {clozeData.after}
          </div>
          {clozeResult && (
            <div className="text-sm mb-3 font-medium"
              style={{ color: clozeResult.correct ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>
              {clozeResult.correct
                ? `✓ Correct! (${Math.round(clozeResult.similarity * 100)}% match)`
                : `✗ Answer: ${clozeResult.answer}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ExampleDisplay({ text }) {
  const { before, answer, after, hasCloze } = parseCloze(text)
  if (!hasCloze) return <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{text}</span>
  return (
    <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: fontForText(text) }}>
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
        <>
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

          {mode === 'learn' && stats.again > 0 && (
            <div className="text-sm mb-6 p-3 rounded-xl"
              style={{ background: 'rgba(225,112,85,.08)', color: 'var(--accent-danger)', border: '1px solid rgba(225,112,85,.2)' }}>
              {stats.again} card{stats.again !== 1 ? 's' : ''} marked Again — they'll appear in your next session.
            </div>
          )}
        </>
      )}

      <button className="btn-primary w-full py-3 text-base" onClick={onEnd}>← Back to Setup</button>
    </div>
  )
}
