'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useMemo } from 'react'

type Channel = 'tumblr' | 'x'

export default function AnalyticsPage() {
  const [channel, setChannel] = useState<Channel | undefined>(undefined)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = useQuery((api.publicationLog as any).listForAnalytics, {
    channel,
    limit: 200,
  }) as any[] | undefined

  const stats = useMemo(() => {
    if (!logs) return null

    const byType: Record<string, number>    = {}
    const byOrigin: Record<string, number>  = {}
    const byDayPart: Record<string, number> = {}
    let newCount = 0
    let recycledCount = 0
    let totalLikes = 0, totalReposts = 0, totalImpressions = 0, totalEngagements = 0, metricsCount = 0

    for (const log of logs) {
      if (log.contentType)   byType[log.contentType]     = (byType[log.contentType]     ?? 0) + 1
      if (log.contentOrigin) byOrigin[log.contentOrigin] = (byOrigin[log.contentOrigin] ?? 0) + 1
      if (log.dayPart)       byDayPart[log.dayPart]      = (byDayPart[log.dayPart]      ?? 0) + 1
      if (log.contentMode === 'new')      newCount++
      if (log.contentMode === 'recycled') recycledCount++
      const hasMetrics = log.likes > 0 || log.reposts > 0 || log.reblogs > 0 || log.impressions > 0 || log.engagements > 0
      if (hasMetrics) {
        totalLikes       += log.likes       ?? 0
        totalReposts     += (log.reposts    ?? 0) + (log.reblogs ?? 0)
        totalImpressions += log.impressions ?? 0
        totalEngagements += log.engagements ?? 0
        metricsCount++
      }
    }

    const enrichedCount    = logs.filter(l => l.enrichedManually === true).length
    const notEnrichedCount = logs.filter(l => l.enrichedManually === false).length
    const avgEngagementRate = metricsCount > 0 && totalImpressions > 0
      ? ((totalEngagements / totalImpressions) * 100).toFixed(1)
      : null

    const topPosts = [...logs]
      .filter(l => (l.engagements ?? 0) > 0)
      .sort((a, b) => (b.engagements ?? 0) - (a.engagements ?? 0))
      .slice(0, 5)

    return {
      byType, byOrigin, byDayPart, newCount, recycledCount, enrichedCount, notEnrichedCount, total: logs.length,
      performance: { totalLikes, totalReposts, totalImpressions, totalEngagements, metricsCount, avgEngagementRate, topPosts },
    }
  }, [logs])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analítica</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Publicaciones exitosas{stats ? ` — ${stats.total} registros` : ''}
          </p>
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {([undefined, 'tumblr', 'x'] as (Channel | undefined)[]).map(ch => (
            <button
              key={String(ch)}
              type="button"
              onClick={() => setChannel(ch)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                channel === ch
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {ch === undefined ? 'Todos' : ch === 'tumblr' ? 'Tumblr' : 'X'}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <div className="text-sm text-gray-400 py-12 text-center">Cargando…</div>
      ) : stats.total === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center">Sin publicaciones exitosas aún.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChartCard title="Nuevo vs Reciclado">
            <BarRow label="Nuevo"     count={stats.newCount}      total={stats.total} color="bg-green-500" />
            <BarRow label="Reciclado" count={stats.recycledCount} total={stats.total} color="bg-amber-500" />
          </ChartCard>

          <ChartCard title="Origen del contenido">
            {Object.entries(stats.byOrigin).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <BarRow key={k} label={ORIGIN_LABELS[k] ?? k} count={v} total={stats.total} color="bg-purple-500" />
            ))}
          </ChartCard>

          <ChartCard title="Tipo de contenido">
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <BarRow key={k} label={TYPE_LABELS[k] ?? k} count={v} total={stats.total} color="bg-indigo-500" />
            ))}
          </ChartCard>

          <ChartCard title="Franja horaria">
            {(['morning', 'afternoon', 'evening'] as const).map(dp => (
              <BarRow key={dp} label={DAYPART_LABELS[dp]} count={stats.byDayPart[dp] ?? 0} total={stats.total} color="bg-blue-500" />
            ))}
          </ChartCard>

          <ChartCard title="Enriquecimiento manual">
            <BarRow label="Enriquecido"    count={stats.enrichedCount}    total={stats.total} color="bg-teal-500" />
            <BarRow label="Sin enriquecer" count={stats.notEnrichedCount} total={stats.total} color="bg-gray-300" />
          </ChartCard>

          {/* Performance metrics — only shown when engagement data exists */}
          {stats.performance.metricsCount > 0 ? (
            <ChartCard title={`Métricas de rendimiento (${stats.performance.metricsCount} publicaciones con datos)`}>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Impresiones', value: stats.performance.totalImpressions.toLocaleString() },
                  { label: 'Engagements', value: stats.performance.totalEngagements.toLocaleString() },
                  { label: 'Likes', value: stats.performance.totalLikes.toLocaleString() },
                  { label: 'Reposts/Reblogs', value: stats.performance.totalReposts.toLocaleString() },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <p className="text-lg font-bold text-gray-900">{m.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>
              {stats.performance.avgEngagementRate && (
                <p className="text-xs text-gray-600 text-center mb-3">
                  Tasa de engagement promedio: <strong>{stats.performance.avgEngagementRate}%</strong>
                </p>
              )}
              {stats.performance.topPosts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Top publicaciones</p>
                  {stats.performance.topPosts.map((p: any) => (
                    <div key={p._id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                      <a href={p.externalPostUrl} target="_blank" rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline truncate max-w-[60%]">
                        {p.externalPostUrl ?? p._id}
                      </a>
                      <span className="text-gray-500 ml-2 flex-shrink-0">{p.engagements} eng · {p.channel}</span>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          ) : (
            <ChartCard title="Métricas de rendimiento">
              <p className="text-xs text-gray-400 py-4 text-center">
                Sin datos de engagement aún. Se poblarán cuando se sincronicen métricas desde las plataformas.
              </p>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

function BarRow({ label, count, total, color }: {
  label: string; count: number; total: number; color: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-xs text-gray-600">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const ORIGIN_LABELS: Record<string, string> = {
  imported: 'Importado',
  manual:   'Manual',
  assisted: 'Asistido IA',
}
const TYPE_LABELS: Record<string, string> = {
  comic: 'Cómic', libro: 'Libro', autor: 'Autor/a', cosplay: 'Cosplay',
  articulo: 'Artículo', poster: 'Poster', pelicula: 'Película',
  personaje: 'Personaje', coleccion: 'Colección',
}
const DAYPART_LABELS: Record<string, string> = {
  morning: 'Mañana', afternoon: 'Tarde', evening: 'Noche',
}
