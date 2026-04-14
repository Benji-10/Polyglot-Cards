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

function OfflineWatcher() {
  const toast = useToast()
  useEffect(() => {
    let wasOffline = false
    const check = async () => {
      try {
        await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' })
        if (wasOffline) { toast.success('Back online!', { duration: 3000 }); wasOffline = false }
      } catch {
        if (!wasOffline) { wasOffline = true; toast.warning("You appear to be offline — changes won't sync until reconnected.", { duration: 60000 }) }
      }
    }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [toast])
  return null
}

function CloudSettingsSync() {
  const { updateSettings, settings } = useAppStore()
  const pushTimer = useRef(null)
  const isPulling = useRef(true)

  useEffect(() => {
    let cancelled = false
    api.getCloudSettings()
      .then(cloud => {
        if (cancelled || !cloud || Object.keys(cloud).length === 0) return
        isPulling.current = true
        updateSettings(cloud)
        if (cloud.theme) applyTheme(cloud.theme, cloud.customTheme)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) isPulling.current = false })
    return () => { cancelled = true }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (isPulling.current) { isPulling.current = false; return }
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      api.saveCloudSettings(settings).catch(() => {})
    }, 1500)
    return () => clearTimeout(pushTimer.current)
  }, [settings])

  return null
}

function AnimationController() {
  const { settings } = useAppStore()
  useEffect(() => {
    if (settings.animationsEnabled === false) document.documentElement.setAttribute('data-no-animations', '')
    else document.documentElement.removeAttribute('data-no-animations')
  }, [settings.animationsEnabled])
  return null
}

export default function App() {
  const { user, loading, getToken } = useAuth()
  useEffect(() => { setTokenProvider(getToken) }, [getToken])
  if (loading) return <LoadingScreen />
  if (!user) return <AuthGate />
  return (
    <ToastProvider>
      <OfflineWatcher />
      <CloudSettingsSync />
      <AnimationController />
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
        <div className="text-5xl font-display font-bold mb-3 animate-pulse" style={{ color: 'var(--accent-primary)' }}>多言語</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    </div>
  )
}
