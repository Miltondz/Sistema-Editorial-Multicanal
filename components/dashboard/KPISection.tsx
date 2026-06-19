'use client'
import { SparklineChart } from './SparklineChart'

const MOCK_SPARKLINES = {
  review:    [3, 5, 4, 8, 6, 9, 7, 11, 8, 12],
  approved:  [10, 14, 12, 18, 15, 20, 17, 22, 19, 24],
  scheduled: [2, 3, 5, 4, 6, 5, 8, 7, 9, 8],
  published: [8, 10, 9, 13, 11, 15, 12, 16, 14, 18],
}

interface KPISectionProps {
  stats: { needsReviewCount: number; approvedCount: number; scheduledCount: number; publishedCount: number } | undefined
  sparklines?: { review: number[]; approved: number[]; published: number[] } | undefined
}

function KPICard({
  label, value, trend, trendUp, iconBg, iconColor, sparkData, sparkColor, valueColor, icon,
}: {
  label: string
  value: number | string
  trend: string
  trendUp: boolean
  iconBg: string
  iconColor: string
  sparkData: number[]
  sparkColor: string
  valueColor: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-6 h-40 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} ${iconColor}`}>
            {icon}
          </div>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
        <SparklineChart data={sparkData} color={sparkColor} />
      </div>
      <div>
        <p className={`text-4xl font-bold leading-none ${valueColor}`}>{value ?? '—'}</p>
        <p className={`text-xs mt-1.5 ${trendUp ? 'text-green-500' : 'text-red-400'}`}>{trend}</p>
      </div>
    </div>
  )
}

function sparkTrend(data: number[]): { label: string; up: boolean } {
  if (data.length < 2) return { label: 'Sin datos', up: true }
  const diff = data[data.length - 1] - data[data.length - 2]
  if (diff === 0) return { label: 'Sin cambios hoy', up: true }
  return { label: `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)} vs ayer`, up: diff > 0 }
}

export function KPISection({ stats, sparklines }: KPISectionProps) {
  const reviewSpark  = sparklines?.review   ?? MOCK_SPARKLINES.review
  const approvedSpark = sparklines?.approved ?? MOCK_SPARKLINES.approved
  const publishedSpark = sparklines?.published ?? MOCK_SPARKLINES.published
  const reviewTrend   = sparkTrend(reviewSpark)
  const publishedTrend = sparkTrend(publishedSpark)

  return (
    <div className="grid grid-cols-4 gap-5">
      <KPICard
        label="Pendientes de revisión"
        value={stats?.needsReviewCount ?? '—'}
        trend={reviewTrend.label}
        trendUp={!reviewTrend.up}
        iconBg="bg-amber-50"
        iconColor="text-amber-500"
        sparkData={reviewSpark}
        sparkColor="#F59E0B"
        valueColor="text-amber-500"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
      <KPICard
        label="Aprobados esta semana"
        value={stats?.approvedCount ?? '—'}
        trend={stats?.approvedCount !== undefined ? `${stats.approvedCount} aprobados esta semana` : '—'}
        trendUp={true}
        iconBg="bg-green-50"
        iconColor="text-green-500"
        sparkData={approvedSpark}
        sparkColor="#22C55E"
        valueColor="text-green-500"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
      <KPICard
        label="Programados"
        value={stats?.scheduledCount ?? '—'}
        trend={stats?.scheduledCount !== undefined ? `${stats.scheduledCount} slots activos` : '—'}
        trendUp={true}
        iconBg="bg-blue-50"
        iconColor="text-blue-500"
        sparkData={MOCK_SPARKLINES.scheduled}
        sparkColor="#6366F1"
        valueColor="text-indigo-500"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      />
      <KPICard
        label="Publicados este mes"
        value={stats?.publishedCount ?? '—'}
        trend={publishedTrend.label}
        trendUp={publishedTrend.up}
        iconBg="bg-indigo-50"
        iconColor="text-indigo-500"
        sparkData={publishedSpark}
        sparkColor="#6366F1"
        valueColor="text-indigo-600"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        }
      />
    </div>
  )
}
