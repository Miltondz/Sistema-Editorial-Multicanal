'use client'
import type { ContentType, ContentStatus, ContentOrigin, SourcePlatform } from '@/lib/types/domain'

export interface FilterState {
  search: string
  status: ContentStatus | ''
  contentType: ContentType | ''
  contentOrigin: ContentOrigin | ''
  sourcePlatform: SourcePlatform | ''
  enrichedManually: boolean | undefined
  needsReview: boolean | undefined
}

interface CatalogFiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
}

const STATUS_OPTIONS: { value: ContentStatus | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'draft', label: 'Borrador' },
  { value: 'researching', label: 'Investigando' },
  { value: 'in_review', label: 'En revisión' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'published', label: 'Publicado' },
  { value: 'archived', label: 'Archivado' },
  { value: 'blocked', label: 'Bloqueado' },
]

const TYPE_OPTIONS: { value: ContentType | ''; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'comic', label: 'Cómic' },
  { value: 'libro', label: 'Libro' },
  { value: 'autor', label: 'Autor/a' },
  { value: 'cosplay', label: 'Cosplay' },
  { value: 'articulo', label: 'Artículo' },
  { value: 'poster', label: 'Poster' },
  { value: 'pelicula', label: 'Película' },
  { value: 'personaje', label: 'Personaje' },
  { value: 'coleccion', label: 'Colección' },
]

const ORIGIN_OPTIONS: { value: ContentOrigin | ''; label: string }[] = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'manual', label: 'Manual' },
  { value: 'assisted', label: 'Asistido IA' },
  { value: 'imported', label: 'Importado' },
]

const PLATFORM_OPTIONS: { value: SourcePlatform | ''; label: string }[] = [
  { value: '', label: 'Todas las plataformas' },
  { value: 'tumblr', label: 'Tumblr' },
  { value: 'x', label: 'X / Twitter' },
]

export function CatalogFilters({ filters, onChange }: CatalogFiltersProps) {
  function update(partial: Partial<FilterState>) {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <input
          type="search"
          placeholder="Buscar por título..."
          value={filters.search}
          onChange={e => update({ search: e.target.value })}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Status */}
      <select
        value={filters.status}
        onChange={e => update({ status: e.target.value as ContentStatus | '' })}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Content type */}
      <select
        value={filters.contentType}
        onChange={e => update({ contentType: e.target.value as ContentType | '' })}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Origin */}
      <select
        value={filters.contentOrigin}
        onChange={e => {
          const val = e.target.value as ContentOrigin | ''
          update({ contentOrigin: val, sourcePlatform: '' })
        }}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {ORIGIN_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Source platform — only relevant when origin=imported */}
      {filters.contentOrigin === 'imported' && (
        <select
          value={filters.sourcePlatform}
          onChange={e => update({ sourcePlatform: e.target.value as SourcePlatform | '' })}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {PLATFORM_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {/* Enriched toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.enrichedManually === true}
          onChange={e => update({ enrichedManually: e.target.checked ? true : undefined })}
          className="rounded border-gray-300 text-indigo-600"
        />
        Solo curados
      </label>

      {/* Needs review toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.needsReview === true}
          onChange={e => update({ needsReview: e.target.checked ? true : undefined })}
          className="rounded border-gray-300 text-indigo-600"
        />
        Pendiente revisión
      </label>

      {/* Clear filters */}
      <button
        onClick={() =>
          onChange({
            search: '',
            status: '',
            contentType: '',
            contentOrigin: '',
            sourcePlatform: '',
            enrichedManually: undefined,
            needsReview: undefined,
          })
        }
        className="text-sm text-gray-500 hover:text-gray-700 underline"
      >
        Limpiar
      </button>
    </div>
  )
}
