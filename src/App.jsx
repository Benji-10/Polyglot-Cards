import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { setTokenProvider } from './lib/api'
import { ToastProvider } from './components/shared/Toast'
import AuthGate from './pages/AuthGate'
import AppShell from './pages/AppShell'
import DeckSelect from './pages/DeckSelect'
import BlueprintPage from './pages/BlueprintPage'
import StudyPage from './pages/StudyPage'
import CollectionPage from './pages/CollectionPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const { user, loading, getToken } = useAuth()

  useEffect(() => {
    setTokenProvider(getToken)
  }, [getToken])

  if (loading) return <LoadingScreen />
  if (!user) return <AuthGate />

  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<DeckSelect />} />
          <Route path="deck/:deckId/blueprint" element={<BlueprintPage />} />
          <Route path="deck/:deckId/study/:mode" element={<StudyPage />} />
          <Route path="deck/:deckId/collection" element={<CollectionPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="text-center">
        <div className="text-5xl font-display font-bold mb-3 animate-pulse" style={{ color: 'var(--accent-primary)' }}>
          多言語
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    </div>
  )
}
