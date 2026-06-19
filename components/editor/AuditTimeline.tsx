'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState } from 'react'

const EVENT_ICONS: Record<string, string> = {
  'item.created':        '✦',
  'item.enriched':       '📝',
  'item.updated':        '✏',
  'item.status_changed': '→',
  'item.approved':       '✓',
  'item.archived':       '📁',
  'item.deleted':        '✕',
  'item.published_direct': '🚀',
}

const EVENT_COLORS: Record<string, string> = {
  'item.approved':       'text-green-600',
  'item.published_direct': 'text-indigo-600',
  'item.deleted':        'text-red-500',
  'item.archived':       'text-gray-500',
}

function formatEventType(e: string): string {
  return e.replace('item.', '').replace(/_/g, ' ')
}

export function AuditTimeline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [open, setOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = useQuery((api.auditEvents as any).listByEntity, open ? { entityType, entityId, limit: 50 } : 'skip')

  return (
    <div className="mt-6 bg-white rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Historial de auditoría</h2>
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-5 pb-5">
          {events === undefined ? (
            <p className="text-xs text-gray-400 py-4 text-center">Cargando…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Sin eventos de auditoría.</p>
          ) : (
            <div className="relative border-l-2 border-gray-100 ml-3 space-y-0">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(events as any[]).map((e: any) => (
                <div key={e._id} className="relative pl-5 pb-4 last:pb-0">
                  <span className={`absolute -left-[9px] top-0.5 text-sm ${EVENT_COLORS[e.eventType] ?? 'text-gray-400'}`}>
                    {EVENT_ICONS[e.eventType] ?? '·'}
                  </span>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-xs font-medium ${EVENT_COLORS[e.eventType] ?? 'text-gray-700'}`}>
                      {formatEventType(e.eventType)}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(e._creationTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  {e.payloadJson && Object.keys(e.payloadJson).length > 0 && (
                    <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                      {JSON.stringify(e.payloadJson).slice(0, 120)}
                      {JSON.stringify(e.payloadJson).length > 120 ? '…' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
