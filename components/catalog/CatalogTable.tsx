'use client'
import Link from 'next/link'
import { OriginBadge } from './OriginBadge'
import { DeleteBtn } from '@/components/ui/ActionBtn'
import type { ContentItem, ContentStatus } from '@/lib/types/domain'

const APPROVABLE: ContentStatus[] = ['draft', 'researching', 'in_review']

interface CatalogTableProps {
  items: ContentItem[]
  isLoading: boolean
  onLoadMore?: () => void
  canLoadMore?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleAll?: (checked: boolean) => void
  onApprove?: (id: string) => void
  onDelete?: (id: string) => void
}

const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Borrador',
  researching: 'Investigando',
  in_review: 'En revisión',
  approved: 'Aprobado',
  scheduled: 'Programado',
  published: 'Publicado',
  archived: 'Archivado',
  blocked: 'Bloqueado',
}

const STATUS_COLORS: Record<ContentStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  researching: 'bg-purple-100 text-purple-700',
  in_review: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-gray-100 text-gray-400',
  blocked: 'bg-red-100 text-red-700',
}

const TYPE_LABELS: Record<string, string> = {
  comic: 'Cómic',
  libro: 'Libro',
  autor: 'Autor/a',
  cosplay: 'Cosplay',
  articulo: 'Artículo',
  poster: 'Poster',
  pelicula: 'Película',
  personaje: 'Personaje',
  coleccion: 'Colección',
}


export function CatalogTable({
  items, isLoading, onLoadMore, canLoadMore,
  selectedIds, onToggleSelect, onToggleAll, onApprove, onDelete,
}: CatalogTableProps) {
  const hasCheckboxes = Boolean(onToggleSelect)
  const allSelected = items.length > 0 && selectedIds != null && items.every(i => selectedIds.has(i._id as string))
  const someSelected = selectedIds != null && selectedIds.size > 0

  if (isLoading && items.length === 0) {
    return <div className="text-center py-12 text-gray-400">Cargando...</div>
  }

  if (!isLoading && items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No se encontraron ítems. <Link href="/catalog/new" className="text-indigo-600 underline">Crear el primero</Link>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {hasCheckboxes && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={e => onToggleAll?.(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origen</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridad</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revisión</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {items.map(item => {
              const id = item._id as string
              const checked = selectedIds?.has(id) ?? false
              return (
                <tr
                  key={id}
                  className={`hover:bg-gray-50 transition-colors ${checked ? 'bg-indigo-50' : ''}`}
                >
                  {hasCheckboxes && (
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSelect?.(id)}
                        className="rounded border-gray-300 text-indigo-600"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {(item as any).coverImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(item as any).coverImageUrl}
                          alt=""
                          className="w-10 h-10 rounded object-cover shrink-0 border border-gray-200"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                        {item.franchise && <div className="text-xs text-gray-400">{item.franchise}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{TYPE_LABELS[item.contentType] ?? item.contentType}</td>
                  <td className="px-4 py-3">
                    <OriginBadge
                      contentOrigin={item.contentOrigin}
                      sourcePlatform={item.sourcePlatform}
                      enrichedManually={item.enrichedManually}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.editorialPriority}/5</td>
                  <td className="px-4 py-3">
                    {item.needsReview && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        ⚠ Revisar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onApprove && APPROVABLE.includes(item.status) && (
                        <button
                          onClick={() => onApprove(id)}
                          className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                        >
                          Aprobar
                        </button>
                      )}
                      <Link href={`/catalog/${id}`} className="text-sm text-indigo-600 hover:text-indigo-900 font-medium">
                        Editar
                      </Link>
                      {onDelete && (
                        <DeleteBtn onDelete={() => onDelete(id)} label="Eliminar" />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canLoadMore && (
        <div className="text-center mt-4">
          <button
            onClick={onLoadMore}
            className="px-4 py-2 text-sm text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50"
          >
            Cargar más
          </button>
        </div>
      )}
    </div>
  )
}
