'use client'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'
import { useState, useRef } from 'react'
import CalendarGenerateModal from '@/components/planner/CalendarGenerateModal'
import { ActionBtn, DeleteBtn, ACTION_VARIANTS } from '@/components/ui/ActionBtn'

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'tumblr' | 'x'
type DayPart = 'morning' | 'afternoon' | 'evening'
type Week = (string | null)[]  // 7 slots, null = out-of-month day

const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening']
const DAY_PART_LABELS: Record<DayPart, string> = {
  morning:   'Mañana',
  afternoon: 'Tarde',
  evening:   'Noche',
}
const DAY_PART_HOURS: Record<DayPart, string> = {
  morning:   '~8–11 am',
  afternoon: '~12–3 pm',
  evening:   '~6–9 pm',
}
const DAY_PART_SHORT: Record<DayPart, string> = {
  morning:   'Mañ',
  afternoon: 'Tard',
  evening:   'Noc',
}

const STATUS_COLORS: Record<string, string> = {
  empty:      'bg-gray-50 text-gray-400',
  planned:    'bg-blue-50 text-blue-700 border border-blue-200',
  locked:     'bg-yellow-50 text-yellow-700 border border-yellow-200',
  ready:      'bg-green-50 text-green-700 border border-green-200',
  publishing: 'bg-purple-50 text-purple-700 border border-purple-200',
  published:  'bg-indigo-50 text-indigo-700 border border-indigo-200',
  skipped:    'bg-gray-100 text-gray-500 border border-gray-200',
  failed:     'bg-red-50 text-red-700 border border-red-200',
}

// Status left-border colors for SlotPill (type-colored bg + status border-l)
const STATUS_BORDER: Record<string, string> = {
  empty:      'border-l-gray-300',
  planned:    'border-l-blue-400',
  locked:     'border-l-yellow-500',
  ready:      'border-l-green-500',
  publishing: 'border-l-purple-600',
  published:  'border-l-indigo-600',
  skipped:    'border-l-gray-400',
  failed:     'border-l-red-600',
}

const STATUS_LABELS: Record<string, string> = {
  empty:      'Vacío',
  planned:    'Planeado',
  locked:     'Bloqueado',
  ready:      'Listo',
  publishing: 'Publicando',
  published:  'Publicado',
  skipped:    'Saltado',
  failed:     'Error',
}

const TYPE_COLORS: Record<string, string> = {
  comic:     'bg-blue-100 text-blue-700',
  libro:     'bg-purple-100 text-purple-700',
  cosplay:   'bg-pink-100 text-pink-700',
  articulo:  'bg-orange-100 text-orange-700',
  autor:     'bg-green-100 text-green-700',
  poster:    'bg-yellow-100 text-yellow-700',
  pelicula:  'bg-red-100 text-red-700',
  personaje: 'bg-teal-100 text-teal-700',
  coleccion: 'bg-indigo-100 text-indigo-700',
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Grid column template shared by all rows: label col + 7 day cols
const GRID_COLS = '80px repeat(7, minmax(0, 1fr))'

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Local-timezone today — NOT UTC (avoids off-by-one in UTC-N timezones) */
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isPast(d: string, today: string): boolean { return d < today }


function getMonthBounds(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    startDate: `${year}-${pad(month + 1)}-01`,
    endDate:   `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  }
}

function getDaysInMonth(year: number, month: number): string[] {
  const { startDate, endDate } = getMonthBounds(year, month)
  const dates: string[] = []
  const cur = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate   + 'T00:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

/**
 * Build calendar weeks with Mon=col0 alignment (ISO week).
 * Returns array of Week (7 items each). null = out-of-month padding.
 */
function getCalendarWeeks(year: number, month: number): Week[] {
  const days = getDaysInMonth(year, month)
  const firstUTCWeekday = new Date(days[0] + 'T00:00:00Z').getUTCDay()  // 0=Sun
  const monOffset = (firstUTCWeekday + 6) % 7  // Mon=0, Tue=1, ..., Sun=6
  const grid: (string | null)[] = [...Array(monOffset).fill(null), ...days]
  while (grid.length % 7 !== 0) grid.push(null)
  const weeks: Week[] = []
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7))
  return weeks
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const now = new Date()
  const today = todayStr()

  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth())
  const [channel, setChannel] = useState<Channel>('tumblr')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null)
  const [addCell,      setAddCell]      = useState<{ date: string; dayPart: DayPart } | null>(null)
  const [actionMsg,    setActionMsg]    = useState<string | null>(null)

  // Drag state — ref avoids re-renders during drag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draggingRef = useRef<any | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const { startDate, endDate } = getMonthBounds(year, month)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSlots   = useQuery(api.scheduleSlots.listByDateRangeWithItems as any, { startDate, endDate, channel })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xWriteCount = useQuery(api.publicationLog.getXWriteCountThisMonth as any, {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingCount = useQuery(api.contentItems.countByStatus as any, {})

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setLocked    = useMutation(api.scheduleSlots.setLocked    as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reschedule   = useMutation(api.scheduleSlots.reschedule   as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignSlot   = useMutation(api.scheduleSlots.assign       as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createManual = useMutation(api.scheduleSlots.createManual as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteSlot   = useMutation(api.scheduleSlots.deleteSlot   as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateCal     = useAction((api.actions as any).scoring.generateCalendar)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recomputeScores = useAction((api.actions as any).scoring.recomputeAllScores)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publishDirect   = useAction(api.actions.publisher.publishDirect as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const retryFailedSlot = useAction((api.actions.publisher as any).retryFailedSlot)

  const [generating,    setGenerating]    = useState(false)
  const [genResult,     setGenResult]     = useState<{ slotsCreated: number; slotsSkipped: number } | null>(null)
  const [genError,      setGenError]      = useState<string | null>(null)
  const [recomputing,   setRecomputing]   = useState(false)
  const [showGenModal,  setShowGenModal]  = useState(false)

  // Build slotMap: `${date}:${dayPart}` → slot[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slotMap = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const slot of (rawSlots as any[] ?? [])) {
    const key = `${slot.scheduledFor}:${slot.dayPart}`
    const arr = slotMap.get(key) ?? []
    arr.push(slot)
    slotMap.set(key, arr)
  }

  const weeks = getCalendarWeeks(year, month)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else { setMonth(m => m - 1) }
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else { setMonth(m => m + 1) }
  }

  async function handleGenerate(selectedItemIds: string[]) {
    setGenerating(true); setGenError(null); setGenResult(null)
    const effectiveStart = startDate < today ? today : startDate
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generateCal({ startDate: effectiveStart, endDate, channel, overwriteUnlocked: true, selectedItemIds: selectedItemIds as any })
      setGenResult(result)
      setShowGenModal(false)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error')
    } finally {
      setGenerating(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handlePublishNow(slot: any) {
    if (!slot.contentItemId) return
    setActionMsg(null)
    try {
      const r = await publishDirect({ contentItemId: slot.contentItemId, channel: slot.channel, slotId: slot._id })
      setActionMsg(r.success ? `Publicado${r.externalPostUrl ? ': ' + r.externalPostUrl : ''}` : `Error: ${r.error}`)
    } catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
    setSelectedSlot(null)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleReschedule(slot: any, newDate: string, newDayPart: DayPart) {
    setActionMsg(null)
    try {
      await reschedule({ id: slot._id, scheduledFor: newDate, dayPart: newDayPart })
      setSelectedSlot(null)
      setActionMsg('Reprogramado.')
    } catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleDelete(slot: any) {
    setActionMsg(null)
    try { await deleteSlot({ id: slot._id }); setSelectedSlot(null); setActionMsg('Slot eliminado.') }
    catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleUnassign(slot: any) {
    setActionMsg(null)
    try {
      await assignSlot({ id: slot._id, contentItemId: undefined, variantId: undefined, status: 'empty' })
      setSelectedSlot(null)
      setActionMsg('Contenido desasignado.')
    } catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleRetrySlot(slot: any) {
    setActionMsg(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await retryFailedSlot({ slotId: slot._id } as any)
      if ((result as any).queued) {
        setActionMsg('Slot re-encolado para publicación.')
      } else {
        setActionMsg(`Error: ${(result as any).error ?? 'No se pudo re-encolar'}`)
      }
    } catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onDragStart(slot: any) { draggingRef.current = slot }
  function onDragEnd()            { draggingRef.current = null; setDropTarget(null) }

  async function onDrop(targetDate: string, targetDayPart: DayPart) {
    setDropTarget(null)
    const slot = draggingRef.current
    draggingRef.current = null
    if (!slot) return
    if (slot.scheduledFor === targetDate && slot.dayPart === targetDayPart) return
    setActionMsg(null)
    try {
      await reschedule({ id: slot._id, scheduledFor: targetDate, dayPart: targetDayPart })
      setActionMsg(`Movido a ${targetDate} ${DAY_PART_LABELS[targetDayPart]}.`)
    } catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planner editorial</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Arrastra para mover · clic para editar · + para agregar
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button"
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
            Hoy
          </button>
          <button type="button"
            onClick={async () => { setRecomputing(true); try { await recomputeScores({ channel }) } finally { setRecomputing(false) } }}
            disabled={recomputing}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50">
            {recomputing ? 'Calculando…' : 'Actualizar scores'}
          </button>
          <button type="button" onClick={() => setShowGenModal(true)} disabled={generating}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
            {generating ? 'Generando…' : 'Generar calendario'}
          </button>
        </div>
      </div>

      {/* ── Pending approvals banner — always visible ── */}
      {pendingCount !== undefined && (
        pendingCount.total > 0 ? (
          <div className="mb-4 flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>
                <span className="font-semibold">{pendingCount.total}</span> pendiente{pendingCount.total !== 1 ? 's' : ''} de aprobación
                <span className="ml-1.5 text-amber-600 text-xs font-normal">
                  ({[
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (pendingCount as any).variantsPending > 0 && `${(pendingCount as any).variantsPending} variante${(pendingCount as any).variantsPending !== 1 ? 's' : ''}`,
                    pendingCount.inReview > 0 && `${pendingCount.inReview} en revisión`,
                    pendingCount.draft > 0 && `${pendingCount.draft} borrador${pendingCount.draft !== 1 ? 'es' : ''}`,
                  ].filter(Boolean).join(' · ')})
                </span>
              </span>
            </div>
            <Link href="/catalog" className="ml-4 px-3 py-1 text-xs font-semibold bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors shrink-0">
              Ir al catálogo →
            </Link>
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-between px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Sin publicaciones pendientes de aprobación</span>
            </div>
            <Link href="/catalog" className="ml-4 text-xs text-green-600 hover:text-green-800 underline underline-offset-2 shrink-0">
              Ver catálogo →
            </Link>
          </div>
        )
      )}

      {/* ── Feedback ── */}
      {genResult && (
        <div className="mb-3 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {genResult.slotsCreated} slots creados, {genResult.slotsSkipped} sin candidato.
        </div>
      )}
      {genError && (
        <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {genError}
        </div>
      )}
      {actionMsg && (
        <div className={`mb-3 px-4 py-2.5 rounded-lg text-sm border ${
          actionMsg.startsWith('Error')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          {actionMsg}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth}
            className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600">◀</button>
          <span className="font-semibold text-gray-800 min-w-[160px] text-center text-base">
            {MONTH_NAMES[month]} {year}
          </span>
          <button type="button" onClick={nextMonth}
            className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600">▶</button>
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['tumblr', 'x'] as Channel[]).map(ch => (
            <button key={ch} type="button" onClick={() => setChannel(ch)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                channel === ch ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}>
              {ch === 'tumblr' ? 'Tumblr' : 'X'}
            </button>
          ))}
        </div>

        {channel === 'x' && xWriteCount !== undefined && (
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            xWriteCount >= 400 ? 'bg-red-100 text-red-700'
            : xWriteCount >= 300 ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-gray-600'
          }`}>
            X: {xWriteCount}/500 este mes
          </span>
        )}
      </div>

      {/* ── Calendar grid ── */}
      {rawSlots === undefined ? (
        <div className="text-sm text-gray-400 text-center py-16">Cargando…</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">

          {/* Weekday column headers */}
          <div
            className="border-b border-gray-200 bg-gray-50"
            style={{ display: 'grid', gridTemplateColumns: GRID_COLS }}
          >
            <div className="px-2 py-2" />
            {WEEKDAY_LABELS.map(label => (
              <div key={label}
                className="px-2 py-2 text-xs font-semibold text-center text-gray-600 uppercase tracking-wide border-l border-gray-200">
                {label}
              </div>
            ))}
          </div>

          {/* Week bands */}
          <div className="divide-y divide-gray-200">
            {weeks.map((week, wi) => (
              <WeekBand
                key={wi}
                week={week}
                slotMap={slotMap}
                today={today}
                dropTarget={dropTarget}
                draggingRef={draggingRef}
                setDropTarget={setDropTarget}
                onDrop={onDrop}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onSlotClick={(slot) => { setSelectedSlot(slot); setActionMsg(null) }}
                onAddClick={(date, dayPart) => setAddCell({ date, dayPart })}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="mt-4 space-y-2">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tipo de contenido</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TYPE_COLORS).map(([type, cls]) => (
              <span key={type} className={`px-2 py-0.5 rounded text-xs border-l-4 border-l-gray-400 ${cls}`}>
                {type}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Estado (borde izquierdo)</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STATUS_LABELS).filter(([k]) => k !== 'empty').map(([k, label]) => (
              <span key={k} className={`px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 border-l-4 ${STATUS_BORDER[k]}`}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {selectedSlot && (
        <SlotDetailModal
          slot={selectedSlot}
          allSlots={rawSlots as any[] ?? []}
          onClose={() => { setSelectedSlot(null); setActionMsg(null) }}
          onPublishNow={() => handlePublishNow(selectedSlot)}
          onReschedule={(d, dp) => handleReschedule(selectedSlot, d, dp)}
          onToggleLock={() => { setLocked({ id: selectedSlot._id, locked: !selectedSlot.locked }); setSelectedSlot(null) }}
          onUnassign={() => handleUnassign(selectedSlot)}
          onDelete={() => handleDelete(selectedSlot)}
          onRetry={() => handleRetrySlot(selectedSlot)}
          actionMsg={actionMsg}
        />
      )}

      {addCell && (
        <AddSlotModal
          date={addCell.date}
          dayPart={addCell.dayPart}
          channel={channel}
          onClose={() => { setAddCell(null); setActionMsg(null) }}
          onCreate={async () => {
            setActionMsg(null)
            try {
              await createManual({ scheduledFor: addCell.date, dayPart: addCell.dayPart, channel })
              setAddCell(null)
              setActionMsg(`Slot creado para ${addCell.date} ${DAY_PART_LABELS[addCell.dayPart]}.`)
            } catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
          }}
          actionMsg={actionMsg}
        />
      )}

      {showGenModal && (
        <CalendarGenerateModal
          channel={channel}
          startDate={startDate}
          endDate={endDate}
          generating={generating}
          onClose={() => setShowGenModal(false)}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  )
}

// ── WeekBand ──────────────────────────────────────────────────────────────────
// One full week: date header row + 3 time-band rows

function WeekBand({
  week, slotMap, today, dropTarget, draggingRef,
  setDropTarget, onDrop, onDragStart, onDragEnd, onSlotClick, onAddClick,
}: {
  week: Week
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slotMap: Map<string, any[]>
  today: string
  dropTarget: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draggingRef: React.MutableRefObject<any>
  setDropTarget: (k: string | null) => void
  onDrop: (date: string, dayPart: DayPart) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDragStart: (slot: any) => void
  onDragEnd: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSlotClick: (slot: any) => void
  onAddClick: (date: string, dayPart: DayPart) => void
}) {
  return (
    <div>
      {/* Date number header row */}
      <div
        className="border-b border-gray-100 bg-gray-50/60"
        style={{ display: 'grid', gridTemplateColumns: GRID_COLS }}
      >
        <div className="px-2 py-1 text-[10px] text-gray-400 font-medium" />
        {week.map((date, i) => {
          if (!date) return (
            <div key={`empty-${i}`}
              className="border-l border-gray-200 bg-gray-50/80 px-2 py-1" />
          )
          const isToday = date === today
          return (
            <div key={date}
              className={`border-l border-gray-200 px-2 py-1 text-center ${isToday ? 'bg-indigo-50' : ''}`}>
              <span className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                {parseInt(date.slice(8), 10)}
              </span>
              {isToday && (
                <span className="ml-1 text-[9px] text-indigo-400 font-normal">hoy</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Three time-band rows */}
      {DAY_PARTS.map(dayPart => (
        <div
          key={dayPart}
          className="border-b border-gray-100 last:border-b-0"
          style={{ display: 'grid', gridTemplateColumns: GRID_COLS }}
        >
          {/* Band label */}
          <div className="px-2 py-2 flex flex-col justify-center border-r border-gray-100 bg-gray-50/40">
            <span className="text-[10px] font-semibold text-gray-500 uppercase leading-none">
              {DAY_PART_SHORT[dayPart]}
            </span>
            <span className="text-[9px] text-gray-300 mt-0.5 leading-none">
              {DAY_PART_HOURS[dayPart]}
            </span>
          </div>

          {/* Day cells for this time band */}
          {week.map((date, i) => {
            if (!date) return (
              <div key={`empty-${i}`}
                className="border-l border-gray-100 bg-gray-50/60 min-h-[52px]" />
            )

            const cellKey = `${date}:${dayPart}`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const slots: any[] = slotMap.get(cellKey) ?? []
            const past = isPast(date, today)
            const isDropTarget = dropTarget === cellKey
            const isToday = date === today

            return (
              <div
                key={date}
                className={`border-l border-gray-100 px-1.5 py-1.5 min-h-[52px] flex flex-col gap-1 transition-colors ${
                  isDropTarget
                    ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300'
                    : isToday
                    ? 'bg-indigo-50/30'
                    : past
                    ? 'bg-gray-50/40'
                    : 'hover:bg-slate-50'
                }`}
                onDragOver={e => {
                  if (draggingRef.current) { e.preventDefault(); setDropTarget(cellKey) }
                }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
                }}
                onDrop={e => { e.preventDefault(); onDrop(date, dayPart) }}
              >
                {slots.map(slot => (
                  <SlotPill
                    key={slot._id}
                    slot={slot}
                    onDragStart={() => onDragStart(slot)}
                    onDragEnd={onDragEnd}
                    onClick={() => onSlotClick(slot)}
                  />
                ))}
                {!past && (
                  <button
                    type="button"
                    onClick={() => onAddClick(date, dayPart)}
                    className="w-full text-[10px] text-gray-400 border border-dashed border-gray-300 rounded py-0.5 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors leading-none"
                    title="Agregar publicación"
                  >
                    + Agregar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function IconBtn({ title, onClick, disabled, className, children }: {
  title: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`relative group w-8 h-8 flex items-center justify-center rounded text-base disabled:opacity-40 transition-colors ${className ?? ''}`}
    >
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {title}
      </span>
    </button>
  )
}

// ── SlotPill ──────────────────────────────────────────────────────────────────

function SlotPill({
  slot, onDragStart, onDragEnd, onClick,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slot: any
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const draggable = !slot.locked && !['published', 'publishing'].includes(slot.status)
  const typeColor   = TYPE_COLORS[slot.item?.contentType] ?? 'bg-gray-100 text-gray-600'
  const borderColor = STATUS_BORDER[slot.status] ?? 'border-l-gray-400'

  return (
    <div
      draggable={draggable}
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={slot.item?.title ?? 'Sin contenido'}
      className={`relative overflow-hidden rounded px-1.5 py-1 text-[10px] select-none transition-all cursor-pointer border-l-4 ${typeColor} ${borderColor} ${
        draggable ? 'hover:brightness-95 active:opacity-70' : 'opacity-80'
      }`}
    >
      {slot.status === 'published' && (
        <div className="absolute inset-0 pointer-events-none rounded overflow-hidden">
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(135deg, transparent calc(50% - 1px), rgba(220,38,38,0.75) calc(50% - 1px), rgba(220,38,38,0.75) calc(50% + 1px), transparent calc(50% + 1px))'
          }} />
        </div>
      )}
      <div className="flex items-center gap-1 mb-0.5">
        {slot.locked && <span title="Bloqueado" className="text-[9px]">🔒</span>}
        <span className="text-[9px] font-semibold opacity-80">
          {slot.item?.contentType ?? '—'}
        </span>
        {slot.scheduledTime && (
          <span className="text-[9px] text-indigo-600 font-mono ml-auto">{slot.scheduledTime}</span>
        )}
        {!slot.scheduledTime && slot.contentMode === 'recycled' && (
          <span className="text-[9px] bg-amber-100 text-amber-600 px-0.5 rounded ml-auto">♻</span>
        )}
      </div>
      <p className="font-medium leading-tight line-clamp-2 text-[10px]">
        {slot.item?.title ?? <span className="italic opacity-60">Sin contenido</span>}
      </p>
    </div>
  )
}

// ── SlotDetailModal ───────────────────────────────────────────────────────────

function SlotDetailModal({
  slot, allSlots, onClose, onPublishNow, onReschedule, onToggleLock, onUnassign, onDelete, onRetry, actionMsg,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slot: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allSlots: any[]
  onClose: () => void
  onPublishNow: () => void
  onReschedule: (date: string, dayPart: DayPart) => void
  onToggleLock: () => void
  onUnassign: () => void
  onDelete: () => void
  onRetry: () => void
  actionMsg: string | null
}) {
  const [newDate,    setNewDate]    = useState<string>(slot.scheduledFor)
  const [newDayPart, setNewDayPart] = useState<DayPart>(slot.dayPart)
  const [publishing, setPublishing] = useState(false)
  const [slotTime,   setSlotTime]   = useState<string>(slot.scheduledTime ?? '')
  const [savingTime, setSavingTime] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setSlotTimeMutation = useMutation(api.scheduleSlots.setSlotTime as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pubLogs = useQuery((api.publicationLog as any).listBySlot, { slotId: slot._id }) as any[] | undefined

  const canPublishNow = slot.contentItemId && !['published', 'publishing'].includes(slot.status)
  const canReschedule = !slot.locked && !['publishing', 'published'].includes(slot.status)
  const dateChanged   = newDate !== slot.scheduledFor || newDayPart !== slot.dayPart

  // Conflict: other slot on same date+channel with same time (excluding this slot)
  const timeConflict = slotTime
    ? allSlots.find(s =>
        s._id !== slot._id &&
        s.scheduledFor === slot.scheduledFor &&
        s.channel === slot.channel &&
        s.scheduledTime === slotTime &&
        !['published', 'skipped', 'failed'].includes(s.status)
      )
    : null

  async function handleSaveTime() {
    setSavingTime(true)
    try {
      await setSlotTimeMutation({ id: slot._id, scheduledTime: slotTime || undefined })
    } catch (err) {
      console.error(err)
    } finally {
      setSavingTime(false)
    }
  }

  const channelAccent = slot.channel === 'tumblr' ? 'bg-indigo-600' : 'bg-gray-800'
  const channelLabel  = slot.channel === 'tumblr' ? 'Tumblr' : 'X / Twitter'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      {/* Horizontal layout: left = details, right = actions */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-row" onClick={e => e.stopPropagation()}>

        {/* ── LEFT: details ── */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Top strip */}
          <div className={`${channelAccent} px-5 py-3 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold text-sm">{channelLabel}</span>
              <span className="text-white/50">·</span>
              <span className="text-white/80 text-sm">{slot.scheduledFor}</span>
              <span className="text-white/50">·</span>
              <span className="text-white/80 text-sm">{DAY_PART_LABELS[slot.dayPart as DayPart]}</span>
              {slot.scheduledTime && (
                <span className="text-white font-medium text-sm">{slot.scheduledTime} UTC</span>
              )}
              {slot.locked && <span className="text-[11px] bg-white/20 text-white px-1.5 py-0.5 rounded">🔒</span>}
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none transition-colors">✕</button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Content card */}
            <div className="flex gap-3 items-start">
              {slot.item?.coverImageUrl && (
                <img
                  src={slot.item.coverImageUrl}
                  alt=""
                  className="w-16 h-20 rounded-lg object-cover flex-shrink-0 border border-gray-200 shadow-sm"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0">
                {slot.item ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{slot.item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">{slot.item.contentType}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[slot.status] ?? ''}`}>
                        {STATUS_LABELS[slot.status] ?? slot.status}
                      </span>
                      {slot.contentMode === 'recycled' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">♻ Reciclado</span>
                      )}
                    </div>
                    {slot.item._id && (
                      <Link href={`/catalog/${slot.item._id}`}
                        className="text-xs text-indigo-600 hover:underline font-medium mt-2 block"
                        onClick={onClose}>
                        Abrir en editor →
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400 italic">Sin contenido asignado</p>
                )}
              </div>
            </div>

            {/* Time picker */}
            {canReschedule && (
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Hora (UTC)</label>
                <div className="flex gap-2 items-center">
                  <input type="time" value={slotTime} onChange={e => setSlotTime(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <button type="button" onClick={handleSaveTime}
                    disabled={savingTime || slotTime === (slot.scheduledTime ?? '')}
                    className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap transition-colors">
                    {savingTime ? '…' : 'Guardar'}
                  </button>
                  {slotTime && (
                    <button type="button" title="Quitar hora"
                      onClick={() => { setSlotTime(''); setSlotTimeMutation({ id: slot._id, scheduledTime: undefined }) }}
                      className="w-8 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">✕</button>
                  )}
                </div>
                {timeConflict && (
                  <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ Conflicto: otro slot a las {slotTime}{timeConflict.item?.title ? ` (${timeConflict.item.title})` : ''}.
                  </p>
                )}
              </div>
            )}

            {/* Reschedule */}
            {canReschedule && (
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Reprogramar</label>
                <div className="flex gap-2">
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={newDayPart} onChange={e => setNewDayPart(e.target.value as DayPart)}
                    className="px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {DAY_PARTS.map(dp => <option key={dp} value={dp}>{DAY_PART_LABELS[dp]}</option>)}
                  </select>
                </div>
                {dateChanged && (
                  <button type="button" onClick={() => onReschedule(newDate, newDayPart)}
                    className="mt-2 w-full px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                    Confirmar cambio de fecha
                  </button>
                )}
              </div>
            )}

            {/* Publication log */}
            {pubLogs && pubLogs.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Historial</p>
                <div className="space-y-1.5">
                  {pubLogs.slice(0, 3).map((log: any) => (
                    <div key={log._id} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                      log.publishStatus === 'success'
                        ? 'bg-green-50 text-green-800 border border-green-100'
                        : 'bg-red-50 text-red-800 border border-red-100'
                    }`}>
                      <span className="font-bold flex-shrink-0">{log.publishStatus === 'success' ? '✓' : '✗'}</span>
                      <span className="flex-1 min-w-0 break-all">
                        {log.externalPostUrl
                          ? <a href={log.externalPostUrl} target="_blank" rel="noopener noreferrer" className="underline">{log.externalPostUrl}</a>
                          : (log.errorMessage ?? log.publishStatus)
                        }
                      </span>
                      <span className="flex-shrink-0 opacity-50">{new Date(log._creationTime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
                {pubLogs[0]?.errorMessage?.includes('ariante') && slot.item?._id && (
                  <Link href={`/catalog/${slot.item._id}`} className="text-indigo-600 text-xs font-medium hover:underline mt-2 block" onClick={onClose}>
                    → Aprobar variante en el editor
                  </Link>
                )}
              </div>
            )}

            {/* Feedback */}
            {actionMsg && (
              <div className={`px-3 py-2.5 rounded-lg text-xs border ${
                actionMsg.startsWith('Error')
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-green-50 border-green-200 text-green-800'
              }`}>
                {actionMsg}
                {actionMsg.includes('ariante') && slot.item?._id && (
                  <Link href={`/catalog/${slot.item._id}`} className="block mt-1 underline font-medium" onClick={onClose}>
                    → Ir al editor a aprobar variante
                  </Link>
                )}
                {actionMsg.includes('probado') && slot.item?._id && (
                  <Link href={`/catalog/${slot.item._id}`} className="block mt-1 underline font-medium" onClick={onClose}>
                    → Ir al editor a aprobar el ítem
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: actions panel ── */}
        <div className="w-44 flex-shrink-0 bg-gray-50 border-l border-gray-100 flex flex-col gap-2 p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Acciones</p>

          {canPublishNow && (
            <ActionBtn
              disabled={publishing}
              onClick={async () => { setPublishing(true); await onPublishNow(); setPublishing(false) }}
              variant="green" icon={publishing ? '⏳' : '▶'} full
            >
              {publishing ? 'Publicando…' : 'Publicar'}
            </ActionBtn>
          )}
          {(slot.status === 'failed' || slot.status === 'planned' || slot.status === 'ready') && slot.contentItemId && (
            <ActionBtn onClick={onRetry} variant="amber" icon="↺" full>Reintentar</ActionBtn>
          )}
          <ActionBtn onClick={onToggleLock} variant="ghost" icon={slot.locked ? '🔓' : '🔒'} full>
            {slot.locked ? 'Desbloquear' : 'Bloquear'}
          </ActionBtn>
          {slot.contentItemId && !slot.locked && !['published', 'publishing'].includes(slot.status) && (
            <ActionBtn onClick={onUnassign} variant="ghost" icon="⊗" full>Desasignar</ActionBtn>
          )}

          <div className="flex-1" />

          <ActionBtn onClick={onClose} variant="ghost" icon="✕" full>Cerrar</ActionBtn>

          {!slot.locked && !['published', 'publishing'].includes(slot.status) && (
            <DeleteBtn onDelete={onDelete} label="Eliminar slot" full />
          )}
        </div>

      </div>
    </div>
  )
}

// ── AddSlotModal ──────────────────────────────────────────────────────────────

function AddSlotModal({
  date, dayPart, channel, onClose, onCreate, actionMsg,
}: {
  date: string; dayPart: DayPart; channel: Channel
  onClose: () => void; onCreate: () => void; actionMsg: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Crear slot</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 space-y-1">
          <p><span className="font-medium">Fecha:</span> {date}</p>
          <p>
            <span className="font-medium">Franja:</span> {DAY_PART_LABELS[dayPart]}
            <span className="text-gray-400 ml-1">{DAY_PART_HOURS[dayPart]}</span>
          </p>
          <p><span className="font-medium">Canal:</span> {channel === 'tumblr' ? 'Tumblr' : 'X'}</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          El slot se creará vacío. Usa &quot;Generar calendario&quot; para asignarle contenido, o asígnalo manualmente desde el editor.
        </p>
        {actionMsg && (
          <div className={`mb-3 px-3 py-2 rounded text-xs border ${
            actionMsg.startsWith('Error')
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-green-50 border-green-200 text-green-800'
          }`}>
            {actionMsg}
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCreate}
            className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            Crear slot
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
