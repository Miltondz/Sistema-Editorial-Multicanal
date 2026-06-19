'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 1) return `Hace ${Math.floor(diff / 60000)} min`
  if (hrs < 24) return `Hace ${hrs} h`
  return `Hace ${Math.floor(hrs / 24)} d`
}

function initials(title: string): string {
  return title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const COVER_COLORS = ['#312E81', '#4C1D95', '#831843', '#78350F', '#14532D']

export function RecentPublications() {
  const recent = useQuery((api.publicationLog as any).listRecent, { limit: 6 })

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-base font-semibold text-slate-900">Publicaciones recientes</span>
        <Link href="/publications" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Ver todas →</Link>
      </div>

      {recent === undefined ? (
        <div className="flex gap-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="w-[130px] shrink-0 rounded-xl border border-[#E5EAF2] overflow-hidden animate-pulse">
              <div className="bg-slate-100" style={{ aspectRatio: '2/3' }} />
              <div className="p-2.5 space-y-1.5">
                <div className="h-2.5 bg-slate-100 rounded w-4/5" />
                <div className="h-2 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">Sin publicaciones aún.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {(recent as any[]).map((log, idx) => (
            <div
              key={log._id}
              className="w-[130px] shrink-0 rounded-xl border border-[#E5EAF2] overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
            >
              {/* Cover — portrait 2:3 ratio, full image visible */}
              <div
                className="relative flex items-center justify-center overflow-hidden"
                style={{ aspectRatio: '2/3', background: COVER_COLORS[idx % COVER_COLORS.length] }}
              >
                {log.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={log.coverImageUrl}
                    alt={log.itemTitle ?? ''}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement
                      el.style.display = 'none'
                      el.nextElementSibling?.removeAttribute('style')
                    }}
                  />
                ) : null}
                {/* Fallback initials — hidden if image loads */}
                <span
                  className="absolute text-white text-2xl font-bold opacity-40 select-none pointer-events-none"
                  style={log.coverImageUrl ? { display: 'none' } : {}}
                >
                  {initials(log.itemTitle ?? 'SC')}
                </span>
                {/* Channel badge top-right */}
                <span
                  className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    log.channel === 'x' ? 'bg-black text-white' : 'bg-[#35465C] text-white'
                  }`}
                >
                  {log.channel === 'x' ? 'X' : 'T'}
                </span>
              </div>

              {/* Info strip */}
              <div className="p-2.5 flex flex-col gap-1 bg-white">
                <p className="text-[11px] font-semibold text-slate-800 leading-snug line-clamp-2">
                  {log.itemTitle ?? '(sin título)'}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[10px] text-slate-400">{timeAgo(log._creationTime)}</p>
                  {log.externalPostUrl ? (
                    <a href={log.externalPostUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-600">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <span className="w-3" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
