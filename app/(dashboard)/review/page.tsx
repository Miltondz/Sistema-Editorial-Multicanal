'use client'
import { usePaginatedQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  draft:       'Borrador',
  researching: 'Investigando',
  in_review:   'En revisión',
  approved:    'Aprobado',
  scheduled:   'Programado',
  published:   'Publicado',
  archived:    'Archivado',
  blocked:     'Bloqueado',
}

const STATUS_COLORS: Record<string, string> = {
  draft:       'bg-gray-100 text-gray-600',
  researching: 'bg-blue-100 text-blue-700',
  in_review:   'bg-yellow-100 text-yellow-700',
  approved:    'bg-green-100 text-green-700',
  scheduled:   'bg-purple-100 text-purple-700',
  published:   'bg-indigo-100 text-indigo-700',
  archived:    'bg-gray-100 text-gray-400',
  blocked:     'bg-red-100 text-red-700',
}

export default function ReviewPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.contentItems.listNeedsReview as any,
    {},
    { initialNumItems: 20 }
  )

  const approveItem = useMutation(api.contentItems.approve)
  const updateItem  = useMutation(api.contentItems.update)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cola de revisión</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ítems importados pendientes de revisión editorial
        </p>
      </div>

      {/* States */}
      {status === 'LoadingFirstPage' && (
        <div className="text-sm text-gray-400 py-8 text-center">Cargando…</div>
      )}

      {status !== 'LoadingFirstPage' && results.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-500 font-medium">No hay ítems en la cola de revisión</p>
          <p className="text-sm text-gray-400 mt-1">Los ítems importados aparecen aquí automáticamente</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(results as any[]).map((item: any) => (
            <ReviewCard
              key={item._id}
              item={item}
              onApprove={() => approveItem({ id: item._id })}
              onIgnore={() => updateItem({ id: item._id, patch: { needsReview: false } })}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {status === 'CanLoadMore' && (
        <div className="mt-6 text-center">
          <button
            onClick={() => loadMore(20)}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Cargar más
          </button>
        </div>
      )}
    </div>
  )
}

function ReviewCard({
  item,
  onApprove,
  onIgnore,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any
  onApprove: () => void
  onIgnore: () => void
}) {
  const canApprove = ['in_review', 'draft', 'researching'].includes(item.status)

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-4">
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              {item.contentType}
            </span>
            {item.sourcePlatform && (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {item.sourcePlatform === 'tumblr' ? 'Tumblr' : 'X'}
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
          </div>

          <h2 className="font-semibold text-gray-900 truncate">{item.title}</h2>

          {item.summary && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.summary}</p>
          )}

          <div className="flex flex-wrap gap-1 mt-2">
            {item.representationTags?.slice(0, 5).map((tag: string) => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
            {item.representationTags?.length > 5 && (
              <span className="text-xs text-gray-400">+{item.representationTags.length - 5}</span>
            )}
          </div>

          {item.sourcePostUrl && (
            <a
              href={item.sourcePostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline mt-1 block truncate"
            >
              {item.sourcePostUrl}
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <Link
            href={`/catalog/${item._id}`}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-center"
          >
            Editar
          </Link>
          {canApprove && (
            <button
              type="button"
              onClick={onApprove}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Aprobar
            </button>
          )}
          <button
            type="button"
            onClick={onIgnore}
            className="px-3 py-1.5 text-xs border border-gray-200 text-gray-500 rounded hover:bg-gray-50"
            title="Descartar de la cola de revisión sin aprobar"
          >
            Ignorar
          </button>
        </div>
      </div>
    </div>
  )
}
