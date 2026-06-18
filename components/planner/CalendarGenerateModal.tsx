'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useEffect, useRef } from 'react'

const CONTENT_TYPE_LABELS: Record<string, string> = {
  comic:     'Cómic',
  libro:     'Libro',
  autor:     'Autor/a',
  cosplay:   'Cosplay',
  articulo:  'Artículo',
  poster:    'Poster',
  pelicula:  'Película',
  personaje: 'Personaje',
  coleccion: 'Colección',
}

const TYPE_COLORS: Record<string, string> = {
  comic:     'bg-indigo-100 text-indigo-700',
  libro:     'bg-blue-100 text-blue-700',
  autor:     'bg-violet-100 text-violet-700',
  cosplay:   'bg-pink-100 text-pink-700',
  articulo:  'bg-amber-100 text-amber-700',
  poster:    'bg-orange-100 text-orange-700',
  pelicula:  'bg-red-100 text-red-700',
  personaje: 'bg-cyan-100 text-cyan-700',
  coleccion: 'bg-teal-100 text-teal-700',
}

interface Props {
  channel: 'tumblr' | 'x'
  startDate: string
  endDate: string
  generating: boolean
  onClose: () => void
  onGenerate: (selectedItemIds: string[]) => Promise<void>
}

export default function CalendarGenerateModal({ channel, startDate, endDate, generating, onClose, onGenerate }: Props) {
  const [search,        setSearch]        = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter,    setTypeFilter]    = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<'tumblr' | 'x' | 'all'>(channel)
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setDebouncedSearch(search), 250)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = useQuery(api.contentItems.listApprovedForCalendar as any, {
    contentType: typeFilter === 'all' ? undefined : typeFilter,
    channel:     channelFilter === 'all' ? undefined : channelFilter,
    search:      debouncedSearch.trim() || undefined,
  })

  const list = (items as any[] | undefined) ?? []

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const allVisible = list.map((i: any) => i.itemId)
    const allSelected = allVisible.every((id: string) => selected.has(id))
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); allVisible.forEach((id: string) => next.delete(id)); return next })
    } else {
      setSelected(prev => { const next = new Set(prev); allVisible.forEach((id: string) => next.add(id)); return next })
    }
  }

  const allVisibleSelected = list.length > 0 && list.every((i: any) => selected.has(i.itemId))
  const someVisibleSelected = list.some((i: any) => selected.has(i.itemId))

  // Month label for header
  const [y, m] = startDate.split('-').map(Number)
  const monthLabel = new Date(y, m - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Generar calendario</h2>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">
              {monthLabel} · Canal: <strong>{channel === 'tumblr' ? 'Tumblr' : 'X / Twitter'}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none mt-0.5 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3 shrink-0">
          <input
            type="text"
            placeholder="Buscar por título…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="all">Todos los tipos</option>
              {Object.entries(CONTENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value as 'tumblr' | 'x' | 'all')}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="all">Todos los canales</option>
              <option value="tumblr">Tumblr</option>
              <option value="x">X / Twitter</option>
            </select>

            {/* Select all visible */}
            <button
              type="button"
              onClick={toggleAll}
              className="ml-auto flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                allVisibleSelected ? 'bg-indigo-600 border-indigo-600' : someVisibleSelected ? 'bg-indigo-200 border-indigo-400' : 'border-gray-300'
              }`}>
                {(allVisibleSelected || someVisibleSelected) && <span className="text-white text-[10px]">✓</span>}
              </span>
              Seleccionar visibles
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1 min-h-0">
          {items === undefined ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Cargando publicaciones…
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-gray-600 font-medium text-sm">Sin publicaciones aprobadas</p>
              <p className="text-gray-400 text-xs mt-1">
                Aprueba variantes en el catálogo para poder generar el calendario
              </p>
            </div>
          ) : (
            list.map((item: any) => (
              <ItemRow
                key={item.itemId}
                item={item}
                checked={selected.has(item.itemId)}
                onToggle={() => toggleOne(item.itemId)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <p className="text-sm text-gray-500">
            {selected.size > 0 ? (
              <><strong className="text-gray-800">{selected.size}</strong> seleccionadas</>
            ) : (
              'Ninguna seleccionada'
            )}
            {list.length > 0 && <span className="ml-2 text-gray-400">· {list.length} disponibles</span>}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || generating}
              onClick={() => onGenerate(Array.from(selected))}
              className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {generating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Generando…
                </>
              ) : (
                `Generar con ${selected.size} seleccionadas`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemRow({ item, checked, onToggle }: {
  item: { itemId: string; title: string; contentType: string; coverImageUrl?: string; channels: Array<'tumblr' | 'x'> }
  checked: boolean
  onToggle: () => void
}) {
  const [imgErr, setImgErr] = useState(false)
  const typeColor = TYPE_COLORS[item.contentType] ?? 'bg-gray-100 text-gray-600'
  const typeLabel = CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
        checked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
      }`}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
        checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
      }`}>
        {checked && <span className="text-white text-xs">✓</span>}
      </div>

      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center text-lg">
        {item.coverImageUrl && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.coverImageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
            loading="lazy"
          />
        ) : (
          <span>🖼️</span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${typeColor}`}>{typeLabel}</span>
          {item.channels.map(ch => (
            <span key={ch} className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
              ch === 'x' ? 'bg-gray-900 text-white' : 'bg-blue-100 text-blue-700'
            }`}>
              {ch === 'x' ? '𝕏' : 'Tumblr'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
