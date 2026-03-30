import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function AuthGate() {
  const { login, signup } = useAuth()

  useEffect(() => {
    // Init Netlify Identity widget
    if (window.netlifyIdentity) {
      window.netlifyIdentity.on('init', (user) => {
        if (!user) window.netlifyIdentity.open()
      })
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--bg-primary)' }}>

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--accent-primary), transparent)' }} />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--accent-secondary), transparent)' }} />
      </div>

      <div className="relative z-10 text-center max-w-md w-full animate-slide-up">
        {/* Logo */}
        <div className="mb-8">
          <div className="text-6xl font-display font-bold mb-2"
            style={{ color: 'var(--accent-primary)' }}>
            多言語
          </div>
          <div className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Polyglot Cards
          </div>
          <div className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            AI-powered flashcards for multi-language learners
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {['FSRS Algorithm', 'AI Generation', 'Cloze Deletion', 'Custom Blueprints'].map(f => (
            <span key={f} className="tag">{f}</span>
          ))}
        </div>

        {/* Auth buttons */}
        <div className="card p-8 space-y-4">
          <button className="btn-primary w-full text-base py-3" onClick={login}>
            Sign In
          </button>
          <button className="btn-secondary w-full text-base py-3" onClick={signup}>
            Create Account
          </button>
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            Powered by Netlify Identity · Your data syncs across all devices
          </p>
        </div>
      </div>
    </div>
  )
}
