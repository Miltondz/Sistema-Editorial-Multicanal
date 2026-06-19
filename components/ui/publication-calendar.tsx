'use client'

import { useState } from 'react'
import {
  format,
  subDays,
  addDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
} from 'date-fns'
import { es } from 'date-fns/locale'

interface DayData {
  date: string
  tumblr: number
  x: number
  total: number
}

interface TooltipState {
  x: number
  y: number
  date: string
  data: DayData | null
}

const TUMBLR_COLORS = ['#1e293b', '#1e3a5f', '#1d4ed8', '#3b82f6', '#93c5fd']
const X_COLORS      = ['#1e293b', '#374151', '#6b7280', '#d1d5db', '#f9fafb']
const COMBINED_COLORS = ['#1e293b', '#312e81', '#4338ca', '#6366f1', '#a5b4fc']

type ViewMode = 'combined' | 'tumblr' | 'x'

interface PublicationCalendarProps {
  data: DayData[]
}

export function PublicationCalendar({ data }: PublicationCalendarProps) {
  const [mode, setMode] = useState<ViewMode>('combined')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const today = new Date()
  const startDate = subDays(today, 364)

  const dataMap = new Map<string, DayData>()
  for (const d of data) dataMap.set(d.date, d)

  function getCount(d: DayData): number {
    if (mode === 'tumblr') return d.tumblr
    if (mode === 'x') return d.x
    return d.total
  }

  function getColors(): string[] {
    if (mode === 'tumblr') return TUMBLR_COLORS
    if (mode === 'x') return X_COLORS
    return COMBINED_COLORS
  }

  function getColor(count: number): string {
    const colors = getColors()
    if (count === 0) return colors[0]
    if (count === 1) return colors[1]
    if (count <= 3) return colors[2]
    if (count <= 6) return colors[3]
    return colors[4]
  }

  // Build weeks
  const weeks: Date[][] = []
  let weekStart = startOfWeek(startDate, { weekStartsOn: 0 })
  while (weekStart <= today) {
    weeks.push(
      eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 0 }) })
    )
    weekStart = addDays(weekStart, 7)
  }

  // Month labels: find first week of each month
  const monthLabels: { label: string; weekIndex: number }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const m = week[0].getMonth()
    if (m !== lastMonth) {
      monthLabels.push({ label: format(week[0], 'MMM', { locale: es }), weekIndex: wi })
      lastMonth = m
    }
  })

  const DAY_LABELS = ['Dom', '', 'Mar', '', 'Jue', '', 'Sáb']
  const totalPubs = data.reduce((s, d) => s + d.total, 0)

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-white">Actividad de publicaciones</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {totalPubs.toLocaleString()} publicaciones en el último año
          </p>
        </div>
        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-700 overflow-hidden bg-slate-800 text-[11px] p-0.5 gap-0.5 shrink-0">
          {(['combined', 'tumblr', 'x'] as ViewMode[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                mode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {v === 'combined' ? 'Todos' : v === 'tumblr' ? '📷 Tumblr' : '𝕏 X'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Month labels */}
          <div className="flex mb-1 ml-8">
            {weeks.map((_, wi) => {
              const label = monthLabels.find(m => m.weekIndex === wi)
              return (
                <div key={wi} className="w-3 mr-[3px] shrink-0">
                  {label && (
                    <span className="text-[10px] text-slate-500 font-medium capitalize">
                      {label.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-0">
            {/* Day labels */}
            <div className="flex flex-col mr-1.5 shrink-0">
              {DAY_LABELS.map((label, i) => (
                <div key={i} className="h-3 mb-[3px] flex items-center">
                  <span className="text-[9px] text-slate-600 w-6 text-right">{label}</span>
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) => {
                    if (day > today) {
                      return <div key={di} className="w-3 h-3" />
                    }
                    const iso = format(day, 'yyyy-MM-dd')
                    const dayData = dataMap.get(iso) ?? { date: iso, tumblr: 0, x: 0, total: 0 }
                    const count = getCount(dayData)
                    const bg = getColor(count)
                    const isToday = isSameDay(day, today)
                    return (
                      <div
                        key={di}
                        className={`w-3 h-3 rounded-[2px] cursor-pointer transition-opacity hover:opacity-80 ${
                          isToday ? 'ring-1 ring-white/50' : ''
                        }`}
                        style={{ backgroundColor: bg }}
                        onMouseEnter={e => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect()
                          setTooltip({ x: rect.left, y: rect.top, date: iso, data: dayData })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{ left: tooltip.x, top: tooltip.y - 68, transform: 'translateX(-50%)' }}
        >
          <p className="text-slate-300 font-medium mb-1">
            {format(new Date(tooltip.date + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}
          </p>
          {tooltip.data && tooltip.data.total > 0 ? (
            <div className="space-y-0.5">
              {tooltip.data.tumblr > 0 && (
                <p className="text-blue-300">📷 {tooltip.data.tumblr} Tumblr</p>
              )}
              {tooltip.data.x > 0 && (
                <p className="text-slate-300">𝕏 {tooltip.data.x} X</p>
              )}
              <p className="text-white font-semibold border-t border-slate-700 mt-1 pt-1">
                {tooltip.data.total} total
              </p>
            </div>
          ) : (
            <p className="text-slate-500">Sin publicaciones</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
        <span>Menos</span>
        {getColors().map((c, i) => (
          <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: c }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  )
}
