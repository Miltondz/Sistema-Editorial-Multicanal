'use client'
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

type Channel = 'tumblr' | 'x' | undefined

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60000) return 'hace un momento'
  if (diff < 3600000) return `hace ${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)}h`
  return `hace ${Math.floor(diff / 86400000)}d`
}

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  success:  { label: 'Publicado',   className: 'bg-green-50 text-green-700' },
  failed:   { label: 'Fallido',     className: 'bg-red-50 text-red-700' },
  retrying: { label: 'Reintentando',className: 'bg-amber-50 text-amber-700' },
  skipped:  { label: 'Omitido',     className: 'bg-slate-100 text-slate-500' },
}

const CHANNEL_ICON: Record<string, string> = { x: 'X', tumblr: 'T' }
const CHANNEL_BG:   Record<string, string> = { x: '#000000', tumblr: '#35465C' }

export default function PublicationsPage() {
  const [channel, setChannel] = useState<Channel>(undefined)
  const [limit, setLimit] = useState(50)

  // Cast required — Convex Proxy resolves dynamic refs at runtime.
  const logs = useQuery((api.publicationLog as any).listRecent, { limit }) as any[] | undefined

  const filtered = logs?.filter(l => !channel || l.channel === channel) ?? []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Publicaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historial de todas las publicaciones en canales.</p>
        </div>
        {/* Channel filter */}
        <div className="flex rounded-xl overflow-hidden border border-[#E5EAF2]">
          {([undefined, 'tumblr', 'x'] as Channel[]).map(ch => (
            <button
              key={ch ?? 'all'}
              onClick={() => setChannel(ch)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                channel === ch
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {ch === undefined ? 'Todos' : ch === 'x' ? 'X' : 'Tumblr'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      {logs && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: filtered.length, color: 'text-gray-900' },
            { label: 'Publicados', value: filtered.filter(l => l.publishStatus === 'success').length, color: 'text-green-600' },
            { label: 'Fallidos',   value: filtered.filter(l => l.publishStatus === 'failed').length,  color: 'text-red-600' },
            { label: 'Omitidos',   value: filtered.filter(l => l.publishStatus === 'skipped').length, color: 'text-slate-500' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#E5EAF2] p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {logs === undefined ? (
        <div className="space-y-2">{Array.from({length: 8}).map((_, i) => (
          <div key={i} className="h-14 bg-white rounded-xl border border-[#E5EAF2] animate-pulse" />
        ))}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5EAF2] p-16 text-center">
          <p className="text-gray-400 text-sm">Sin publicaciones en este canal.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5EAF2] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5EAF2] text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left font-medium">Canal</th>
                <th className="px-5 py-3 text-left font-medium">Contenido</th>
                <th className="px-5 py-3 text-left font-medium">Estado</th>
                <th className="px-5 py-3 text-left font-medium">Reintentos</th>
                <th className="px-5 py-3 text-left font-medium">Cuándo</th>
                <th className="px-5 py-3 text-left font-medium">Enlace</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log: any) => {
                const st = STATUS_STYLE[log.publishStatus] ?? { label: log.publishStatus, className: 'bg-slate-100 text-slate-500' }
                return (
                  <tr key={log._id} className="border-b border-[#E5EAF2] last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: CHANNEL_BG[log.channel] ?? '#6366F1' }}
                      >
                        {CHANNEL_ICON[log.channel] ?? '?'}
                      </div>
                    </td>
                    <td className="px-5 py-3 max-w-[260px]">
                      <p className="font-medium text-gray-900 truncate">{log.itemTitle ?? 'Sin título'}</p>
                      {log.errorMessage && (
                        <p className="text-xs text-red-500 truncate">{log.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.className}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {log.retryCount > 0 ? `${log.retryCount}x` : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {log._creationTime ? timeAgo(log._creationTime) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      {log.externalPostUrl ? (
                        <a
                          href={log.externalPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          Ver post →
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length >= limit && (
            <div className="px-5 py-3 border-t border-[#E5EAF2] text-center">
              <button
                onClick={() => setLimit(l => l + 50)}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Cargar más
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
