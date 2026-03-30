import { useState, useCallback, useEffect, createContext, useContext, useRef } from 'react'

const ToastContext = createContext(null)

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(t => t.map(x => x.id === id ? { ...x, leaving: true } : x))
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 300)
  }, [])

  const toast = useCallback((message, { type = 'info', duration = 3000 } = {}) => {
    const id = ++toastId
    setToasts(t => [...t, { id, message, type, leaving: false }])
    setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  toast.success = (msg, opts) => toast(msg, { type: 'success', ...opts })
  toast.error = (msg, opts) => toast(msg, { type: 'error', duration: 5000, ...opts })
  toast.warning = (msg, opts) => toast(msg, { type: 'warning', ...opts })

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const TYPE_STYLES = {
  info:    { icon: 'ℹ', color: 'var(--accent-primary)',    bg: 'var(--accent-glow)' },
  success: { icon: '✓', color: 'var(--accent-secondary)',  bg: 'rgba(0,212,168,.12)' },
  error:   { icon: '✕', color: 'var(--accent-danger)',     bg: 'rgba(225,112,85,.12)' },
  warning: { icon: '⚠', color: '#fdcb6e',                  bg: 'rgba(253,203,110,.12)' },
}

function Toast({ toast, onDismiss }) {
  const s = TYPE_STYLES[toast.type] || TYPE_STYLES.info
  return (
    <div
      onClick={onDismiss}
      style={{
        pointerEvents: 'all',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: '12px',
        background: 'var(--bg-elevated)',
        border: `1px solid ${s.bg}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        minWidth: '240px',
        maxWidth: '360px',
        transition: 'opacity 0.3s, transform 0.3s',
        opacity: toast.leaving ? 0 : 1,
        transform: toast.leaving ? 'translateY(8px)' : 'translateY(0)',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      <span style={{ color: s.color, fontSize: '14px', flexShrink: 0 }}>{s.icon}</span>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1 }}>{toast.message}</span>
    </div>
  )
}
