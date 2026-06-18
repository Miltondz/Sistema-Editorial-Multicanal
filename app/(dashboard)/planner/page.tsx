'use client'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'
import { useState, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'tumblr' | 'x'
type DayPart = 'morning' | 'afternoon' | 'evening'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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
  while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1) }
  return dates
}

function todayStr() { return new Date().toISOString().slice(0, 10) }
function isPast(d: string) { return d < todayStr() }

function weekdayShort(dateStr: string) {
  return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][new Date(dateStr + 'T00:00:00Z').getUTCDay()]
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [channel, setChannel] = useState<Channel>('tumblr')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null)
  const [addCell, setAddCell]           = useState<{ date: string; dayPart: DayPart } | null>(null)
  const [actionMsg, setActionMsg]       = useState<string | null>(null)

  // Drag state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draggingRef = useRef<any | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const { startDate, endDate } = getMonthBounds(year, month)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSlots = useQuery(api.scheduleSlots.listByDateRangeWithItems as any, { startDate, endDate, channel })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xWriteCount = useQuery(api.publicationLog.getXWriteCountThisMonth as any, {})

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

  const [generating,  setGenerating]  = useState(false)
  const [genResult,   setGenResult]   = useState<{ slotsCreated: number; slotsSkipped: number } | null>(null)
  const [genError,    setGenError]    = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)

  // Build slot map: `${date}:${dayPart}` → slot[] (multiple per cell)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slotMap = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const slot of (rawSlots as any[] ?? [])) {
    const key = `${slot.scheduledFor}:${slot.dayPart}`
    const arr = slotMap.get(key) ?? []
    arr.push(slot)
    slotMap.set(key, arr)
  }

  const days = getDaysInMonth(year, month)

  function prevMonth() { month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1) }
  function nextMonth() { month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1) }

  async function handleGenerate() {
    setGenerating(true); setGenError(null); setGenResult(null)
    try { setGenResult(await generateCal({ startDate, endDate, channel, overwriteUnlocked: true })) }
    catch (err) { setGenError(err instanceof Error ? err.message : 'Error') }
    finally { setGenerating(false) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handlePublishNow(slot: any) {
    if (!slot.contentItemId) return
    setActionMsg(null)
    try {
      const r = await publishDirect({ contentItemId: slot.contentItemId, channel: slot.channel })
      setActionMsg(r.success ? `Publicado${r.externalPostUrl ? ': ' + r.externalPostUrl : ''}` : `Error: ${r.error}`)
    } catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
    setSelectedSlot(null)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleReschedule(slot: any, newDate: string, newDayPart: DayPart) {
    setActionMsg(null)
    try { await reschedule({ id: slot._id, scheduledFor: newDate, dayPart: newDayPart }); setSelectedSlot(null); setActionMsg('Reprogramado.') }
    catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
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
    try { await assignSlot({ id: slot._id, contentItemId: undefined, variantId: undefined, status: 'empty' }); setSelectedSlot(null); setActionMsg('Contenido desasignado.') }
    catch (err) { setActionMsg(`Error: ${err instanceof Error ? err.message : String(err)}`) }
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onDragStart(slot: any) {
    draggingRef.current = slot
  }

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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planner editorial</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Arrastra para mover · clic para editar · + para agregar en una franja
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
            Hoy
          </button>
          <button type="button" onClick={async () => { setRecomputing(true); try { await recomputeScores({ channel }) } finally { setRecomputing(false) } }}
            disabled={recomputing}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50">
            {recomputing ? 'Calculando…' : 'Actualizar scores'}
          </button>
          <button type="button" onClick={handleGenerate} disabled={generating}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
            {generating ? 'Generando…' : 'Generar calendario'}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {genResult && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {genResult.slotsCreated} slots creados, {genResult.slotsSkipped} sin candidato elegible.
        </div>
      )}
      {genError && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{genError}</div>}
      {actionMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${actionMsg.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {actionMsg}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth} className="p-1.5 border border-gray-300 rounded hover:bg-gray-50">◀</button>
          <span className="font-semibold text-gray-800 min-w-[140px] text-center">{MONTH_NAMES[month]} {year}</span>
          <button type="button" onClick={nextMonth} className="p-1.5 border border-gray-300 rounded hover:bg-gray-50">▶</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['tumblr', 'x'] as Channel[]).map(ch => (
              <button key={ch} type="button" onClick={() => setChannel(ch)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${channel === ch ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {ch === 'tumblr' ? 'Tumblr' : 'X'}
              </button>
            ))}
          </div>
          {channel === 'x' && xWriteCount !== undefined && (
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${xWriteCount >= 400 ? 'bg-red-100 text-red-700' : xWriteCount >= 300 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
              X: {xWriteCount}/500 este mes
            </span>
          )}
        </div>
      </div>

      {/* Calendar */}
      {rawSlots === undefined ? (
        <div className="text-sm text-gray-400 text-center py-16">Cargando…</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="px-3 py-2">Día</div>
            {DAY_PARTS.map(dp => (
              <div key={dp} className="px-3 py-2">
                {DAY_PART_LABELS[dp]}
                <span className="font-normal text-gray-400 ml-1">{DAY_PART_HOURS[dp]}</span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {days.map(date => {
              const past = isPast(date)
              const isToday = date === todayStr()
              return (
                <div key={date} className={`grid grid-cols-4 ${past ? 'opacity-55' : ''}`}>
                  {/* Date label */}
                  <div className={`px-3 py-2 flex flex-col justify-start border-r border-gray-100 pt-3 ${isToday ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                    <span className={`text-sm font-bold ${isToday ? 'text-indigo-700' : 'text-gray-700'}`}>
                      {parseInt(date.slice(8), 10)}
                      {isToday && <span className="ml-1 text-[10px] font-normal text-indigo-500">hoy</span>}
                    </span>
                    <span className="text-xs text-gray-400">{weekdayShort(date)}</span>
                  </div>

                  {/* Slot columns */}
                  {DAY_PARTS.map(dayPart => {
                    const cellKey = `${date}:${dayPart}`
                    const slots = slotMap.get(cellKey) ?? []
                    const isDropTarget = dropTarget === cellKey

                    return (
                      <div
                        key={dayPart}
                        className={`px-2 py-2 border-r border-gray-100 last:border-r-0 min-h-[80px] flex flex-col gap-1.5 transition-colors ${
                          isDropTarget ? 'bg-indigo-50 ring-2 ring-indigo-300 ring-inset' : 'hover:bg-gray-50/50'
                        }`}
                        onDragOver={e => { if (draggingRef.current) { e.preventDefault(); setDropTarget(cellKey) } }}
                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null) }}
                        onDrop={e => { e.preventDefault(); onDrop(date, dayPart) }}
                      >
                        {/* Existing slot pills */}
                        {slots.map(slot => (
                          <SlotPill
                            key={slot._id}
                            slot={slot}
                            onDragStart={() => onDragStart(slot)}
                            onDragEnd={() => { draggingRef.current = null; setDropTarget(null) }}
                            onClick={() => { setSelectedSlot(slot); setActionMsg(null) }}
                          />
                        ))}

                        {/* Add button (always shown for future cells) */}
                        {!past && (
                          <button
                            type="button"
                            onClick={() => setAddCell({ date, dayPart })}
                            className="self-start text-[10px] text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 px-1.5 py-0.5 rounded transition-colors"
                          >
                            + agregar
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
        {Object.entries(STATUS_LABELS).filter(([k]) => k !== 'empty').map(([k, label]) => (
          <span key={k} className={`px-2 py-0.5 rounded ${STATUS_COLORS[k]}`}>{label}</span>
        ))}
      </div>

      {/* Slot Detail Modal */}
      {selectedSlot && (
        <SlotDetailModal
          slot={selectedSlot}
          onClose={() => { setSelectedSlot(null); setActionMsg(null) }}
          onPublishNow={() => handlePublishNow(selectedSlot)}
          onReschedule={(d, dp) => handleReschedule(selectedSlot, d, dp)}
          onToggleLock={() => { setLocked({ id: selectedSlot._id, locked: !selectedSlot.locked }); setSelectedSlot(null) }}
          onUnassign={() => handleUnassign(selectedSlot)}
          onDelete={() => handleDelete(selectedSlot)}
          actionMsg={actionMsg}
        />
      )}

      {/* Add Slot Modal */}
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
    </div>
  )
}

// ── SlotPill ─────────────────────────────────────────────────────────────────

function SlotPill({
  slot,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slot: any
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const draggable = !slot.locked && !['published', 'publishing'].includes(slot.status)
  const colorClass = STATUS_COLORS[slot.status] ?? STATUS_COLORS.planned

  return (
    <div
      draggable={draggable}
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={draggable ? 'Arrastra para mover · clic para editar' : 'Clic para editar'}
      className={`rounded-md px-2 py-1.5 text-xs cursor-pointer select-none transition-all ${colorClass} ${
        draggable ? 'hover:brightness-95 active:opacity-70' : 'cursor-default'
      }`}
      style={{ opacity: draggable ? 1 : 0.85 }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {slot.locked && <span title="Bloqueado">🔒</span>}
        <span className={`px-1 py-0 rounded text-[10px] font-medium ${
          (TYPE_COLORS[slot.item?.contentType] ?? 'bg-gray-100 text-gray-600')
        }`}>
          {slot.item?.contentType ?? '—'}
        </span>
        {slot.contentMode === 'recycled' && (
          <span className="text-[10px] bg-amber-100 text-amber-600 px-1 rounded">♻</span>
        )}
      </div>
      <p className="font-medium leading-snug line-clamp-2">
        {slot.item?.title ?? <span className="italic text-gray-400">Sin contenido</span>}
      </p>
      <p className="text-[10px] mt-0.5 opacity-70">{STATUS_LABELS[slot.status] ?? slot.status}</p>
    </div>
  )
}

// ── SlotDetailModal ───────────────────────────────────────────────────────────

function SlotDetailModal({
  slot, onClose, onPublishNow, onReschedule, onToggleLock, onUnassign, onDelete, actionMsg,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slot: any
  onClose: () => void
  onPublishNow: () => void
  onReschedule: (date: string, dayPart: DayPart) => void
  onToggleLock: () => void
  onUnassign: () => void
  onDelete: () => void
  actionMsg: string | null
}) {
  const [newDate,    setNewDate]    = useState<string>(slot.scheduledFor)
  const [newDayPart, setNewDayPart] = useState<DayPart>(slot.dayPart)
  const [publishing, setPublishing] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const canPublishNow = slot.contentItemId && !['published', 'publishing'].includes(slot.status)
  const canReschedule = !slot.locked && !['publishing', 'published'].includes(slot.status)
  const dateChanged   = newDate !== slot.scheduledFor || newDayPart !== slot.dayPart

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {slot.scheduledFor} · {DAY_PART_LABELS[slot.dayPart as DayPart]}
              <span className="text-xs text-gray-400 ml-1">{DAY_PART_HOURS[slot.dayPart as DayPart]}</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Canal: {slot.channel === 'tumblr' ? 'Tumblr' : 'X'}
              {slot.locked && <span className="ml-2 text-amber-600">🔒 Bloqueado</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          {slot.item ? (
            <>
              <p className="text-sm font-medium text-gray-900">{slot.item.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 capitalize">{slot.item.contentType}</p>
              <div className="flex gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[slot.status] ?? ''}`}>
                  {STATUS_LABELS[slot.status] ?? slot.status}
                </span>
                {slot.contentMode === 'recycled' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">♻ Reciclado</span>
                )}
              </div>
              {slot.item._id && (
                <Link href={`/catalog/${slot.item._id}`} className="text-xs text-indigo-600 hover:underline mt-1 block" onClick={onClose}>
                  Abrir en editor →
                </Link>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">Sin contenido asignado</p>
          )}
        </div>

        {/* Reschedule */}
        {canReschedule && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-700 mb-2">Reprogramar</p>
            <div className="flex gap-2">
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm text-gray-900 bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <select value={newDayPart} onChange={e => setNewDayPart(e.target.value as DayPart)}
                className="px-2 py-1.5 text-sm text-gray-900 bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300">
                {DAY_PARTS.map(dp => <option key={dp} value={dp}>{DAY_PART_LABELS[dp]}</option>)}
              </select>
            </div>
            {dateChanged && (
              <button type="button" onClick={() => onReschedule(newDate, newDayPart)}
                className="mt-2 w-full px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                Confirmar cambio de fecha
              </button>
            )}
          </div>
        )}

        {/* Feedback */}
        {actionMsg && (
          <div className={`mb-3 px-3 py-2 rounded text-xs border ${actionMsg.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
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

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {canPublishNow && (
            <button type="button" disabled={publishing}
              onClick={async () => { setPublishing(true); await onPublishNow(); setPublishing(false) }}
              className="w-full px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
              {publishing ? 'Publicando…' : 'Publicar ahora'}
            </button>
          )}

          <button type="button" onClick={onToggleLock}
            className="w-full px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
            {slot.locked ? '🔓 Desbloquear' : '🔒 Bloquear slot'}
          </button>

          {slot.contentItemId && !slot.locked && !['published', 'publishing'].includes(slot.status) && (
            <button type="button" onClick={onUnassign}
              className="w-full px-4 py-2 text-sm border border-amber-200 text-amber-700 rounded-md hover:bg-amber-50">
              Desasignar contenido (dejar slot vacío)
            </button>
          )}

          {!slot.locked && !['published', 'publishing'].includes(slot.status) && (
            showDelete ? (
              <div className="flex gap-2">
                <button type="button" onClick={onDelete}
                  className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700">
                  Confirmar eliminación
                </button>
                <button type="button" onClick={() => setShowDelete(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowDelete(true)}
                className="w-full px-4 py-2 text-sm border border-red-200 text-red-600 rounded-md hover:bg-red-50">
                Eliminar slot
              </button>
            )
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
          <p><span className="font-medium">Franja:</span> {DAY_PART_LABELS[dayPart]} <span className="text-gray-400">{DAY_PART_HOURS[dayPart]}</span></p>
          <p><span className="font-medium">Canal:</span> {channel === 'tumblr' ? 'Tumblr' : 'X'}</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          El slot se creará vacío. Usa "Generar calendario" para asignarle contenido, o asígnalo manualmente desde el editor.
        </p>
        {actionMsg && (
          <div className={`mb-3 px-3 py-2 rounded text-xs border ${actionMsg.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
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
