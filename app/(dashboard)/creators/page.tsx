'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import Pagination from '@/components/dashboard/Pagination'
import ImageUpload from '@/components/dashboard/ImageUpload'

const TAG_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  black:      { bg: '#1e293b', text: '#94a3b8', dot: '#94a3b8' },
  latino:     { bg: '#292524', text: '#fb923c', dot: '#fb923c' },
  asian:      { bg: '#1e2832', text: '#60a5fa', dot: '#60a5fa' },
  indigenous: { bg: '#1c2317', text: '#86efac', dot: '#86efac' },
  arab:       { bg: '#261e12', text: '#fbbf24', dot: '#fbbf24' },
}
const TAG_LABELS: Record<string, string> = {
  black: 'Black', latino: 'Latino', asian: 'Asian', indigenous: 'Indigenous', arab: 'Arab',
}
const ALL_TAGS  = ['black', 'latino', 'asian', 'indigenous', 'arab']
const ALL_ROLES = ['writer', 'artist', 'colorist', 'cover_artist', 'letterer', 'editor', 'creator']

type CreatorDoc = {
  _id: Id<'catalogCreators'>
  name: string; deck?: string; nationality?: string; birthYear?: number
  roles: string[]; diversityTags: string[]
  coverUrl?: string; cvUrl?: string; wikiUrl?: string
  aliases?: string[]; cvId?: number; cvEnrichedAt?: number
  storageId?: Id<'_storage'>; storageImageUrl?: string | null
  needsReview?: boolean
  sources: string[]; createdAt: number; updatedAt: number
  notableWorkCvIds?: number[]
}

// ── Form modal ────────────────────────────────────────────────────────────────

function CreatorForm({ initial, onClose, onSave }: {
  initial?: Partial<CreatorDoc>
  onClose: () => void
  onSave: (data: Omit<CreatorDoc, '_id' | 'sources' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const setImage   = useMutation(api.catalog.setCreatorImage)
  const clearImage = useMutation(api.catalog.clearCreatorImage)

  const [name,        setName]        = useState(initial?.name ?? '')
  const [deck,        setDeck]        = useState(initial?.deck ?? '')
  const [nationality, setNationality] = useState(initial?.nationality ?? '')
  const [birthYear,   setBirthYear]   = useState(initial?.birthYear?.toString() ?? '')
  const [coverUrl,    setCoverUrl]    = useState(initial?.coverUrl ?? '')
  const [cvUrl,       setCvUrl]       = useState(initial?.cvUrl ?? '')
  const [wikiUrl,     setWikiUrl]     = useState(initial?.wikiUrl ?? '')
  const [cvId,        setCvId]        = useState(initial?.cvId?.toString() ?? '')
  const [aliasesRaw,  setAliasesRaw]  = useState((initial?.aliases ?? []).join(', '))
  const [tags,        setTags]        = useState<string[]>(initial?.diversityTags ?? [])
  const [roles,       setRoles]       = useState<string[]>(initial?.roles ?? [])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }
  function toggleRole(r: string) {
    setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Nombre requerido')
    if (tags.length === 0) return setError('Selecciona al menos un tag')
    if (roles.length === 0) return setError('Selecciona al menos un rol')
    setSaving(true); setError(null)
    try {
      const by = birthYear.trim() ? parseInt(birthYear.trim()) : undefined
      await onSave({
        name:          name.trim(),
        deck:          deck.trim() || undefined,
        nationality:   nationality.trim() || undefined,
        birthYear:     by && !isNaN(by) ? by : undefined,
        coverUrl:      coverUrl.trim() || undefined,
        cvUrl:         cvUrl.trim() || undefined,
        wikiUrl:       wikiUrl.trim() || undefined,
        cvId:          cvId.trim() ? parseInt(cvId.trim()) : undefined,
        aliases:       aliasesRaw.trim() ? aliasesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
        diversityTags: tags,
        roles,
        cvEnrichedAt:  initial?.cvEnrichedAt,
        notableWorkCvIds: initial?.notableWorkCvIds,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e293b' }}>
          <h2 className="text-white font-semibold">{initial?._id ? 'Editar creador' : 'Nuevo creador'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Image upload — edit mode only */}
          {initial?._id && (
            <ImageUpload
              currentUrl={initial.storageImageUrl ?? initial.coverUrl}
              hasStorageImage={!!initial.storageId}
              onUploaded={sid => setImage({ id: initial._id!, storageId: sid })}
              onClear={initial.storageId ? () => clearImage({ id: initial._id! }) : undefined}
              label="Foto / imagen"
            />
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Tags de diversidad *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map(t => {
                const c = TAG_COLORS[t]
                return (
                  <button key={t} type="button" onClick={() => toggleTag(t)}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                    style={tags.includes(t)
                      ? { background: c.bg, color: c.text, outline: `2px solid ${c.dot}` }
                      : { background: '#1e293b', color: '#64748b' }
                    }
                  >
                    {TAG_LABELS[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Roles *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(r => (
                <button key={r} type="button" onClick={() => toggleRole(r)}
                  className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                  style={roles.includes(r)
                    ? { background: '#312e81', color: '#a5b4fc', outline: '2px solid #6366f1' }
                    : { background: '#1e293b', color: '#64748b' }
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <Field label="Nombre *" value={name} onChange={setName} />

          {/* Nationality / Birth year */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nacionalidad" value={nationality} onChange={setNationality} />
            <Field label="Año de nacimiento" value={birthYear} onChange={setBirthYear} placeholder="ej: 1963" />
          </div>

          {/* Deck */}
          <Field label="Descripción (deck)" value={deck} onChange={setDeck} textarea />

          {/* Aliases */}
          <Field label="Alias (separados por coma)" value={aliasesRaw} onChange={setAliasesRaw} />

          {/* URLs */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="CV ID" value={cvId} onChange={setCvId} placeholder="ej: 41500" />
            <Field label="Cover URL" value={coverUrl} onChange={setCoverUrl} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comic Vine URL" value={cvUrl} onChange={setCvUrl} />
            <Field label="Wikipedia URL" value={wikiUrl} onChange={setWikiUrl} />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#1e293b', color: '#94a3b8' }}
            >Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#6366f1', color: '#fff', opacity: saving ? 0.7 : 1 }}
            >{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; textarea?: boolean
}) {
  const cls = "w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
  const style = { background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className={cls} style={style} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} style={style} />
      }
    </div>
  )
}

// ── Creator card ──────────────────────────────────────────────────────────────

function CreatorCard({ creator, onEdit, onDelete, onMarkReviewed }: {
  creator: CreatorDoc
  onEdit: () => void
  onDelete: () => void
  onMarkReviewed: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="rounded-xl overflow-hidden flex flex-col group"
      style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
      {/* Photo */}
      <div className="relative flex-shrink-0" style={{ height: 140, background: '#1e293b', overflow: 'hidden' }}>
        <Link href={`/creators/${creator._id}`} className="block w-full h-full">
          {(creator.storageImageUrl ?? creator.coverUrl)
            ? <img src={creator.storageImageUrl ?? creator.coverUrl} alt={creator.name}
                className="w-full h-full object-cover object-top hover:scale-105 transition-transform"
                loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            : <div className="w-full h-full flex items-center justify-center hover:bg-slate-700 transition-colors">
                <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
          }
        </Link>
        {/* Tags */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 pointer-events-none">
          {creator.diversityTags.map(t => {
            const c = TAG_COLORS[t] ?? TAG_COLORS.black
            return (
              <span key={t} className="px-1.5 py-0.5 rounded text-xs font-medium"
                style={{ background: c.bg, color: c.text }}>{TAG_LABELS[t] ?? t}</span>
            )
          })}
        </div>
        {/* needsReview badge */}
        {creator.needsReview && (
          <div className="absolute top-2 left-2 pointer-events-none">
            <span className="px-1.5 py-0.5 rounded text-xs font-bold"
              style={{ background: '#92400e', color: '#fbbf24', fontSize: 10 }}>! revisar</span>
          </div>
        )}
        {/* Actions */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {creator.needsReview && (
            <button onClick={onMarkReviewed}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: '#92400e' }} title="Marcar como revisado">
              <svg className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          <button onClick={onEdit}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#334155' }} title="Editar">
            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {!confirmDelete
            ? <button onClick={() => setConfirmDelete(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: '#334155' }} title="Eliminar">
                <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            : <button onClick={onDelete}
                className="px-2 h-7 rounded-lg text-xs font-medium"
                style={{ background: '#dc2626', color: '#fff' }}>
                ¿Seguro?
              </button>
          }
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 space-y-1.5">
        <Link href={`/creators/${creator._id}`} className="hover:text-indigo-400 transition-colors">
          <h3 className="text-white font-semibold text-sm leading-tight">{creator.name}</h3>
        </Link>

        {/* Roles */}
        <div className="flex flex-wrap gap-1">
          {creator.roles.filter(r => r !== 'creator').slice(0, 3).map(r => (
            <span key={r} className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: '#312e81', color: '#a5b4fc', fontSize: 10 }}>
              {r}
            </span>
          ))}
        </div>

        {(creator.nationality || creator.birthYear) && (
          <p className="text-slate-500 text-xs">
            {[creator.nationality, creator.birthYear ? `b. ${creator.birthYear}` : ''].filter(Boolean).join(' · ')}
          </p>
        )}

        {creator.deck && (
          <p className="text-slate-400 leading-snug" style={{ fontSize: 11 }}>
            {creator.deck.slice(0, 80)}{creator.deck.length > 80 ? '…' : ''}
          </p>
        )}
      </div>

      {creator.cvUrl && (
        <div className="px-3 pb-3">
          <a href={creator.cvUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            Comic Vine →
          </a>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreatorsPage() {
  const [activeTag,       setActiveTag]       = useState('')
  const [activeRole,      setActiveRole]      = useState('')
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false)
  const [search,          setSearch]          = useState('')
  const [showForm,        setShowForm]        = useState(false)
  const [editTarget,      setEditTarget]      = useState<CreatorDoc | null>(null)
  const [page,            setPage]            = useState(1)
  const [pageSize,        setPageSize]        = useState(50)

  function resetPage() { setPage(1) }

  const createCreator     = useMutation(api.catalog.createCreator)
  const editCreator       = useMutation(api.catalog.editCreator)
  const deleteCreator     = useMutation(api.catalog.deleteCreator)
  const setCreatorImage   = useMutation(api.catalog.setCreatorImage)
  const clearCreatorImage = useMutation(api.catalog.clearCreatorImage)
  const markReviewed      = useMutation(api.catalog.markCreatorReviewed)

  const stats    = useQuery(api.catalog.getCatalogStats)
  const creators = useQuery(api.catalog.searchCreators, {
    diversityTags: activeTag ? [activeTag] : undefined,
    needsReview: onlyNeedsReview ? true : undefined,
    limit: 500,
  }) as CreatorDoc[] | undefined

  const filtered = useMemo(() => {
    if (!creators) return []
    let rows = creators
    if (activeRole) rows = rows.filter(c => c.roles.includes(activeRole))
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.nationality?.toLowerCase().includes(q) ||
        c.deck?.toLowerCase().includes(q)
      )
    }
    return rows
  }, [creators, activeRole, search])

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  async function handleCreate(data: Omit<CreatorDoc, '_id' | 'sources' | 'createdAt' | 'updatedAt'>) {
    await createCreator({
      name:          data.name,
      aliases:       data.aliases,
      roles:         data.roles,
      diversityTags: data.diversityTags,
      cvId:          data.cvId,
      cvUrl:         data.cvUrl,
      deck:          data.deck,
      nationality:   data.nationality,
      birthYear:     data.birthYear,
      coverUrl:      data.coverUrl,
      wikiUrl:       data.wikiUrl,
    })
  }

  async function handleEdit(data: Omit<CreatorDoc, '_id' | 'sources' | 'createdAt' | 'updatedAt'>) {
    if (!editTarget) return
    await editCreator({
      id:            editTarget._id,
      name:          data.name,
      aliases:       data.aliases,
      roles:         data.roles,
      diversityTags: data.diversityTags,
      cvId:          data.cvId,
      cvUrl:         data.cvUrl,
      deck:          data.deck,
      nationality:   data.nationality,
      birthYear:     data.birthYear,
      coverUrl:      data.coverUrl,
      wikiUrl:       data.wikiUrl,
    })
  }

  async function handleDelete(id: Id<'catalogCreators'>) {
    await deleteCreator({ id })
  }

  return (
    <div className="min-h-screen" style={{ background: '#F6F8FB' }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Creadores</h1>
            <p className="text-slate-500 text-sm mt-0.5">Escritores, artistas y otros talentos diversos del comic</p>
          </div>

          <div className="flex items-center gap-3">
            {stats && (
              <div className="flex gap-2">
                {[
                  { label: 'Total',    value: stats.creators.toLocaleString(),                       color: '#1e293b' },
                  { label: 'Con CV',   value: stats.creatorsEnriched.toLocaleString(),           color: '#6366f1' },
                  { label: 'Revisar',  value: (stats.creatorsNeedsReview ?? 0).toLocaleString(), color: '#d97706' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl px-3 py-2 text-center"
                    style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                    <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setEditTarget(null); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#6366f1', color: '#fff' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1" style={{ maxWidth: 280 }}>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Buscar…" value={search} onChange={e => { setSearch(e.target.value); resetPage() }}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#1e293b' }} />
          </div>

          {/* Tag filter */}
          <div className="flex gap-1.5">
            {['', ...ALL_TAGS].map(tag => (
              <button key={tag || 'all'} onClick={() => { setActiveTag(tag); resetPage() }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={activeTag === tag
                  ? { background: '#6366f1', color: '#fff' }
                  : { background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' }
                }
              >
                {tag ? (TAG_LABELS[tag] ?? tag) : 'Todos'}
              </button>
            ))}
          </div>

          {/* Role filter */}
          <select
            value={activeRole}
            onChange={e => { setActiveRole(e.target.value); resetPage() }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium outline-none"
            style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' }}
          >
            <option value="">Todos los roles</option>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <button onClick={() => { setOnlyNeedsReview(v => !v); resetPage() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={onlyNeedsReview
              ? { background: '#451a03', border: '1px solid #92400e', color: '#fbbf24' }
              : { background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' }
            }
          >
            {stats?.creatorsNeedsReview ? `! Revisar (${stats.creatorsNeedsReview})` : '! Revisar'}
          </button>

          {creators && (
            <span className="text-xs text-slate-400 ml-auto">{filtered.length.toLocaleString()} creadores</span>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="px-8 pb-8">
        {creators === undefined
          ? <div className="text-center py-20 text-slate-400 text-sm">Cargando…</div>
          : filtered.length === 0
            ? <div className="text-center py-20 text-slate-400 text-sm">Sin resultados</div>
            : (
              <>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  {paginated.map(c => (
                    <CreatorCard
                      key={c._id}
                      creator={c}
                      onEdit={() => { setEditTarget(c); setShowForm(true) }}
                      onDelete={() => handleDelete(c._id)}
                      onMarkReviewed={() => markReviewed({ id: c._id })}
                    />
                  ))}
                </div>
                <Pagination
                  total={filtered.length}
                  page={page}
                  pageSize={pageSize}
                  onPage={setPage}
                  onPageSize={s => { setPageSize(s); setPage(1) }}
                />
              </>
            )
        }
      </div>

      {showForm && (
        <CreatorForm
          initial={editTarget ?? undefined}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSave={editTarget ? handleEdit : handleCreate}
        />
      )}
    </div>
  )
}
