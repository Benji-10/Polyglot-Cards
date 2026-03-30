import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const PAGE_SIZE = 50

export default function CollectionPage() {
  const { deckId } = useParams()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all|new|review|due
  const [editCard, setEditCard] = useState(null)
  const [page, setPage] = useState(0)

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => api.getCards(deckId),
  })

  const { data: blueprint = [] } = useQuery({
    queryKey: ['blueprint', deckId],
    queryFn: () => api.getBlueprintFields(deckId),
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteCard,
    onSuccess: (_, id) => {
      qc.setQueryData(['cards', deckId], old => old?.filter(c => c.id !== id))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.updateCard(id, data),
    onSuccess: (updated) => {
      qc.setQueryData(['cards', deckId], old => old?.map(c => c.id === updated.id ? updated : c))
      setEditCard(null)
    },
  })

  const now = new Date()
  const filtered = useMemo(() => {
    let c = cards
    if (search) c = c.filter(card => card.word.toLowerCase().includes(search.toLowerCase()) ||
      Object.values(card.fields || {}).some(v => String(v).toLowerCase().includes(search.toLowerCase())))
    if (filter === 'new') c = c.filter(x => x.srs_state === 'new' || !x.seen)
    if (filter === 'review') c = c.filter(x => x.srs_state === 'review')
    if (filter === 'due') c = c.filter(x => x.due && new Date(x.due) <= now)
    return c
  }, [cards, search, filter])

  const page_cards = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const stateColor = (state) => {
    if (state === 'new' || !state) return 'var(--text-muted)'
    if (state === 'learning') return '#fdcb6e'
    if (state === 'review') return 'var(--accent-secondary)'
    if (state === 'relearning') return 'var(--accent-danger)'
    return 'var(--text-muted)'
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="section-title mb-1">Collection</div>
          <h1 className="font-display text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Cards <span className="text-lg font-normal" style={{ color: 'var(--text-muted)' }}>({filtered.length})</span>
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          className="input flex-1 min-w-48"
          placeholder="Search cards..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
        />
        <div className="flex gap-1">
          {[['all','All'],['new','New'],['review','Review'],['due','Due']].map(([v,l]) => (
            <button key={v}
              className="text-xs px-3 py-2 rounded-lg border transition-all"
              style={{ borderColor: filter === v ? 'var(--accent-primary)' : 'var(--border)', color: filter === v ? 'var(--accent-primary)' : 'var(--text-secondary)', background: filter === v ? 'var(--accent-glow)' : 'transparent' }}
              onClick={() => { setFilter(v); setPage(0) }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl shimmer" />)}
        </div>
      ) : page_cards.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>No cards match</div>
      ) : (
        <div className="card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <th className="px-4 py-3 text-left section-title w-32">Word</th>
                {blueprint.slice(0, 3).map(f => (
                  <th key={f.key} className="px-4 py-3 text-left section-title hidden md:table-cell">{f.label}</th>
                ))}
                <th className="px-4 py-3 text-left section-title w-20 hidden sm:table-cell">State</th>
                <th className="px-4 py-3 text-left section-title w-20 hidden lg:table-cell">Due</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {page_cards.map((card, i) => (
                <tr key={card.id}
                  style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}
                  className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{card.word}</td>
                  {blueprint.slice(0, 3).map(f => (
                    <td key={f.key} className="px-4 py-3 hidden md:table-cell max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {card.fields?.[f.key] || '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs font-medium" style={{ color: stateColor(card.srs_state) }}>
                      {card.srs_state || 'new'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs" style={{ color: 'var(--text-muted)' }}>
                    {card.due ? new Date(card.due).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="btn-ghost p-1.5 text-xs" onClick={() => setEditCard(card)}>✏</button>
                      <button className="btn-ghost p-1.5 text-xs" style={{ color: 'var(--accent-danger)' }}
                        onClick={() => confirm('Delete card?') && deleteMutation.mutate(card.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button className="btn-ghost text-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{page + 1} / {totalPages}</span>
          <button className="btn-ghost text-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {/* Edit modal */}
      {editCard && (
        <EditCardModal
          card={editCard}
          blueprint={blueprint}
          onClose={() => setEditCard(null)}
          onSave={(data) => updateMutation.mutate({ id: editCard.id, data })}
          saving={updateMutation.isPending}
        />
      )}
    </div>
  )
}

function EditCardModal({ card, blueprint, onClose, onSave, saving }) {
  const [word, setWord] = useState(card.word)
  const [fields, setFields] = useState({ ...card.fields })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card-elevated p-6 w-full max-w-lg animate-slide-up max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Edit Card</h2>
          <button className="btn-ghost p-1" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="section-title block mb-1.5">Word</label>
            <input className="input" value={word} onChange={e => setWord(e.target.value)} />
          </div>
          {blueprint.map(f => (
            <div key={f.key}>
              <label className="section-title block mb-1.5">{f.label}</label>
              {f.field_type === 'example' ? (
                <div>
                  <textarea className="input text-sm resize-none" rows={3} value={fields[f.key] || ''}
                    onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))} />
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Use {'{{word}}'} to mark the cloze target
                  </div>
                </div>
              ) : (
                <input className="input text-sm" value={fields[f.key] || ''}
                  onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-primary flex-1" disabled={saving}
              onClick={() => onSave({ word, fields })}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
