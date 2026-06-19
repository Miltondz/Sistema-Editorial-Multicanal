'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function BannerSettingsForm() {
  // Dynamic Convex api refs; cast required. Validated against convex/editorialBanner.ts.
  const current = useQuery((api.editorialBanner as any).getActive, {})
  const upsert  = useMutation((api.editorialBanner as any).upsert)

  const [title,       setTitle]   = useState('Diversidad en los Cómics')
  const [description, setDesc]    = useState('Contenido destacado: personajes que rompieron barreras en la historia del cómic.')
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
    setSaving(true); setSaved(false)
    try {
      await upsert({
        title,
        description,
        badgeText,
        imageUrl: imageUrl.trim() || undefined,
        ctaLabel,
        ctaHref: ctaHref.trim() || undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-2xl">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900">Banner editorial</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Aparece en la cabecera del dashboard. El placeholder se muestra si no hay banner guardado.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className={labelClass}>Badge / Etiqueta superior</label>
          <input
            value={badgeText}
            onChange={e => setBadge(e.target.value)}
            className={inputClass}
            placeholder="HOY ES UN DÍA ESPECIAL"
          />
        </div>

        <div>
          <label className={labelClass}>Título</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Aniversario de Storm (Ororo Munroe)"
            required
          />
        </div>

        <div>
          <label className={labelClass}>Descripción</label>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            className={inputClass + ' resize-none'}
            rows={3}
            placeholder="Hoy se cumplen X años de la primera aparición de..."
          />
        </div>

        <div>
          <label className={labelClass}>URL de imagen (opcional)</label>
          <input
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            className={inputClass}
            placeholder="https://... o URL de Convex storage"
            type="url"
          />
          <p className="text-xs text-gray-400 mt-1">Deja vacío para mostrar el placeholder de color.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Texto del botón principal</label>
            <input
              value={ctaLabel}
              onChange={e => setCtaLabel(e.target.value)}
              className={inputClass}
              placeholder="Ver sugerencias"
              required
            />
          </div>
          <div>
            <label className={labelClass}>Destino del botón (ruta)</label>
            <input
              value={ctaHref}
              onChange={e => setCtaHref(e.target.value)}
              className={inputClass}
              placeholder="/catalog"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar banner'}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">✓ Guardado</span>
          )}
        </div>
      </form>
    </div>
  )
}
