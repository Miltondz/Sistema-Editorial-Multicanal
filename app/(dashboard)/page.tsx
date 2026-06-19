'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { KPISection } from '@/components/dashboard/KPISection'
import { EditorialHero } from '@/components/dashboard/EditorialHero'
import { SchedulePanel } from '@/components/dashboard/SchedulePanel'
import { ActivityPanel } from '@/components/dashboard/ActivityPanel'
import { ApiUsagePanel } from '@/components/dashboard/ApiUsagePanel'
import { RecentPublications } from '@/components/dashboard/RecentPublications'
import { AIInsightsPanel } from '@/components/dashboard/AIInsightsPanel'
import { PublicationCalendar } from '@/components/dashboard/PublicationCalendar'

export default function DashboardPage() {
  // Dynamic Convex api ref; cast needed. Return validated against convex/contentItems.ts getDashboardStats.
  const stats = useQuery((api.contentItems as any).getDashboardStats, {})
  // Dynamic Convex api ref; cast required. Return validated against convex/contentItems.ts getDashboardSparklines.
  const sparklines = useQuery((api.contentItems as any).getDashboardSparklines, {})

  return (
    <div className="min-h-screen" style={{ background: '#F6F8FB' }}>
      {/* Top header */}
      <div className="px-10 py-6 flex items-center justify-between border-b border-[#E5EAF2] bg-white">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Hola, Valeria ✨</h1>
          <p className="text-slate-500 text-sm mt-0.5">Aquí tienes el resumen de tu operación editorial.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#E5EAF2] bg-slate-50 text-slate-400 text-sm" style={{ minWidth: 420 }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Buscar contenido...</span>
          </div>
          {/* Bell */}
          <button className="w-9 h-9 rounded-xl border border-[#E5EAF2] bg-white flex items-center justify-center hover:bg-slate-50 transition-colors">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          {/* New content */}
          <button
            className="px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: '#6366F1' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo contenido
          </button>
        </div>
      </div>

      <div className="px-10 py-8 space-y-6 max-w-[1600px] mx-auto">
        <KPISection stats={stats} sparklines={sparklines} />

        <EditorialHero />

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-5"><SchedulePanel /></div>
          <div className="col-span-4"><ActivityPanel /></div>
          <div className="col-span-3"><ApiUsagePanel /></div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8"><RecentPublications /></div>
          <div className="col-span-4"><AIInsightsPanel /></div>
        </div>

        <PublicationCalendar />
      </div>
    </div>
  )
}
