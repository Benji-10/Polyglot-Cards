import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useAppStore } from '../store/appStore'
import { useQuery } from '@tanstack/react-query'
import { useDeckStats } from '../hooks/useDeckStats'
import { api } from '../lib/api'
import { getLanguageFlag } from '../lib/utils'

export default function AppShell() {
  const { logout, user } = useAuth()
  const { activeDeckId, setActiveDeckId } = useAppStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: decks = [] } = useQuery({
    queryKey: ['decks'],
    queryFn: api.getDecks,
  })

  const activeDeck = decks.find(d => d.id === activeDeckId)
  const { stats } = useDeckStats(activeDeckId)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    // h-screen + overflow-hidden keeps the shell viewport-locked.
    // Each region (sidebar scroll area, main) scrolls independently.
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col flex-shrink-0 transition-transform duration-300
          lg:translate-x-0 lg:static lg:flex ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: '220px', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo — never scrolls */}
        <div className="flex-shrink-0 flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-2xl font-display font-bold" style={{ color: 'var(--accent-primary)' }}>多</span>
          <div>
            <div className="font-display font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>Polyglot</div>
            <div className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>Cards</div>
          </div>
        </div>

        {/* Scrollable nav — grows to fill space between logo and footer */}
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {/* Active deck pill */}
          {activeDeck ? (
            <div
              className="mx-3 mt-2 mb-1 p-3 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: 'var(--accent-glow)', border: '1px solid rgba(124,106,240,.3)' }}
              onClick={() => { navigate('/'); closeSidebar() }}
            >
              <div className="section-title mb-1">Active Deck</div>
              <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {getLanguageFlag(activeDeck.target_language)} {activeDeck.name}
              </div>
              {stats.due > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  <span className="text-xs" style={{ color: 'var(--accent-danger)' }}>{stats.due} due</span>
                  {stats.new > 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {stats.new} new</span>}
                </div>
              )}
              {stats.due === 0 && stats.total > 0 && (
                <div className="text-xs mt-2" style={{ color: 'var(--accent-secondary)' }}>✓ All caught up</div>
              )}
            </div>
          ) : (
            <div
              className="mx-3 mt-2 mb-1 p-3 rounded-xl cursor-pointer border-dashed border-2 text-center"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => { navigate('/'); closeSidebar() }}
            >
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a deck</div>
            </div>
          )}

          {/* Deck nav — only when a deck is active */}
          {activeDeck && (
            <div className="px-3 mt-4 space-y-0.5">
              <div className="section-title px-2 mb-2">Deck</div>
              {[
                { label: 'Learn',      icon: '🧠', path: `/deck/${activeDeckId}/study/learn` },
                { label: 'Freestyle',  icon: '🎯', path: `/deck/${activeDeckId}/study/freestyle` },
                { label: 'Blueprint',  icon: '🗺',  path: `/deck/${activeDeckId}/blueprint` },
                { label: 'Collection', icon: '📚', path: `/deck/${activeDeckId}/collection` },
              ].map(item => (
                <NavLink
                  key={item.label}
                  to={item.path}
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'font-medium' : ''}`
                  }
                  style={({ isActive }) => ({
                    background: isActive ? 'var(--accent-glow)' : 'transparent',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  })}
                >
                  <span style={{ fontSize: '14px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.label === 'Learn' && stats.due > 0 && (
                    <span
                      className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--accent-danger)', color: 'white', fontSize: '10px' }}
                    >
                      {stats.due}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          )}

          {/* App nav — always visible, pinned at bottom of scroll area */}
          <div className="px-3 mt-4 space-y-0.5">
            <div className="section-title px-2 mb-2">App</div>
            <NavLink
              to="/"
              onClick={closeSidebar}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'font-medium' : ''}`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
              })}
              end
            >
              <span style={{ fontSize: '14px' }}>◈</span> All Decks
            </NavLink>
            <NavLink
              to="/settings"
              onClick={closeSidebar}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'font-medium' : ''}`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
              })}
            >
              <span style={{ fontSize: '14px' }}>⚙</span> Settings
            </NavLink>
          </div>
        </div>

        {/* User footer — never scrolls */}
        <div className="flex-shrink-0 p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg w-full text-left transition-all hover:bg-white/5"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
              style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)', border: '1px solid rgba(124,106,240,.4)' }}
            >
              {user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {user?.email?.split('@')[0]}
            </span>
            <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>↪</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={closeSidebar} />
      )}

      {/* ── Main content ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header
          className="lg:hidden flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <button className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
          <span className="font-display font-bold text-lg" style={{ color: 'var(--accent-primary)' }}>多言語</span>
          {activeDeck && (
            <span className="text-sm truncate ml-1" style={{ color: 'var(--text-muted)' }}>
              · {activeDeck.name}
            </span>
          )}
        </header>

        {/* Page content — scrolls independently of sidebar */}
        <main className="flex-1 overflow-y-auto min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
