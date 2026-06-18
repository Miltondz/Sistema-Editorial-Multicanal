'use client'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ContentEditor } from '@/components/editor/ContentEditor'
import type { Id } from '@/convex/_generated/dataModel'
import type { ContentItem, MediaAsset } from '@/lib/types/domain'

export default function EditItemPage({ params }: { params: { id: string } }) {
  const data = useQuery(api.contentItems.getById, {
    id: params.id as Id<'contentItems'>,
  })

  if (data === undefined) {
    return (
      <div className="p-8">
        <div className="text-gray-400 text-sm">Cargando...</div>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="p-8">
        <p className="text-red-600">Ítem no encontrado.</p>
        <Link href="/catalog" className="text-sm text-indigo-600 mt-2 inline-block">
          ← Volver al catálogo
        </Link>
      </div>
    )
  }

  const { variants: _v, scores, ...item } = data
  const itemWithMedia = { ...item, media: data.media } as unknown as ContentItem & { media: MediaAsset[] }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/catalog" className="text-sm text-indigo-600 hover:text-indigo-800">
          ← Volver al catálogo
        </Link>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <ContentEditor
          mode="edit"
          initialItem={itemWithMedia}
        />
      </div>

      {/* Score breakdown */}
      {scores && scores.length > 0 && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Scores por canal
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(scores as any[]).map(s => (
              <div key={s._id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    s.channel === 'x' ? 'bg-gray-900 text-white' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {s.channel === 'x' ? 'X' : 'Tumblr'}
                  </span>
                  <span className="text-lg font-bold text-gray-900">
                    {s.reuseScore.toFixed(2)}
                    <span className="text-xs font-normal text-gray-500 ml-1">reuseScore</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  <ScoreRow label="Click"      value={s.clickScore} />
                  <ScoreRow label="Engagement" value={s.engagementScore} />
                  <ScoreRow label="Reblog"     value={s.reblogScore} />
                  <ScoreRow label="Evergreen"  value={s.evergreenScore} />
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                  <span>Posts: {s.postCount}</span>
                  {s.lastPostedAt && (
                    <span>Último: {new Date(s.lastPostedAt).toLocaleDateString('es-MX')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(Math.max(value * 100, 0), 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-indigo-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-700 w-10 text-right shrink-0">{value.toFixed(2)}</span>
    </div>
  )
}
