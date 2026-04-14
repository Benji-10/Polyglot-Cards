import { useEffect } from 'react'

export default function Modal({ title, onClose, children, size = 'md' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const maxWidths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative card-elevated p-6 w-full ${maxWidths[size]} animate-slide-up max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button className="btn-ghost p-1.5 text-lg leading-none" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
