import { useState, useEffect, useCallback } from 'react'

let netlifyIdentity = null

function getNetlifyIdentity() {
  if (netlifyIdentity) return netlifyIdentity
  if (typeof window !== 'undefined' && window.netlifyIdentity) {
    netlifyIdentity = window.netlifyIdentity
  }
  return netlifyIdentity
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ni = getNetlifyIdentity()
    if (!ni) { setLoading(false); return }

    ni.on('init', (u) => { setUser(u); setLoading(false) })
    ni.on('login', (u) => { setUser(u); ni.close() })
    ni.on('logout', () => setUser(null))
    ni.on('error', () => setLoading(false))

    ni.init()
    return () => {
      ni.off('init')
      ni.off('login')
      ni.off('logout')
      ni.off('error')
    }
  }, [])

  const login = useCallback(() => getNetlifyIdentity()?.open('login'), [])
  const signup = useCallback(() => getNetlifyIdentity()?.open('signup'), [])
  const logout = useCallback(() => getNetlifyIdentity()?.logout(), [])

  const getToken = useCallback(async () => {
    const ni = getNetlifyIdentity()
    if (!ni?.currentUser()) return null
    const token = await ni.currentUser().jwt()
    return token
  }, [])

  return { user, loading, login, signup, logout, getToken }
}
