'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

type CalendarDay = { date: string; tumblr: number; x: number; total: number }

// Color scale matching GitHub contribution graph (green scale)
const COLORS = ['#EBEDF0', '#C6E48B', '#7BC96F', '#239A3B', '#196127']

function getColor(total: number): string {
  if (total === 0) return COLORS[0]
  if (total <= 2) return COLORS[1]
  if (total <= 5) return COLORS[2]
  if (total <= 9) return COLORS[3]
  return COLORS[4]
}

export function PublicationCalendar() {
  // Dynamic Convex api ref; cast required. Return validated against convex/publicationLog.ts getCalendarData.
  const data = useQuery((api.publicationLog as any).getCalendarData, {})

  // Build date map
  const dayMap = new Map<string, CalendarDay>()
  if (data) {
    for (const d of data) dayMap.set(d.date, d)
  }

  // Generate last 52 weeks of dates (today back 364 days)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - 364)
  // Adjust to start on Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay())

  const weeks: string[][] = []
  const cur = new Date(startDate)
  while (cur <= today) {
    const week: string[] = []
    for (let d = 0; d < 7; d++) {
      week.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }

  // Month labels: find first week where month changes
  const monthLabels: Array<{ label: string; weekIdx: number }> = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const m = new Date(week[0] + 'T12:00:00').getMonth()
    if (m !== lastMonth) {
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
      monthLabels.push({ label: monthNames[m], weekIdx: wi })
      lastMonth = m
    }
  })

  const todayISO = today.toISOString().slice(0, 10)
  const totalPubs = data?.reduce((s: number, d: CalendarDay) => s + d.total, 0) ?? 0

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-base font-semibold text-slate-900">Actividad de publicación</span>
          <p className="text-xs text-slate-400 mt-0.5">
            {data === undefined ? 'Cargando…' : `${totalPubs} publicaciones en el último año`}
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>Menos</span>
          {COLORS.map((c, i) => (
            <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
          ))}
          <span>Más</span>
        </div>
      </div>

      {data === undefined ? (
        <div className="h-24 bg-slate-50 rounded-xl animate-pulse" />
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            {/* Month labels row */}
            <div className="flex mb-1" style={{ paddingLeft: 28 }}>
              {weeks.map((_, wi) => {
                const lbl = monthLabels.find(m => m.weekIdx === wi)
                return (
                  <div key={wi} style={{ width: 14, marginRight: 2, flexShrink: 0 }}>
                    {lbl && (
                      <span className="text-slate-400 font-medium capitalize" style={{ fontSize: 10 }}>
                        {lbl.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-0">
              {/* Day labels */}
              <div className="flex flex-col mr-1.5" style={{ flexShrink: 0 }}>
                {['', 'Lun', '', 'Mié', '', 'Vie', ''].map((lbl, i) => (
                  <div key={i} style={{ height: 13, marginBottom: 2, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <span className="text-slate-400" style={{ fontSize: 9 }}>{lbl}</span>
                  </div>
                ))}
              </div>

              {/* Week columns */}
              <div className="flex gap-[2px]">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.map((dateStr, di) => {
                      const isFuture = dateStr > todayISO
                      if (isFuture) return <div key={di} style={{ width: 12, height: 12 }} />
                      const day = dayMap.get(dateStr)
                      const total = day?.total ?? 0
                      const isToday = dateStr === todayISO
                      return (
                        <div
                          key={di}
                          title={`${dateStr}: ${total} publicaciones${day ? ` (T:${day.tumblr} X:${day.x})` : ''}`}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 2,
                            background: getColor(total),
                            outline: isToday ? '1px solid #6366F1' : undefined,
                            outlineOffset: isToday ? '1px' : undefined,
                            cursor: 'default',
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
