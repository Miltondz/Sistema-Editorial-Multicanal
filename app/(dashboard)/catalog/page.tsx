'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { usePaginatedQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { CatalogTable } from '@/components/catalog/CatalogTable'
import { CatalogFilters, FilterState } from '@/components/catalog/CatalogFilters'
import type { ContentItem } from '@/lib/types/domain'

type BulkAction = 'approve' | 'evergreen_high' | 'evergreen_low' | 'priority_5' | 'mark_enriched' | 'delete'

const BULK_ACTIONS: { value: BulkAction; label: string; danger?: boolean }[] = [
  { value: 'approve',        label: 'Aprobar selección' },
  { value: 'evergreen_high', label: 'Evergreen: alto' },
  { value: 'evergreen_low',  label: 'Evergreen: bajo' },
  { value: 'priority_5',     label: 'Prioridad 5' },
  { value: 'mark_enriched',  label: 'Marcar enriquecido' },
  { value: 'delete',         label: 'Eliminar selección', danger: true },
]

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-400">Cargando catálogo…</div>}>
      <CatalogContent />
    </Suspense>
  )
}

function CatalogContent() {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<FilterState>({
    search:           searchParams.get('search') ?? '',
    status:           '',
    contentType:      '',
    contentOrigin:    '',
    sourcePlatform:   '',
    enrichedManually: undefined,
    needsReview:      undefined,
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult,  setBulkResult]  = useState<string | null>(null)

  const queryArgs = {
    search:           filters.search || undefined,
    status:           (filters.status || undefined) as any,
    contentType:      (filters.contentType || undefined) as any,
    contentOrigin:    (filters.contentOrigin || undefined) as any,
    sourcePlatform:   (filters.sourcePlatform || undefined) as any,
    enrichedManually: filters.enrichedManually,
    needsReview:      filters.needsReview,
  }

  const { results, status, loadMore } = usePaginatedQuery(
    api.contentItems.list,
    queryArgs,
    { initialNumItems: 25 }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkApprove = useMutation((api.contentItems as any).bulkApprove)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkUpdate  = useMutation((api.contentItems as any).bulkUpdate)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteItem  = useMutation((api.contentItems as any).deleteItem)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkDelete  = useMutation((api.contentItems as any).bulkDeleteItems)

  function handleToggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(results.map(i => i._id as string)))
    else setSelectedIds(new Set())
  }

  async function handleInlineApprove(id: string) {
    setBulkResult(null)
    try {
      const res = await bulkApprove({ ids: [id as any] })
      setBulkResult(res.approved === 1 ? 'Aprobado.' : 'No se pudo aprobar (estado inválido).')
    } catch (err) {
      setBulkResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleInlineDelete(id: string) {
    setBulkResult(null)
    try {
      await deleteItem({ id: id as any })
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
      setBulkResult('Ítem eliminado.')
    } catch (err) {
      setBulkResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleBulkAction(action: BulkAction) {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds) as any[]
    setBulkLoading(true)
    setBulkResult(null)
    try {
      if (action === 'approve') {
        const res = await bulkApprove({ ids })
        setBulkResult(`${res.approved} aprobados, ${res.skipped} sin cambio.`)
      } else if (action === 'evergreen_high') {
        const res = await bulkUpdate({ ids, patch: { evergreenClass: 'high' } })
        setBulkResult(`${res.updated} actualizados.`)
      } else if (action === 'evergreen_low') {
        const res = await bulkUpdate({ ids, patch: { evergreenClass: 'low' } })
        setBulkResult(`${res.updated} actualizados.`)
      } else if (action === 'priority_5') {
        const res = await bulkUpdate({ ids, patch: { editorialPriority: 5 } })
        setBulkResult(`${res.updated} actualizados.`)
      } else if (action === 'mark_enriched') {
        const res = await bulkUpdate({ ids, patch: { enrichedManually: true } })
        setBulkResult(`${res.updated} marcados como enriquecidos.`)
      } else if (action === 'delete') {
        const res = await bulkDelete({ ids })
        setBulkResult(`${res.deleted} ítems eliminados.${res.skipped > 0 ? ` (${res.skipped} no encontrados)` : ''}`)
      }
      setSelectedIds(new Set())
    } catch (err) {
      setBulkResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {results.length} ítems{status === 'CanLoadMore' ? ' (hay más)' : ''}
            {selectedIds.size > 0 && ` · ${selectedIds.size} seleccionados`}
          </p>
        </div>
        <Link
          href="/catalog/new"
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
        >
          + Nuevo ítem
        </Link>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm font-medium text-indigo-800 mr-2">
            {selectedIds.size} seleccionados:
          </span>
          {BULK_ACTIONS.map(a => (
            <button
              key={a.value}
              type="button"
              disabled={bulkLoading}
              onClick={() => handleBulkAction(a.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50 border ${
                a.danger
                  ? 'bg-white border-red-300 text-red-600 hover:bg-red-50'
                  : 'bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50'
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700"
          >
            Limpiar
          </button>
        </div>
      )}

      {/* Bulk result feedback */}
      {bulkResult && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          {bulkResult}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 mb-4 p-4">
        <CatalogFilters filters={filters} onChange={setFilters} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <CatalogTable
          items={results as unknown as ContentItem[]}
          isLoading={status === 'LoadingFirstPage'}
          onLoadMore={() => loadMore(25)}
          canLoadMore={status === 'CanLoadMore'}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleAll={handleToggleAll}
          onApprove={handleInlineApprove}
          onDelete={handleInlineDelete}
        />
      </div>
    </div>
  )
}
