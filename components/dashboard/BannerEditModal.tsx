'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

interface BannerEditModalProps {
  open: boolean
  onClose: () => void
}

export function BannerEditModal({ open, onClose }: BannerEditModalProps) {
  const current = useQuery((api.editorialBanner as any).getActive, {})
  const upsert  = useMutation((api.editorialBanner as any).upsert)

  const [title,       setTitle]   = useState('Diversidad en los Cómics')
  const [description, setDesc]    = useState('')
  const [badgeText,   setBadge]   = useState('HOY ES UN DÍA ESPECIAL')
  const [imageUrl,    setImageUrl] = useState('')
  const [ctaLabel,    setCtaLabel] = useState('Ver sugerencias')
  const [ctaHref,     setCtaHref] = useState('/catalog')
  const [saving,      setSaving]  = useState(false)
  const [saved,       setSaved]   = useState(false)

  useEffect(() => {
    if (current) {
      setTitle(current.title)
      setDesc(current.description)
      setBadge(current.badgeText)
      setImageUrl(current.imageUrl ?? '')
      setCtaLabel(current.ctaLabel)
      setCtaHref(current.ctaHref ?? '/catalog')
    }
  }, [current])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await upsert({
        title, description, badgeText,
        imageUrl: imageUrl.trim() || undefined,
        ctaLabel,
        ctaHref: ctaHref.trim() || undefined,
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 1200)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Editar banner editorial</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className={labelClass}>Badge / Etiqueta</label>
            <input value={badgeText} onChange={e => setBadge(e.target.value)} className={inputClass} placeholder="HOY ES UN DÍA ESPECIAL" />
          </div>
          <div>
            <label className={labelClass}>Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputClass} required placeholder="Aniversario de Storm..." />
          </div>
          <div>
            <label className={labelClass}>Descripción</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} className={inputClass + ' resize-none'} rows={3} placeholder="Descripción editorial..." />
          </div>
          <div>
            <label className={labelClass}>URL de imagen (opcional)</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} className={inputClass} type="url" placeholder="https://..." />
            <p className="text-[11px] text-slate-400 mt-1">Vacío = muestra el placeholder de color</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Texto botón CTA</label>
              <input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} className={inputClass} required placeholder="Ver sugerencias" />
            </div>
            <div>
              <label className={labelClass}>Destino (ruta)</label>
              <input value={ctaHref} onChange={e => setCtaHref(e.target.value)} className={inputClass} placeholder="/catalog" />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
              Cancelar
            </button>
            {saved && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
