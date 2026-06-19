'use client'
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

type Filter = 'all' | 'image' | 'video' | 'primary'

export default function MediaPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)

  // Cast required — Convex Proxy resolves at runtime.
  const assets = useQuery((api.mediaAssets as any).listAll, { limit: 200 }) as any[] | undefined
  const stats  = useQuery((api.mediaAssets as any).getStats, {}) as {
    totalCount: number
    totalSizeBytes: number
    byMimeType: Record<string, number>
    primaryCount: number
  } | undefined

  const filtered = (assets ?? []).filter((a: any) => {
    if (filter === 'all') return true
    if (filter === 'primary') return a.isPrimary
    return a.mimeType?.startsWith(filter)
  })

  const selectedAsset = selected ? (assets ?? []).find((a: any) => a._id === selected) : null

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Biblioteca de archivos multimedia del CMS.</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Total archivos',
            value: stats ? stats.totalCount.toString() : '—',
            icon: (
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            ),
            bg: 'bg-indigo-50',
          },
          {
            label: 'Tamaño total',
            value: stats ? formatBytes(stats.totalSizeBytes) : '—',
            icon: (
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            ),
            bg: 'bg-blue-50',
          },
          {
            label: 'Imágenes',
            value: stats ? (stats.byMimeType['image'] ?? 0).toString() : '—',
            icon: (
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ),
            bg: 'bg-green-50',
          },
          {
            label: 'Portadas primarias',
            value: stats ? stats.primaryCount.toString() : '—',
            icon: (
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            ),
            bg: 'bg-amber-50',
          },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-[#E5EAF2] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
              {s.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'image', 'video', 'primary'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-[#E5EAF2] text-gray-600 hover:bg-gray-50'
            }`}
          >
            {{ all: 'Todos', image: 'Imágenes', video: 'Videos', primary: 'Portadas' }[f]}
          </button>
        ))}
        {assets && (
          <span className="ml-auto text-xs text-gray-400">{filtered.length} archivo{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Grid */}
      {assets === undefined ? (
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="aspect-square bg-white rounded-xl border border-[#E5EAF2] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5EAF2] p-16 text-center">
          <p className="text-gray-400 text-sm">
            {assets.length === 0
              ? 'No hay archivos en la biblioteca. Los medios se importan con el contenido.'
              : 'No hay archivos que coincidan con el filtro.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-3">
          {filtered.map((a: any) => (
            <button
              key={a._id}
              onClick={() => setSelected(selected === a._id ? null : a._id)}
              className={`group relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                selected === a._id
                  ? 'border-indigo-500 shadow-md'
                  : 'border-[#E5EAF2] hover:border-indigo-300'
              }`}
            >
              {a.mimeType?.startsWith('image') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.publicUrl}
                  alt={a.altText ?? ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {a.isPrimary && (
                <div className="absolute top-1 left-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedAsset && (
        <div className="fixed bottom-6 right-6 w-72 bg-white rounded-2xl border border-[#E5EAF2] shadow-xl p-4 z-30">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-900">Detalle</p>
            <button onClick={() => setSelected(null)} className="w-6 h-6 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {selectedAsset.mimeType?.startsWith('image') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedAsset.publicUrl} alt={selectedAsset.altText ?? ''} className="w-full rounded-xl object-cover mb-3" style={{ maxHeight: 160 }} />
          )}
          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex justify-between"><span className="text-gray-400">Tipo</span><span className="font-medium">{selectedAsset.mimeType ?? '—'}</span></div>
            {selectedAsset.width && <div className="flex justify-between"><span className="text-gray-400">Dimensiones</span><span className="font-medium">{selectedAsset.width}×{selectedAsset.height}px</span></div>}
            {selectedAsset.fileSizeBytes && <div className="flex justify-between"><span className="text-gray-400">Tamaño</span><span className="font-medium">{formatBytes(selectedAsset.fileSizeBytes)}</span></div>}
            {selectedAsset.altText && <div className="flex justify-between gap-2"><span className="text-gray-400 shrink-0">Alt</span><span className="font-medium text-right truncate">{selectedAsset.altText}</span></div>}
            {selectedAsset.sourceKind && <div className="flex justify-between"><span className="text-gray-400">Origen</span><span className="font-medium">{selectedAsset.sourceKind}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">Portada</span><span className={selectedAsset.isPrimary ? 'text-amber-600 font-medium' : ''}>{selectedAsset.isPrimary ? 'Sí ★' : 'No'}</span></div>
          </div>
          <a
            href={selectedAsset.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-center text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1.5 border border-indigo-100 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            Abrir imagen →
          </a>
        </div>
      )}
    </div>
  )
}
