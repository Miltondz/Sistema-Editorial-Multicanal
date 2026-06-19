'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'

type ScheduleSlotWithItem = {
  _id: string
  channel: 'tumblr' | 'x'
  dayPart: 'morning' | 'afternoon' | 'evening'
  status: 'empty' | 'planned' | 'locked' | 'ready' | 'publishing' | 'published' | 'skipped' | 'failed'
  item: { _id: string; title: string; contentType: string } | null
}

const DAY_PART_TIME: Record<string, string> = {
  morning:   '09:00',
  afternoon: '13:00',
  evening:   '18:00',
}

const DAY_PART_ORDER: Record<string, number> = {
  morning: 0, afternoon: 1, evening: 2,
}

function statusPill(status: string) {
  if (status === 'published') return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Publicado</span>
  )
  if (status === 'failed') return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-600">Fallido</span>
  )
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Pendiente</span>
  )
}

function channelBadge(channel: string) {
  if (channel === 'tumblr') return (
    <span className="w-6 h-6 rounded-md flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold shrink-0">T</span>
  )
  return (
    <span className="w-6 h-6 rounded-md flex items-center justify-center bg-slate-900 text-white text-[10px] font-bold shrink-0">X</span>
  )
}

export function SchedulePanel() {
  const today = new Date().toISOString().slice(0, 10)

  // Dynamic Convex api ref; cast required. Args/return validated against convex/scheduleSlots.ts listByDateRangeWithItems.
  const tumblrSlots = useQuery((api.scheduleSlots as any).listByDateRangeWithItems, {
    startDate: today, endDate: today, channel: 'tumblr',
  })
  const xSlots = useQuery((api.scheduleSlots as any).listByDateRangeWithItems, {
    startDate: today, endDate: today, channel: 'x',
  })

  const merged = ([...(tumblrSlots ?? []), ...(xSlots ?? [])] as ScheduleSlotWithItem[])
    .sort((a, b) => (DAY_PART_ORDER[a.dayPart] ?? 99) - (DAY_PART_ORDER[b.dayPart] ?? 99))
    .slice(0, 5)

  const loading = tumblrSlots === undefined || xSlots === undefined

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-base font-semibold text-slate-900">Agenda de hoy</span>
        </div>
        <Link href="/planner" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Ver planner →</Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : merged.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sin slots para hoy.</p>
      ) : (
        <div className="space-y-2">
          {merged.map((slot: ScheduleSlotWithItem) => (
            <div key={slot._id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <span className="text-xs font-mono text-slate-400 w-12 shrink-0">
                {DAY_PART_TIME[slot.dayPart] ?? slot.dayPart}
              </span>
              {channelBadge(slot.channel)}
              <span className="text-sm text-slate-700 truncate flex-1">
                {slot.item?.title ?? '(sin título)'}
              </span>
              {statusPill(slot.status)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
