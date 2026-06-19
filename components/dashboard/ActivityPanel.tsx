'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `Hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs} h`
  return `Hace ${Math.floor(hrs / 24)} d`
}

function channelColor(channel: string): string {
  return channel === 'x' ? '#0F172A' : '#3B82F6'
}

export function ActivityPanel() {
  const recent = useQuery((api.publicationLog as any).listRecent, { limit: 6 })

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="text-base font-semibold text-slate-900">Actividad reciente</span>
      </div>

      {recent === undefined ? (
        <div className="space-y-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-2 h-2 rounded-full bg-slate-200 mt-1.5 shrink-0 animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-2.5 bg-slate-100 rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sin actividad reciente.</p>
      ) : (
        <div className="space-y-3">
          {(recent as any[]).map((log, idx) => (
            <div key={log._id} className="flex gap-3 items-start">
              <div className="relative flex flex-col items-center shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1"
                  style={{ background: channelColor(log.channel) }}
                />
                {idx < recent.length - 1 && (
                  <div className="w-px bg-slate-100 mx-auto" style={{ height: 28, marginTop: 2 }} />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-0.5">
                <p className="text-sm text-slate-700 leading-snug">
                  <span className="font-medium">Publicado:</span>{' '}
                  <span className="truncate">{log.itemTitle ?? '(sin título)'}</span>
                  {' '}en{' '}
                  <span className="font-medium" style={{ color: channelColor(log.channel) }}>
                    {log.channel === 'x' ? 'X' : 'Tumblr'}
                  </span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{timeAgo(log._creationTime)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
