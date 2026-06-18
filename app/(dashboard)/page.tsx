'use client'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState } from 'react'

export default function DashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats        = useQuery((api.contentItems as any).getDashboardStats, {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const failedSlots  = useQuery((api.scheduleSlots as any).listFailed, {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xCount       = useQuery((api.publicationLog as any).getXWriteCountThisMonth, {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent       = useQuery((api.publicationLog as any).listRecent, { limit: 10 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publishSlotAction = useAction((api.actions as any).publisher.publishDirect)
  const [republishing, setRepublishing] = useState<string | null>(null)

  async function handleRepublish(slot: any) {
    if (!slot.contentItemId) return
    setRepublishing(slot._id)
    try {
      await publishSlotAction({ contentItemId: slot.contentItemId, channel: slot.channel })
    } catch {
      // error shown in slot list via failed status update
    } finally {
      setRepublishing(null)
    }
  }

  const xUsagePct = xCount != null ? Math.round((xCount / 500) * 100) : null
  const xWarning  = xCount != null && xCount >= 400

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">SuperheroesInColor CMS</p>
      </div>

      {/* X rate limit alert */}
      {xWarning && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
          <strong>Alerta X API:</strong> {xCount}/500 posts usados este mes ({xUsagePct}%).
          {xCount! >= 490 && ' Límite casi alcanzado — publicación automática pausada.'}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Pendientes revisión" value={stats?.needsReviewCount ?? '—'} accent="amber" />
        <StatCard label="Aprobados"            value={stats?.approvedCount    ?? '—'} accent="green" />
        <StatCard label="Publicados"           value={stats?.publishedCount   ?? '—'} accent="indigo" />
      </div>

      {/* X write counter */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">X API — escrituras este mes</span>
          <span className={`text-sm font-bold ${xWarning ? 'text-amber-600' : 'text-gray-900'}`}>
            {xCount ?? '…'} / 500
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              xUsagePct != null && xUsagePct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min(xUsagePct ?? 0, 100)}%` }}
          />
        </div>
      </div>

      {/* Failed slots */}
      {failedSlots && failedSlots.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Slots fallidos ({failedSlots.length})</h2>
          <div className="bg-white rounded-lg border border-red-100 divide-y divide-gray-100">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(failedSlots as any[]).map(slot => (
              <div key={slot._id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {slot.item?.title ?? 'Sin contenido'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {slot.channel.toUpperCase()} · {slot.scheduledFor} · {slot.dayPart}
                    {slot.item?.contentType && ` · ${slot.item.contentType}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!slot.contentItemId || republishing === slot._id}
                  onClick={() => handleRepublish(slot)}
                  className="shrink-0 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {republishing === slot._id ? 'Publicando…' : 'Republicar'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent publications */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Publicaciones recientes</h2>
        {!recent ? (
          <div className="text-sm text-gray-400">Cargando…</div>
        ) : recent.length === 0 ? (
          <div className="text-sm text-gray-400">Sin publicaciones aún.</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(recent as any[]).map(log => (
              <div key={log._id} className="flex items-center gap-3 px-4 py-3">
                <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                  log.channel === 'x' ? 'bg-gray-900 text-white' : 'bg-blue-100 text-blue-700'
                }`}>
                  {log.channel === 'x' ? 'X' : 'Tumblr'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate">{log.itemTitle ?? '(sin título)'}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(log._creationTime).toLocaleString('es-MX', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                    {log.itemType ? ` · ${log.itemType}` : ''}
                  </p>
                </div>
                {log.externalPostUrl && (
                  <a
                    href={log.externalPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-indigo-600 hover:underline"
                  >
                    Ver
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label, value, accent,
}: {
  label: string
  value: number | string
  accent: 'amber' | 'green' | 'indigo'
}) {
  const color = {
    amber:  'text-amber-600',
    green:  'text-green-600',
    indigo: 'text-indigo-600',
  }[accent]
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}
