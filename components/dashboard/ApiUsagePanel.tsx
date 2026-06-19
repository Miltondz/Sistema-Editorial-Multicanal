'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { GaugeChart } from './GaugeChart'

function ChannelUsage({
  label, count, max, loading, warn,
}: {
  label: string
  count: number
  max: number
  loading: boolean
  warn: boolean
}) {
  const remaining = max - count
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      {loading ? (
        <div className="w-28 h-20 bg-slate-100 rounded-xl animate-pulse" />
      ) : (
        <GaugeChart value={count} max={max} label="publicaciones" />
      )}
      <p className="text-xs text-slate-500">
        <span className={`font-semibold ${warn ? 'text-amber-600' : 'text-green-600'}`}>
          {remaining}
        </span>{' '}restantes
      </p>
      {warn && (
        <p className="text-[10px] text-amber-600 font-medium bg-amber-50 rounded-lg px-2 py-0.5 text-center">
          ⚠ Límite próximo
        </p>
      )}
    </div>
  )
}

export function ApiUsagePanel() {
  // Dynamic Convex api refs; cast required. Validated against convex/publicationLog.ts.
  const xCount      = useQuery((api.publicationLog as any).getXWriteCountThisMonth, {})
  const tumblrCount = useQuery((api.publicationLog as any).getTumblrWriteCountThisMonth, {})

  const x      = xCount ?? 0
  const tumblr = tumblrCount ?? 0

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span className="text-base font-semibold text-slate-900">Uso de APIs</span>
      </div>

      <div className="flex-1 flex flex-col gap-4 justify-center">
        <ChannelUsage
          label="X (Twitter)"
          count={x}
          max={500}
          loading={xCount === undefined}
          warn={x >= 400}
        />
        <div className="border-t border-[#E5EAF2]" />
        <ChannelUsage
          label="Tumblr"
          count={tumblr}
          max={500}
          loading={tumblrCount === undefined}
          warn={tumblr >= 400}
        />
      </div>

      <p className="text-[10px] text-slate-400 text-center mt-3">Límite editorial: 500/mes por canal</p>
    </div>
  )
}
