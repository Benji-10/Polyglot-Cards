import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAppStore } from '../store/appStore'
import { useToast } from '../components/shared/Toast'
import Modal from '../components/shared/Modal'
import { DeckStatsBar } from '../components/shared/StatsBar'
import { useDeckStats } from '../hooks/useDeckStats'
import { getLanguageFlag, LANGUAGES } from '../lib/utils'

export default function DeckSelect() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeDeckId, setActiveDeckId, settings } = useAppStore()
  const toast = useToast()
  const [modal, setModal] = useState(null)
  const defaultSource = settings.defaultSourceLanguage || 'English'

  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['decks'],
    queryFn: api.getDecks,
  })

  const createMutation = useMutation({
    mutationFn: api.createDeck,
    onSuccess: (deck) => {
      qc.invalidateQueries({ queryKey: ['decks'] })
      setActiveDeckId(deck.id)
      setModal(null)
      toast.success(`"${deck.name}" created!`)
      navigate(`/deck/${deck.id}/blueprint`)
    },
    onError: (e) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.updateDeck(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] })
      setModal(null)
      toast.success('Deck updated.')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteDeck,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['decks'] })
      if (activeDeckId === id) setActiveDeckId(null)
      toast.success('Deck deleted.')
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSelect = (deck) => {
    setActiveDeckId(deck.id)
    navigate(`/deck/${deck.id}/study/learn`)
  }

  const handleDelete = (deck, e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${deck.name}" and all its cards? This cannot be undone.`)) return
    deleteMutation.mutate(deck.id)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="section-title mb-1">Your Library</div>
          <h1 className="font-display text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Decks</h1>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setModal('create')}>
          + New Deck
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-44 rounded-2xl shimmer" />)}
        </div>
      ) : decks.length === 0 ? (
        <EmptyState onCreate={() => setModal('create')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {decks.map(deck => (
            <DeckCard
              key={deck.id}
              deck={deck}
              isActive={deck.id === activeDeckId}
              onSelect={() => handleSelect(deck)}
              onEdit={(e) => { e.stopPropagation(); setModal(deck) }}
              onDelete={(e) => handleDelete(deck, e)}
            />
          ))}
          <button
            className="h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all hover:border-purple-500 hover:bg-white/[0.02]"
            style={{ borderColor: 'var(--border)' }}
            onClick={() => setModal('create')}>
            <span className="text-3xl" style={{ color: 'var(--text-muted)' }}>+</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>New Deck</span>
          </button>
        </div>
      )}

      {modal && (
        <DeckFormModal
          deck={modal === 'create' ? null : modal}
          defaultSource={defaultSource}
          onClose={() => setModal(null)}
          onSave={(data) => {
            if (modal === 'create') createMutation.mutate(data)
            else updateMutation.mutate({ id: modal.id, data })
          }}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

function DeckCard({ deck, isActive, onSelect, onEdit, onDelete }) {
  const { stats } = useDeckStats(deck.id)
  const flag = getLanguageFlag(deck.target_language)

  return (
    <div
      className="card p-5 cursor-pointer group relative transition-all duration-200 hover:translate-y-[-2px]"
      style={{ borderColor: isActive ? 'var(--accent-primary)' : undefined, boxShadow: isActive ? '0 0 0 1px var(--accent-primary)' : undefined }}
      onClick={onSelect}>
      {isActive && (
        <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)' }}>Active</span>
      )}
      <div className="text-3xl mb-3">{flag}</div>
      <div className="font-display font-semibold text-base leading-tight mb-1" style={{ color: 'var(--text-primary)' }}>
        {deck.name}
      </div>
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
        {deck.source_language || 'English'} → {deck.target_language}
      </div>
      {deck.description && (
        <div className="text-xs mb-3 truncate" style={{ color: 'var(--text-muted)' }}>{deck.description}</div>
      )}
      {stats.total > 0 ? (
        <div className="mt-3">
          <DeckStatsBar stats={stats} />
          {stats.due > 0 && (
            <div className="text-xs mt-1.5" style={{ color: 'var(--accent-danger)' }}>
              {stats.due} card{stats.due !== 1 ? 's' : ''} due
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>No cards yet</div>
      )}
      <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <button className="btn-ghost p-1.5 text-xs" onClick={onEdit}>✏</button>
        <button className="btn-ghost p-1.5 text-xs" style={{ color: 'var(--accent-danger)' }} onClick={onDelete}>✕</button>
      </div>
    </div>
  )
}

function EmptyState({ onCreate }) {
  return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">📖</div>
      <div className="font-display text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No decks yet</div>
      <div className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Create your first deck, configure a blueprint, and start learning.</div>
      <button className="btn-primary" onClick={onCreate}>Create your first deck</button>
    </div>
  )
}

function DeckFormModal({ deck, defaultSource, onClose, onSave, saving }) {
  const [form, setForm] = useState(
    deck
      ? { name: deck.name, target_language: deck.target_language, source_language: deck.source_language || defaultSource || 'English', description: deck.description || '', card_front_field: deck.card_front_field || 'auto', context_language: deck.context_language || 'target', strict_accents: deck.strict_accents !== false, strict_mode: deck.strict_mode === true }
      : { name: '', target_language: '', source_language: defaultSource || 'English', description: '', card_front_field: 'auto', context_language: 'target', strict_accents: true, strict_mode: false }
  )

  const isEdit = !!deck
  const targetFlag = getLanguageFlag(form.target_language)
  const sourceFlag = getLanguageFlag(form.source_language)

  return (
    <Modal title={isEdit ? 'Edit Deck' : 'New Deck'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="section-title block mb-1.5">Deck Name</label>
          <input className="input" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Spanish Vocabulary" autoFocus />
        </div>

        <div>
          <label className="section-title block mb-1.5">Source Language (you know this)</label>
          <div className="flex gap-2">
            <span className="text-2xl flex items-center">{sourceFlag}</span>
            <select className="input flex-1" value={form.source_language}
              onChange={e => setForm(f => ({ ...f, source_language: e.target.value }))}>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="section-title block mb-1.5">Target Language (you're learning this)</label>
          <div className="flex gap-2">
            <span className="text-2xl flex items-center">{targetFlag}</span>
            <select className="input flex-1" value={form.target_language}
              onChange={e => setForm(f => ({ ...f, target_language: e.target.value }))}>
              <option value="">— Choose a language —</option>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="section-title block mb-1.5">Description <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
          <input className="input" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What is this deck for?" />
        </div>

        <div>
          <label className="section-title block mb-1.5">Card front shows</label>
          <select className="input" value={form.card_front_field}
            onChange={e => setForm(f => ({ ...f, card_front_field: e.target.value }))}>
            <option value="auto">Auto (word only)</option>
            <option value="word+hint">Word + first show_on_front field</option>
          </select>
        </div>

        <div>
          <label className="section-title block mb-1.5">Context on card front (Target → Source)</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'target', label: 'Context field', desc: 'Short grammatical hint in target language (e.g. 명사, 단수)' },
              { v: 'cloze',  label: 'Cloze sentence', desc: 'Example sentence with the word blanked out' },
            ].map(({ v, label, desc }) => (
              <button key={v} type="button"
                className="flex flex-col items-start p-3 rounded-xl border transition-all text-left"
                style={{ borderColor: form.context_language === v ? 'var(--accent-primary)' : 'var(--border)', background: form.context_language === v ? 'var(--accent-glow)' : 'transparent' }}
                onClick={() => setForm(f => ({ ...f, context_language: v }))}>
                <span className="text-xs font-medium" style={{ color: form.context_language === v ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{label}</span>
                <span className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</span>
              </button>
            ))}
          </div>
          <div className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Helps distinguish homographs when shown the target word (e.g. "bank" — financial vs river).
          </div>
        </div>

        <div>
          <label className="section-title block mb-1.5">Typing settings</label>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Strict accents</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Require correct accent marks (é ≠ e)</div>
              </div>
              <ToggleSwitch value={form.strict_accents} onChange={v => setForm(f => ({ ...f, strict_accents: v }))} />
            </label>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Strict mode</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Exact spelling required — no typo tolerance</div>
              </div>
              <ToggleSwitch value={form.strict_mode} onChange={v => setForm(f => ({ ...f, strict_mode: v }))} />
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1"
            disabled={!form.name.trim() || !form.target_language || saving}
            onClick={() => onSave(form)}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Deck →'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ToggleSwitch({ value, onChange }) {
  return (
    <button role="switch" aria-checked={value} type="button"
      className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0"
      style={{ background: value ? 'var(--accent-primary)' : 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      onClick={() => onChange(!value)}>
      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
        style={{ left: value ? '24px' : '3px' }} />
    </button>
  )
}
