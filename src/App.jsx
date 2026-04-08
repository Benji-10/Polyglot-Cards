import { useEffect, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { api, setTokenProvider } from './lib/api'
import { ToastProvider, useToast } from './components/shared/Toast'
import { useAppStore, applyTheme } from './store/appStore'
import AuthGate from './pages/AuthGate'
import AppShell from './pages/AppShell'
import DeckSelect from './pages/DeckSelect'
import BlueprintPage from './pages/BlueprintPage'
import StudyPage from './pages/StudyPage'
import CollectionPage from './pages/CollectionPage'
import SettingsPage from './pages/SettingsPage'

// ── Offline polling ────────────────────────────────────────
// Browser online/offline events are unreliable — ping a cached static asset instead.
function OfflineWatcher() {
  const toast = useToast()
  useEffect(() => {
    let wasOffline = false
    let toastId = null

    const check = async () => {
      try {
        await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' })
        if (wasOffline) {
          toast.success('Back online!', { duration: 3000 })
          wasOffline = false
          toastId = null
        }
      } catch {
        if (!wasOffline) {
          wasOffline = true
          toastId = toast.warning(
            "You appear to be offline — changes won't sync until reconnected.",
            { duration: 60000 }
          )
        }
      }
    }

    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [toast])
  return null
}

// ── Cloud settings sync ────────────────────────────────────
// On mount: pull cloud settings and merge into local store.
// On every settings change: debounce-push to cloud.
//
// We sync the entire `settings` object (theme, customTheme, quickAddFields, etc.)
// so any device that logs in gets the same experience immediately.
function CloudSettingsSync() {
  const { updateSettings, settings } = useAppStore()
  const pushTimer = useRef(null)
  // Track whether the current settings change came from a cloud pull (don't push back)
  const isPulling = useRef(true) // start true — suppress push on initial mount

  // Load on mount — pull cloud and merge (cloud wins over stale localStorage)
  useEffect(() => {
    let cancelled = false
    api.getCloudSettings()
      .then(cloud => {
        if (cancelled || !cloud || Object.keys(cloud).length === 0) return
        isPulling.current = true   // mark as pull so push useEffect skips
        updateSettings(cloud)
        if (cloud.theme) applyTheme(cloud.theme, cloud.customTheme)
      })
      .catch(() => {/* offline or not set up yet — silently use local */})
      .finally(() => {
        if (!cancelled) isPulling.current = false
      })
    return () => { cancelled = true }
  }, []) // eslint-disable-line

  // Push on every settings change (debounced 1.5s, skip pulls)
  useEffect(() => {
    if (isPulling.current) {
      // Reset flag after the pull-triggered render completes
      isPulling.current = false
      return
    }
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      api.saveCloudSettings(settings).catch(() => {/* offline — local store is the fallback */})
    }, 1500)
    return () => clearTimeout(pushTimer.current)
  }, [settings])

  return null
}

export default function App() {
  const { user, loading, getToken } = useAuth()

  useEffect(() => {
    setTokenProvider(getToken)
  }, [getToken])

  if (loading) return <LoadingScreen />
  if (!user) return <AuthGate />

  return (
    <ToastProvider>
      <OfflineWatcher />
      <CloudSettingsSync />
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
