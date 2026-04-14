export function DeckStatsBar({ stats }) {
  const { total, new: newCount, learning, review, relearning } = stats
  if (total === 0) return null
  const segments = [
    { key: 'new', label: 'New', count: newCount, color: 'var(--text-muted)' },
    { key: 'learning', label: 'Learning', count: learning, color: '#fdcb6e' },
    { key: 'review', label: 'Review', count: review, color: 'var(--accent-secondary)' },
    { key: 'relearning', label: 'Relearning', count: relearning, color: 'var(--accent-danger)' },
  ].filter(s => s.count > 0)
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-1.5 mb-2" style={{ background: 'var(--bg-elevated)' }}>
        {segments.map(s => (
          <div key={s.key} style={{ width: `${(s.count/total)*100}%`, background: s.color, transition: 'width 0.5s ease' }} />
        ))}
      </div>
      <div className="flex gap-3 flex-wrap">
        {segments.map(s => (
          <span key={s.key} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.color }} />
            {s.count} {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function StatCard({ label, value, color, sub }) {
  return (
    <div className="card p-4 text-center">
      <div className="font-display text-3xl font-bold mb-1" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}
