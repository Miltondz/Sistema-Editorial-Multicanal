'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'

type DateType = 'anniversary' | 'one_time'
type Tab = 'upcoming' | 'all'
interface Idea { title: string; body: string; hashtags: string[] }

// ── Color maps ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  character_birthday:   'bg-violet-100 text-violet-800',
  creator_birthday:     'bg-blue-100 text-blue-800',
  creator_death:        'bg-slate-200 text-slate-700',
  first_appearance:     'bg-emerald-100 text-emerald-800',
  series_anniversary:   'bg-amber-100 text-amber-800',
  award:                'bg-yellow-100 text-yellow-800',
  industry_milestone:   'bg-orange-100 text-orange-800',
  organization_founded: 'bg-teal-100 text-teal-800',
  cultural_event:       'bg-pink-100 text-pink-800',
}

const CATEGORY_LABELS: Record<string, string> = {
  character_birthday:   'Cumpleaños personaje',
  creator_birthday:     'Cumpleaños creador',
  creator_death:        'In memoriam',
  first_appearance:     'Primera aparición',
  series_anniversary:   'Aniversario serie',
  award:                'Premio',
  industry_milestone:   'Hito industria',
  organization_founded: 'Fundación',
  cultural_event:       'Evento cultural',
}

const DIVERSITY_COLORS: Record<string, string> = {
  black:           'bg-[#1a1a2e] text-white',
  latinx:          'bg-yellow-600 text-white',
  asian:           'bg-red-600 text-white',
  indigenous:      'bg-green-800 text-white',
  middle_eastern:  'bg-emerald-700 text-white',
  lgbtq:           'bg-purple-600 text-white',
  transgender:     'bg-[#55CDFC] text-[#5B5EA6]',
  disability:      'bg-blue-700 text-white',
  women:           'bg-pink-500 text-white',
  nonbinary:       'bg-yellow-300 text-purple-800',
  multiracial:     'bg-orange-400 text-white',
  jewish:          'bg-blue-800 text-white',
  muslim:          'bg-green-600 text-white',
  international:   'bg-indigo-600 text-white',
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[category] ?? 'bg-slate-100 text-slate-500'}`}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  )
}

function DiversityChip({ tag }: { tag: string }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${DIVERSITY_COLORS[tag] ?? 'bg-slate-200 text-slate-700'}`}>
      {tag}
    </span>
  )
}

function ConfidenceDot({ confidence }: { confidence?: string }) {
  const color = confidence === 'high' ? 'bg-green-500' : confidence === 'low' ? 'bg-red-400' : 'bg-yellow-400'
  const label = confidence === 'high' ? 'Alta' : confidence === 'low' ? 'Baja' : 'Media'
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-400">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}

function DateThumbnail({ url, alt, title }: { url?: string; alt?: string; title: string }) {
  const [failed, setFailed] = useState(false)
  const initials = title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className="shrink-0 w-10 rounded-lg overflow-hidden flex items-center justify-center bg-indigo-900" style={{ height: 60 }}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt ?? title} className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-white text-xs font-bold opacity-60">{initials}</span>
      )}
    </div>
  )
}

function CountdownBadge({ days }: { days: number }) {
  if (days === 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">Hoy</span>
  if (days === 1) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Mañana</span>
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">En {days} días</span>
}

function ActiveSwitch({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-8 rounded-full transition-colors duration-200 focus:outline-none ${active ? 'bg-green-500' : 'bg-slate-200'}`}
      style={{ minWidth: 32, height: 18 }}
    >
      <span
        className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: active ? 'translateX(14px)' : 'translateX(0)', width: 14, height: 14 }}
      />
    </button>
  )
}

// ── Banner image uploader ─────────────────────────────────────────────────────

function BannerUploader({
  currentUrl,
  onUrlChange,
}: {
  currentUrl: string
  onUrlChange: (url: string) => void
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateUploadUrl = useMutation((api.specialDates as any).generateBannerUploadUrl)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const uploadUrl = await generateUploadUrl({})
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
      const { storageId } = await res.json()
      onUrlChange(`convex-storage:${storageId}`)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir imagen')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const isStorageRef = currentUrl.startsWith('convex-storage:')
  const displayUrl = isStorageRef ? undefined : currentUrl

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={isStorageRef ? '' : currentUrl}
          onChange={e => onUrlChange(e.target.value)}
          placeholder="https://… URL de imagen banner"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {uploading ? '⏳' : '⬆ Subir'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {isStorageRef && (
        <p className="text-[11px] text-indigo-600">✓ Imagen subida — se guardará al confirmar</p>
      )}
      {uploadError && (
        <p className="text-[11px] text-red-600">{uploadError}</p>
      )}
      {displayUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={displayUrl} alt="Preview banner" className="w-full h-20 object-cover rounded-lg border border-gray-200" onError={() => {}} />
      )}
    </div>
  )
}

// ── Search modal ──────────────────────────────────────────────────────────────

interface SearchModalProps {
  open: boolean
  onClose: () => void
  onSearch: (month: number, day?: number) => Promise<void>
  searching: boolean
  result: { found: number; inserted: number; skipped: number } | null
  error: string | null
}

function SearchModal({ open, onClose, onSearch, searching, result, error }: SearchModalProps) {
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [day,   setDay]   = useState('')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">Buscar con Perplexity</h2>
            <p className="text-xs text-gray-400 mt-0.5">Búsqueda web en tiempo real — fechas de diversidad en cómics.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Día (opcional)</label>
            <input
              type="number" min={1} max={31} value={day}
              onChange={e => setDay(e.target.value)}
              placeholder="Todos los días"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {result && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm">
            <p className="font-semibold text-green-800">Búsqueda completada</p>
            <p className="text-green-700 text-xs mt-1">
              {result.found} encontradas · {result.inserted} nuevas · {result.skipped} omitidas
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSearch(month, day ? parseInt(day) : undefined)}
            disabled={searching}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {searching ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
                </svg>
                Buscando…
              </span>
            ) : '✦ Buscar con Perplexity'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit date modal ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditDateModal({ date: d, onClose }: { date: any; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateDate         = useMutation((api.specialDates as any).update)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmBannerUpload = useMutation((api.specialDates as any).confirmBannerUpload)

  const [fDate,      setFDate]      = useState<string>(d.date ?? '')
  const [fType,      setFType]      = useState<DateType>(d.dateType ?? 'anniversary')
  const [fTitle,     setFTitle]     = useState<string>(d.title ?? '')
  const [fDesc,      setFDesc]      = useState<string>(d.description ?? '')
  const [fScore,     setFScore]     = useState<number>(d.relevanceScore ?? 5)
  const [fTags,      setFTags]      = useState<string>((d.tags ?? []).join(', '))
  const [fCategory,  setFCategory]  = useState<string>(d.category ?? '')
  const [fTeaser,    setFTeaser]    = useState<string>(d.teaserText ?? '')
  const [fBanner,    setFBanner]    = useState<string>(d.bannerImageUrl ?? '')
  const [fBannerAlt, setFBannerAlt] = useState<string>(d.bannerImageAlt ?? '')
  const [fDiversity, setFDiversity] = useState<string>((d.diversityTags ?? []).join(', '))
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      let bannerUrl = fBanner
      let bannerAlt = fBannerAlt || undefined

      // Handle convex-storage: prefix from BannerUploader
      if (fBanner.startsWith('convex-storage:')) {
        const storageId = fBanner.replace('convex-storage:', '')
        bannerUrl = await confirmBannerUpload({ id: d._id, storageId, alt: bannerAlt }) as string
        bannerAlt = bannerAlt
      }

      await updateDate({
        id: d._id,
        date:          fDate || undefined,
        dateType:      fType,
        title:         fTitle || undefined,
        description:   fDesc || undefined,
        relevanceScore: fScore,
        tags:          fTags.split(',').map(t => t.trim()).filter(Boolean),
        category:      fCategory || undefined,
        teaserText:    fTeaser || undefined,
        bannerImageUrl: bannerUrl || undefined,
        bannerImageAlt: bannerAlt,
        diversityTags: fDiversity.split(',').map(t => t.trim()).filter(Boolean),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-bold text-gray-900">Editar fecha especial</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha</label>
              <input value={fDate} onChange={e => setFDate(e.target.value)} className={inputClass}
                placeholder={fType === 'anniversary' ? 'MM-DD' : 'YYYY-MM-DD'} />
              <p className="text-[11px] text-gray-400 mt-1">
                {fType === 'anniversary' ? 'MM-DD anual' : 'YYYY-MM-DD única'}
              </p>
            </div>
            <div>
              <label className={labelClass}>Tipo</label>
              <select value={fType} onChange={e => setFType(e.target.value as DateType)} className={inputClass}>
                <option value="anniversary">Aniversario (anual)</option>
                <option value="one_time">Fecha única</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Título *</label>
            <input value={fTitle} onChange={e => setFTitle(e.target.value)} className={inputClass} required />
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} className={inputClass + ' resize-none'} rows={2} />
          </div>

          <div>
            <label className={labelClass}>Teaser (texto corto para banner)</label>
            <input value={fTeaser} onChange={e => setFTeaser(e.target.value)} className={inputClass} placeholder="Un párrafo breve…" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Categoría</label>
              <select value={fCategory} onChange={e => setFCategory(e.target.value)} className={inputClass}>
                <option value="">— Sin categoría —</option>
                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Relevancia (1-10)</label>
              <input type="number" min={1} max={10} value={fScore}
                onChange={e => setFScore(Number(e.target.value))} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Tags (separados por coma)</label>
            <input value={fTags} onChange={e => setFTags(e.target.value)} className={inputClass}
              placeholder="Black Panther, Wakanda, Marvel" />
          </div>

          <div>
            <label className={labelClass}>Tags diversidad (separados por coma)</label>
            <input value={fDiversity} onChange={e => setFDiversity(e.target.value)} className={inputClass}
              placeholder="black, lgbtq, women…" />
          </div>

          <div>
            <label className={labelClass}>Imagen banner</label>
            <BannerUploader currentUrl={fBanner} onUrlChange={setFBanner} />
          </div>

          <div>
            <label className={labelClass}>Alt texto imagen</label>
            <input value={fBannerAlt} onChange={e => setFBannerAlt(e.target.value)} className={inputClass}
              placeholder="Descripción accesible de la imagen" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Ideas section ─────────────────────────────────────────────────────────────

function IdeasSection({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: d,
  extraIdeas,
  onClear,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
  extraIdeas: Idea[]
  onClear: () => void
}) {
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const developIdea = useAction((api.actions.specialDates as any).developIdea)
  const [developing, setDeveloping] = useState<number | null>(null)
  const [devError, setDevError] = useState<string | null>(null)

  let ideas: Idea[] = []
  if (d.aiIdeas) {
    try { ideas = JSON.parse(d.aiIdeas).ideas as Idea[] } catch { /* noop */ }
  }
  if (ideas.length === 0) ideas = extraIdeas

  if (ideas.length === 0) return null

  async function handleDevelop(idea: Idea, idx: number) {
    setDeveloping(idx); setDevError(null)
    try {
      const result = await developIdea({
        specialDateTitle: d.title,
        ideaTitle:        idea.title,
        ideaBody:         idea.body,
        ideaHashtags:     idea.hashtags,
        diversityTags:    d.diversityTags ?? [],
      }) as { contentItemId: string }
      router.push(`/catalog/${result.contentItemId}`)
    } catch (err) {
      setDevError(err instanceof Error ? err.message : 'Error al desarrollar')
    } finally {
      setDeveloping(null)
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ideas IA ({ideas.length})</p>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-red-400 hover:text-red-600 transition-colors"
        >
          ✕ Eliminar ideas
        </button>
      </div>
      {devError && <p className="text-xs text-red-600 mb-2">{devError}</p>}
      <div className="space-y-2">
        {ideas.map((idea, i) => (
          <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-gray-800 flex-1">{idea.title}</p>
              <button
                type="button"
                disabled={developing === i}
                onClick={() => handleDevelop(idea, i)}
                className="shrink-0 px-2.5 py-1 text-[10px] font-semibold bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {developing === i ? '⏳ Generando…' : '→ Desarrollar'}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">{idea.body}</p>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {idea.hashtags.map((h, hi) => (
                <span key={hi} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{h}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SpecialDatesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dates        = useQuery((api.specialDates as any).listAll, {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcoming     = useQuery((api.specialDates as any).listUpcoming, { daysAhead: 90 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createDate   = useMutation((api.specialDates as any).create)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateDate   = useMutation((api.specialDates as any).update)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removeDate   = useMutation((api.specialDates as any).remove)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clearIdeas   = useMutation((api.specialDates as any).clearIdeas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmBannerUpload = useMutation((api.specialDates as any).confirmBannerUpload)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genIdeas     = useAction((api.actions.specialDates as any).generateIdeas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchImport = useAction((api.actions.specialDates as any).searchAndImport)

  const [tab,          setTab]          = useState<Tab>('upcoming')
  const [showForm,     setShowForm]     = useState(false)
  const [showSearch,   setShowSearch]   = useState(false)
  const [generating,   setGenerating]   = useState<string | null>(null)
  const [extraIdeas,   setExtraIdeas]   = useState<Record<string, Idea[]>>({})
  const [confirmDel,   setConfirmDel]   = useState<string | null>(null)
  const [searching,    setSearching]    = useState(false)
  const [searchResult, setSearchResult] = useState<{ found: number; inserted: number; skipped: number } | null>(null)
  const [searchError,  setSearchError]  = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingDate,  setEditingDate]  = useState<any | null>(null)

  const delTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (delTimerRef.current) clearTimeout(delTimerRef.current) }, [])

  // Create form state
  const [fDate,      setFDate]      = useState('')
  const [fType,      setFType]      = useState<DateType>('anniversary')
  const [fTitle,     setFTitle]     = useState('')
  const [fDesc,      setFDesc]      = useState('')
  const [fScore,     setFScore]     = useState(5)
  const [fTags,      setFTags]      = useState('')
  const [fCategory,  setFCategory]  = useState('')
  const [fTeaser,    setFTeaser]    = useState('')
  const [fBanner,    setFBanner]    = useState('')
  const [fBannerAlt, setFBannerAlt] = useState('')
  const [fDiversity, setFDiversity] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setCreateError(null)
    try {
      let bannerUrl = fBanner
      // temp storage ref handling: can't resolve without a doc id, so skip upload for new items
      // User should use URL input for create form, or edit after creation
      if (bannerUrl.startsWith('convex-storage:')) bannerUrl = ''

      const newId = await createDate({
        date: fDate,
        dateType: fType,
        title: fTitle,
        description: fDesc || undefined,
        tags: fTags.split(',').map(t => t.trim()).filter(Boolean),
        relevanceScore: fScore,
        category: fCategory || undefined,
        teaserText: fTeaser || undefined,
        bannerImageUrl: bannerUrl || undefined,
        bannerImageAlt: fBannerAlt || undefined,
        diversityTags: fDiversity.split(',').map(t => t.trim()).filter(Boolean),
      }) as string

      // If a file was uploaded (convex-storage ref), confirm it now that we have the ID
      if (fBanner.startsWith('convex-storage:')) {
        const storageId = fBanner.replace('convex-storage:', '')
        await confirmBannerUpload({ id: newId as any, storageId, alt: fBannerAlt || undefined })
      }

      setShowForm(false)
      setFDate(''); setFType('anniversary'); setFTitle(''); setFDesc(''); setFTags('')
      setFScore(5); setFCategory(''); setFTeaser(''); setFBanner(''); setFBannerAlt(''); setFDiversity('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  async function handleGenerateIdeas(id: string, title: string, description?: string) {
    setGenerating(id)
    try {
      const result = await genIdeas({ id: id as any, title, description })
      setExtraIdeas(prev => ({ ...prev, [id]: result.ideas }))
    } catch (err) { console.error('Error generating ideas:', err) }
    finally { setGenerating(null) }
  }

  async function handleToggleActive(id: string, active: boolean) {
    await updateDate({ id: id as any, active: !active })
  }

  function handleDelete(id: string) {
    if (confirmDel !== id) {
      if (delTimerRef.current) clearTimeout(delTimerRef.current)
      setConfirmDel(id)
      delTimerRef.current = setTimeout(() => setConfirmDel(null), 4000)
      return
    }
    if (delTimerRef.current) clearTimeout(delTimerRef.current)
    setConfirmDel(null)
    removeDate({ id: id as any })
  }

  async function handleSearch(month: number, day?: number) {
    setSearching(true); setSearchResult(null); setSearchError(null)
    try {
      const r = await searchImport({ month, day })
      setSearchResult(r as any)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally { setSearching(false) }
  }

  // ── Date card (shared by both tabs) ──────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function DateCard({ d, compact = false }: { d: any; compact?: boolean }) {
    const hasIdeas = !!(d.aiIdeas || (extraIdeas[d._id] && extraIdeas[d._id].length > 0))

    return (
      <div className={`bg-white border rounded-2xl p-4 transition-all ${d.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
        <div className="flex items-start gap-3">
          <DateThumbnail url={d.bannerImageUrl} alt={d.bannerImageAlt} title={d.title} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {compact && d.daysUntil !== undefined && <CountdownBadge days={d.daysUntil} />}
              <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">{d.date}</span>
              {!compact && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${d.dateType === 'anniversary' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                  {d.dateType === 'anniversary' ? 'Anual' : 'Única'}
                </span>
              )}
              <CategoryBadge category={d.category} />
              {d.confidence && <ConfidenceDot confidence={d.confidence} />}
              {!compact && d.aiGenerated && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded">✦ IA</span>}
              {!compact && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">⭐ {d.relevanceScore}/10</span>}
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">{d.title}</p>
            {(d.teaserText || d.description) && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{d.teaserText ?? d.description}</p>
            )}
            {Array.isArray(d.diversityTags) && d.diversityTags.length > 0 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {(d.diversityTags as string[]).slice(0, 5).map((tag: string) => (
                  <DiversityChip key={tag} tag={tag} />
                ))}
                {d.diversityTags.length > 5 && (
                  <span className="text-[9px] text-slate-400">+{d.diversityTags.length - 5}</span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <button
              onClick={() => handleGenerateIdeas(d._id, d.title, d.description)}
              disabled={generating === d._id}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                hasIdeas ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {generating === d._id ? '⏳' : `✦ ${hasIdeas ? 'Regenerar' : 'Generar ideas'}`}
            </button>
            <button
              onClick={() => setEditingDate(d)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ✎ Editar
            </button>
            <ActiveSwitch active={d.active} onChange={() => handleToggleActive(d._id, d.active)} />
            <button
              type="button"
              onClick={() => handleDelete(d._id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${confirmDel === d._id ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
            >
              {confirmDel === d._id ? '¿Eliminar?' : '✕'}
            </button>
          </div>
        </div>

        {confirmDel === d._id && (
          <p className="text-[10px] text-amber-500 mt-2 animate-pulse">Clic de nuevo para confirmar · se cancela en 4s</p>
        )}

        <IdeasSection
          date={d}
          extraIdeas={extraIdeas[d._id] ?? []}
          onClear={() => {
            clearIdeas({ id: d._id as any })
            setExtraIdeas(prev => { const n = { ...prev }; delete n[d._id]; return n })
          }}
        />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fechas Especiales</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Aniversarios y efemérides para el banner editorial · {(dates as any[])?.length ?? '…'} guardadas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowSearch(true); setSearchResult(null); setSearchError(null) }}
            className="px-4 py-2 bg-[#0B1220] hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            <span className="text-indigo-400">✦</span>
            Buscar con Perplexity
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {showForm ? 'Cancelar' : '+ Nueva fecha'}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Nueva fecha especial</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha *</label>
              <input value={fDate} onChange={e => setFDate(e.target.value)} className={inputClass} required
                placeholder={fType === 'anniversary' ? 'MM-DD (ej: 07-16)' : 'YYYY-MM-DD'} />
              <p className="text-[11px] text-gray-400 mt-1">
                {fType === 'anniversary' ? 'MM-DD para aniversarios anuales' : 'Fecha exacta YYYY-MM-DD'}
              </p>
            </div>
            <div>
              <label className={labelClass}>Tipo *</label>
              <select value={fType} onChange={e => setFType(e.target.value as DateType)} className={inputClass}>
                <option value="anniversary">Aniversario (anual)</option>
                <option value="one_time">Fecha única</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Título *</label>
            <input value={fTitle} onChange={e => setFTitle(e.target.value)} className={inputClass} required
              placeholder="Primer número de Black Panther (1977)" />
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} className={inputClass + ' resize-none'} rows={2}
              placeholder="Contexto editorial…" />
          </div>

          <div>
            <label className={labelClass}>Teaser (texto corto para banner)</label>
            <input value={fTeaser} onChange={e => setFTeaser(e.target.value)} className={inputClass}
              placeholder="Un párrafo breve para el banner…" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Categoría</label>
              <select value={fCategory} onChange={e => setFCategory(e.target.value)} className={inputClass}>
                <option value="">— Sin categoría —</option>
                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Relevancia (1-10)</label>
              <input type="number" min={1} max={10} value={fScore} onChange={e => setFScore(Number(e.target.value))} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Tags (separados por coma)</label>
            <input value={fTags} onChange={e => setFTags(e.target.value)} className={inputClass}
              placeholder="Black Panther, Wakanda, Marvel" />
          </div>

          <div>
            <label className={labelClass}>Tags diversidad (separados por coma)</label>
            <input value={fDiversity} onChange={e => setFDiversity(e.target.value)} className={inputClass}
              placeholder="black, lgbtq, women…" />
          </div>

          <div>
            <label className={labelClass}>Imagen banner (URL o subir archivo)</label>
            <BannerUploader currentUrl={fBanner} onUrlChange={setFBanner} />
          </div>

          {fBanner && (
            <div>
              <label className={labelClass}>Alt texto imagen</label>
              <input value={fBannerAlt} onChange={e => setFBannerAlt(e.target.value)} className={inputClass}
                placeholder="Descripción accesible de la imagen" />
            </div>
          )}

          {createError && <p className="text-xs text-red-600">{createError}</p>}

          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-indigo-500 transition-colors">
            {saving ? 'Guardando…' : 'Guardar fecha'}
          </button>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5 w-fit">
        {(['upcoming', 'all'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'upcoming' ? 'Próximas' : 'Todas'}
            {t === 'upcoming' && upcoming !== undefined && (
              <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
                {(upcoming as any[]).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Próximas tab */}
      {tab === 'upcoming' && (
        upcoming === undefined ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
        ) : (upcoming as any[]).length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
            <p className="text-gray-400 text-sm">No hay fechas próximas en los próximos 90 días.</p>
            <p className="text-gray-300 text-xs mt-1">Añade fechas manualmente o búscalas con Perplexity.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(upcoming as any[]).map((d: any) => <DateCard key={d._id} d={d} compact />)}
          </div>
        )
      )}

      {/* Todas tab */}
      {tab === 'all' && (
        dates === undefined ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
        ) : (dates as any[]).length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
            <p className="text-gray-400 text-sm">No hay fechas especiales. Añade la primera o usa Buscar con Perplexity.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(dates as any[]).map((d: any) => <DateCard key={d._id} d={d} />)}
          </div>
        )
      )}

      {/* Modals */}
      <SearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSearch={handleSearch}
        searching={searching}
        result={searchResult}
        error={searchError}
      />

      {editingDate && (
        <EditDateModal date={editingDate} onClose={() => setEditingDate(null)} />
      )}
    </div>
  )
}
