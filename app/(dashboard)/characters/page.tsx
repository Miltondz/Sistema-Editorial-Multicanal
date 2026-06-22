'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import Pagination from '@/components/dashboard/Pagination'

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
const ALL_TAGS = ['black', 'latino', 'asian', 'indigenous', 'arab']

type CharDoc = {
  _id: Id<'catalogCharacters'>
  name: string; realName?: string; publisher?: string; deck?: string
  diversityTags: string[]; powers?: string[]; coverUrl?: string
  cvUrl?: string; firstAppearance?: string; aliases?: string[]
  cvId?: number; wikiUrl?: string; cvEnrichedAt?: number
  mantleId?: string; versionType?: string; universe?: string; legacyIndex?: number
  sources: string[]; createdAt: number; updatedAt: number
}

// ── Form modal (create / edit) ────────────────────────────────────────────────

function CharacterForm({
  initial, onClose, onSave,
}: {
  initial?: Partial<CharDoc>
  onClose: () => void
  onSave: (data: Omit<CharDoc, '_id' | 'sources' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const [name,            setName]            = useState(initial?.name ?? '')
  const [realName,        setRealName]        = useState(initial?.realName ?? '')
  const [publisher,       setPublisher]       = useState(initial?.publisher ?? '')
  const [deck,            setDeck]            = useState(initial?.deck ?? '')
  const [firstAppearance, setFirstAppearance] = useState(initial?.firstAppearance ?? '')
  const [coverUrl,        setCoverUrl]        = useState(initial?.coverUrl ?? '')
  const [cvUrl,           setCvUrl]           = useState(initial?.cvUrl ?? '')
  const [wikiUrl,         setWikiUrl]         = useState(initial?.wikiUrl ?? '')
  const [cvId,            setCvId]            = useState(initial?.cvId?.toString() ?? '')
  const [powersRaw,       setPowersRaw]       = useState((initial?.powers ?? []).join(', '))
  const [aliasesRaw,      setAliasesRaw]      = useState((initial?.aliases ?? []).join(', '))
  const [tags,            setTags]            = useState<string[]>(initial?.diversityTags ?? [])
  const [mantleId,        setMantleId]        = useState(initial?.mantleId ?? '')
  const [versionType,     setVersionType]     = useState(initial?.versionType ?? '')
  const [universe,        setUniverse]        = useState(initial?.universe ?? '')
  const [legacyIndex,     setLegacyIndex]     = useState(initial?.legacyIndex?.toString() ?? '')
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Nombre requerido')
    if (tags.length === 0) return setError('Selecciona al menos un tag')
    setSaving(true); setError(null)
    try {
      await onSave({
        name:            name.trim(),
        realName:        realName.trim() || undefined,
        publisher:       publisher.trim() || undefined,
        deck:            deck.trim() || undefined,
        firstAppearance: firstAppearance.trim() || undefined,
        coverUrl:        coverUrl.trim() || undefined,
        cvUrl:           cvUrl.trim() || undefined,
        wikiUrl:         wikiUrl.trim() || undefined,
        cvId:            cvId.trim() ? parseInt(cvId.trim()) : undefined,
        powers:          powersRaw.trim() ? powersRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        aliases:         aliasesRaw.trim() ? aliasesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
        diversityTags:   tags,
        mantleId:        mantleId.trim() || undefined,
        versionType:     versionType || undefined,
        universe:        universe.trim() || undefined,
        legacyIndex:     legacyIndex.trim() ? parseInt(legacyIndex.trim()) : undefined,
        cvEnrichedAt:    initial?.cvEnrichedAt,
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
          <h2 className="text-white font-semibold">{initial?._id ? 'Editar personaje' : 'Nuevo personaje'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
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

          {/* Name / Real name */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *" value={name} onChange={setName} />
            <Field label="Nombre real" value={realName} onChange={setRealName} />
          </div>

          {/* Publisher / First appearance */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Publisher" value={publisher} onChange={setPublisher} />
            <Field label="Primera aparición" value={firstAppearance} onChange={setFirstAppearance} placeholder="Ej: Black Panther #1" />
          </div>

          {/* Deck */}
          <Field label="Descripción (deck)" value={deck} onChange={setDeck} textarea />

          {/* Powers */}
          <Field label="Poderes (separados por coma)" value={powersRaw} onChange={setPowersRaw} placeholder="Ej: Flight, Super strength, Telepathy" />

          {/* Aliases */}
          <Field label="Alias (separados por coma)" value={aliasesRaw} onChange={setAliasesRaw} />

          {/* Mantle / version */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manto (mantleId)" value={mantleId} onChange={setMantleId} placeholder="ej: Batman, Robin, Superman" />
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de versión</label>
              <select value={versionType} onChange={e => setVersionType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white"
                style={{ background: '#1e293b', border: '1px solid #334155' }}
              >
                <option value="">— ninguno —</option>
                <option value="original">Original (primer portador)</option>
                <option value="legacy">Legado (sucesor generacional)</option>
                <option value="alternate_universe">Universo alterno</option>
                <option value="future">Versión futura</option>
                <option value="what_if">What If / Elseworlds</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Universo / Tierra" value={universe} onChange={setUniverse} placeholder="ej: Earth-616, Flashpoint, New 52" />
            <Field label="Índice de legado" value={legacyIndex} onChange={setLegacyIndex} placeholder="1 = primero, 2 = segundo…" />
          </div>

          {/* URLs */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="CV ID" value={cvId} onChange={setCvId} placeholder="ej: 1477" />
            <Field label="Cover URL" value={coverUrl} onChange={setCoverUrl} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comic Vine URL" value={cvUrl} onChange={setCvUrl} />
            <Field label="Wikipedia URL" value={wikiUrl} onChange={setWikiUrl} />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: '#1e293b', color: '#94a3b8' }}
            >
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: '#6366f1', color: '#fff', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
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
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            rows={3} className={cls} style={style} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            className={cls} style={style} />
      }
    </div>
  )
}

// ── Character card ────────────────────────────────────────────────────────────

function CharacterCard({ char, onEdit, onDelete }: {
  char: CharDoc
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="rounded-xl overflow-hidden flex flex-col group"
      style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
      {/* Cover area — image links to detail, action buttons float over */}
      <div className="relative flex-shrink-0" style={{ height: 160 }}>
        <Link href={`/characters/${char._id}`} className="block w-full h-full" style={{ background: '#1e293b' }}>
          {char.coverUrl
            ? <img src={char.coverUrl} alt={char.name}
                className="w-full h-full object-cover transition-transform hover:scale-105"
                loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            : <div className="w-full h-full flex items-center justify-center hover:bg-slate-700 transition-colors">
                <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
          }
        </Link>
        {/* Tags overlay */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 pointer-events-none">
          {char.diversityTags.map(t => {
            const c = TAG_COLORS[t] ?? TAG_COLORS.black
            return (
              <span key={t} className="px-1.5 py-0.5 rounded text-xs font-medium"
                style={{ background: c.bg, color: c.text }}>{TAG_LABELS[t] ?? t}</span>
            )
          })}
        </div>
        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: '#334155' }} title="Editar">
            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {!confirmDelete
            ? <button onClick={() => setConfirmDelete(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
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
        <div>
          <h3 className="text-white font-semibold text-sm leading-tight truncate">{char.name}</h3>
          {char.realName && <p className="text-slate-400 text-xs truncate mt-0.5">{char.realName}</p>}
        </div>
        {char.publisher && <p className="text-slate-500 text-xs truncate">{char.publisher}</p>}
        {char.powers && char.powers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {char.powers.slice(0, 3).map(p => (
              <span key={p} className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#0f2040', color: '#60a5fa', fontSize: 10 }}>
                {p}
              </span>
            ))}
            {char.powers.length > 3 && <span className="text-slate-600" style={{ fontSize: 10 }}>+{char.powers.length - 3}</span>}
          </div>
        )}
        {char.firstAppearance && (
          <p className="text-slate-600 truncate" style={{ fontSize: 10 }}>1st: {char.firstAppearance}</p>
        )}
      </div>

      {/* Footer */}
      {char.cvUrl && (
        <div className="px-3 pb-3">
          <a href={char.cvUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            Comic Vine →
          </a>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CharactersPage() {
  const [activeTag,    setActiveTag]    = useState('')
  const [enrichedOnly, setEnriched]    = useState(false)
  const [search,       setSearch]      = useState('')
  const [showForm,     setShowForm]    = useState(false)
  const [editTarget,   setEditTarget]  = useState<CharDoc | null>(null)
  const [page,         setPage]        = useState(1)
  const [pageSize,     setPageSize]    = useState(50)

  function resetPage() { setPage(1) }

  const createChar = useMutation(api.catalog.createCharacter)
  const editChar   = useMutation(api.catalog.editCharacter)
  const deleteChar = useMutation(api.catalog.deleteCharacter)

  const stats = useQuery(api.catalog.getCatalogStats)
  const chars = useQuery(api.catalog.searchCharacters, {
    diversityTags: activeTag ? [activeTag] : undefined,
    enrichedOnly,
    limit: 2000,
  }) as CharDoc[] | undefined

  const filtered = useMemo(() => {
    if (!chars) return []
    if (!search.trim()) return chars
    const q = search.toLowerCase()
    return chars.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.realName?.toLowerCase().includes(q) ||
      c.publisher?.toLowerCase().includes(q) ||
      c.diversityTags.some(t => t.includes(q))
    )
  }, [chars, search])

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  async function handleCreate(data: Omit<CharDoc, '_id' | 'sources' | 'createdAt' | 'updatedAt'>) {
    await createChar({
      name:            data.name,
      aliases:         data.aliases,
      diversityTags:   data.diversityTags,
      cvId:            data.cvId,
      cvUrl:           data.cvUrl,
      deck:            data.deck,
      realName:        data.realName,
      publisher:       data.publisher,
      powers:          data.powers,
      firstAppearance: data.firstAppearance,
      coverUrl:        data.coverUrl,
      wikiUrl:         data.wikiUrl,
    })
  }

  async function handleEdit(data: Omit<CharDoc, '_id' | 'sources' | 'createdAt' | 'updatedAt'>) {
    if (!editTarget) return
    await editChar({
      id:              editTarget._id,
      name:            data.name,
      aliases:         data.aliases,
      diversityTags:   data.diversityTags,
      cvId:            data.cvId,
      cvUrl:           data.cvUrl,
      deck:            data.deck,
      realName:        data.realName,
      publisher:       data.publisher,
      powers:          data.powers,
      firstAppearance: data.firstAppearance,
      coverUrl:        data.coverUrl,
      wikiUrl:         data.wikiUrl,
    })
  }

  async function handleDelete(id: Id<'catalogCharacters'>) {
    await deleteChar({ id })
  }

  return (
    <div className="min-h-screen" style={{ background: '#F6F8FB' }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Personajes</h1>
            <p className="text-slate-500 text-sm mt-0.5">Catálogo de personajes diversos con datos de Comic Vine</p>
          </div>

          <div className="flex items-center gap-3">
            {stats && (
              <div className="flex gap-2">
                {[
                  { label: 'Total',     value: stats.characters.toLocaleString(),          color: '#1e293b' },
                  { label: 'Con CV',    value: stats.charactersEnriched.toLocaleString(),  color: '#6366f1' },
                  { label: 'Completo',  value: `${Math.round((stats.charactersEnriched / Math.max(stats.characters, 1)) * 100)}%`, color: '#059669' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl px-3 py-2 text-center" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                    <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => { setEditTarget(null); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: '#6366f1', color: '#fff' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar
            </button>
          </div>
        </div>

        {/* Tag filter + search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1" style={{ maxWidth: 280 }}>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Buscar…" value={search} onChange={e => { setSearch(e.target.value); resetPage() }}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#1e293b' }} />
          </div>

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

          <button onClick={() => { setEnriched(v => !v); resetPage() }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={enrichedOnly
              ? { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }
              : { background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' }
            }
          >
            Solo con datos CV
          </button>

          {chars && (
            <span className="text-xs text-slate-400 ml-auto">{filtered.length.toLocaleString()} personajes</span>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="px-8 pb-8">
        {chars === undefined
          ? <div className="text-center py-20 text-slate-400 text-sm">Cargando…</div>
          : filtered.length === 0
            ? <div className="text-center py-20 text-slate-400 text-sm">Sin resultados</div>
            : (
              <>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  {paginated.map(c => (
                    <CharacterCard
                      key={c._id}
                      char={c}
                      onEdit={() => { setEditTarget(c); setShowForm(true) }}
                      onDelete={() => handleDelete(c._id)}
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

      {/* Form modal */}
      {showForm && (
        <CharacterForm
          initial={editTarget ?? undefined}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSave={editTarget ? handleEdit : handleCreate}
        />
      )}
    </div>
  )
}
