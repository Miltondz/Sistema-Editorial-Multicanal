'use client'
import Link from 'next/link'
import { useQuery, useAction, useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { ContentEditor } from '@/components/editor/ContentEditor'
import type { Id } from '@/convex/_generated/dataModel'
import type { ContentItem, MediaAsset } from '@/lib/types/domain'
import { useState } from 'react'

export default function EditItemPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const data = useQuery(api.contentItems.getById, {
    id: params.id as Id<'contentItems'>,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteItem = useMutation((api.contentItems as any).deleteItem)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteItem({ id: params.id as any })
      router.push('/catalog')
    } catch { setDeleting(false); setConfirmDelete(false) }
  }

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coverImageUrl: string | undefined = (item as any).coverImageUrl

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/catalog" className="text-sm text-indigo-600 hover:text-indigo-800">
          ← Volver al catálogo
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          disabled={deleting}
          className={`text-xs px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50 ${
            confirmDelete
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
          }`}
        >
          {deleting ? 'Eliminando…' : confirmDelete ? '¿Confirmar eliminación?' : '✕ Eliminar ítem'}
        </button>
      </div>

      {/* Cover image panel */}
      {coverImageUrl && <CoverImagePanel itemId={params.id} coverImageUrl={coverImageUrl} />}

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

function CoverImagePanel({ itemId, coverImageUrl }: { itemId: string; coverImageUrl: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downloadAction = useAction((api.actions as any).importer.downloadCoverToStorage)

  const isStoredInConvex = coverImageUrl.includes('convex.cloud') || coverImageUrl.includes('convex.site')

  async function handleDownload() {
    setLoading(true); setError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await downloadAction({ contentItemId: itemId as any })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4 flex items-start gap-4">
      <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-50 flex items-center justify-center">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt="Cover"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-3xl">🖼️</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Imagen de portada</p>
        {isStoredInConvex ? (
          <p className="text-sm text-emerald-600 font-medium">✓ Almacenada en Convex storage</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 truncate mb-3">{coverImageUrl}</p>
            <p className="text-xs text-amber-600 mb-3">
              ⚠ Referencia externa — la imagen depende del CDN de Tumblr
            </p>
            {done ? (
              <p className="text-sm text-emerald-600 font-medium">✓ Imagen descargada y guardada</p>
            ) : (
              <button
                type="button"
                onClick={handleDownload}
                disabled={loading}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? '⏳ Descargando…' : '⬇ Guardar imagen a storage'}
              </button>
            )}
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </>
        )}
      </div>
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
