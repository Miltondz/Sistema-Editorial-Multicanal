'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import ImageUpload from '@/components/dashboard/ImageUpload'

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  black:      { bg: '#1e293b', text: '#94a3b8' },
  latino:     { bg: '#292524', text: '#fb923c' },
  asian:      { bg: '#1e2832', text: '#60a5fa' },
  indigenous: { bg: '#1c2317', text: '#86efac' },
  arab:       { bg: '#261e12', text: '#fbbf24' },
  woman:      { bg: '#2d1b35', text: '#d8b4fe' },
}
const TAG_LABELS: Record<string, string> = {
  black: 'Black', latino: 'Latino', asian: 'Asian',
  indigenous: 'Indigenous', arab: 'Arab', woman: 'Woman',
}
const ROLE_LABELS: Record<string, string> = {
  writer: 'Escritor', artist: 'Artista', colorist: 'Colorista',
  cover_artist: 'Portadista', letterer: 'Letrista', editor: 'Editor', creator: 'Creador',
}

function EditForm({ creator, onClose }: {
  creator: NonNullable<ReturnType<typeof useQuery<typeof api.catalog.getCreatorById>>>
  onClose: () => void
}) {
  const editCreator = useMutation(api.catalog.editCreator)
  const setImage    = useMutation(api.catalog.setCreatorImage)
  const clearImage  = useMutation(api.catalog.clearCreatorImage)
  const markReviewed = useMutation(api.catalog.markCreatorReviewed)

  const c = creator as Record<string, unknown> & { _id: Id<'catalogCreators'> }
  const [name,        setName]        = useState((c.name as string) ?? '')
  const [deck,        setDeck]        = useState((c.deck as string) ?? '')
  const [nationality, setNationality] = useState((c.nationality as string) ?? '')
  const [birthYear,   setBirthYear]   = useState(c.birthYear ? String(c.birthYear) : '')
  const [coverUrl,    setCoverUrl]    = useState((c.coverUrl as string) ?? '')
  const [cvUrl,       setCvUrl]       = useState((c.cvUrl as string) ?? '')
  const [wikiUrl,     setWikiUrl]     = useState((c.wikiUrl as string) ?? '')
  const [cvId,        setCvId]        = useState(c.cvId ? String(c.cvId) : '')
  const [aliasesRaw,  setAliasesRaw]  = useState(((c.aliases as string[]) ?? []).join(', '))
  const [tags,        setTags]        = useState<string[]>((c.diversityTags as string[]) ?? [])
  const [roles,       setRoles]       = useState<string[]>((c.roles as string[]) ?? [])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const ALL_TAGS  = ['black', 'latino', 'asian', 'indigenous', 'arab', 'woman']
  const ALL_ROLES = ['writer', 'artist', 'colorist', 'cover_artist', 'letterer', 'editor', 'creator']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      await editCreator({
        id: c._id,
        name: name.trim(),
        deck: deck.trim() || undefined,
        nationality: nationality.trim() || undefined,
        birthYear: birthYear.trim() ? parseInt(birthYear) : undefined,
        coverUrl: coverUrl.trim() || undefined,
        cvUrl: cvUrl.trim() || undefined,
        wikiUrl: wikiUrl.trim() || undefined,
        cvId: cvId.trim() ? parseInt(cvId) : undefined,
        aliases: aliasesRaw.trim() ? aliasesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
        diversityTags: tags,
        roles,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const imgUrl = (c.storageImageUrl as string | null) ?? (c.coverUrl as string | undefined)
  const hasStorage = !!(c.storageId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e293b' }}>
          <h2 className="text-white font-semibold">Editar creador</h2>
          <div className="flex items-center gap-2">
            {(c.needsReview as boolean) && (
              <button type="button" onClick={() => markReviewed({ id: c._id })}
                className="px-3 py-1 rounded-lg text-xs font-medium"
                style={{ background: '#92400e', color: '#fbbf24' }}>
                ✓ Marcar revisado
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <ImageUpload
            currentUrl={imgUrl}
            hasStorageImage={hasStorage}
            onUploaded={sid => setImage({ id: c._id, storageId: sid })}
            onClear={hasStorage ? () => clearImage({ id: c._id }) : undefined}
            label="Foto / imagen"
          />

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Tags</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map(t => (
                <button key={t} type="button"
                  onClick={() => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                  className="px-3 py-1 rounded-lg text-xs font-medium"
                  style={tags.includes(t)
                    ? { background: TAG_COLORS[t]?.bg ?? '#1e293b', color: TAG_COLORS[t]?.text ?? '#fff', outline: `2px solid ${TAG_COLORS[t]?.text}` }
                    : { background: '#1e293b', color: '#64748b' }
                  }
                >{TAG_LABELS[t] ?? t}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Roles</label>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(r => (
                <button key={r} type="button"
                  onClick={() => setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                  className="px-3 py-1 rounded-lg text-xs font-medium"
                  style={roles.includes(r)
                    ? { background: '#312e81', color: '#a5b4fc', outline: '2px solid #6366f1' }
                    : { background: '#1e293b', color: '#64748b' }
                  }
                >{ROLE_LABELS[r] ?? r}</button>
              ))}
            </div>
          </div>

          {[
            { label: 'Nombre *', value: name, set: setName },
            { label: 'Nacionalidad', value: nationality, set: setNationality },
            { label: 'Año de nacimiento', value: birthYear, set: setBirthYear },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-medium text-slate-400 mb-1">{f.label}</label>
              <input type="text" value={f.value} onChange={e => f.set(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }} />
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Descripción</label>
            <textarea value={deck} onChange={e => setDeck(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Alias (separados por coma)</label>
            <input type="text" value={aliasesRaw} onChange={e => setAliasesRaw(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'CV ID', value: cvId, set: setCvId },
              { label: 'Cover URL', value: coverUrl, set: setCoverUrl },
              { label: 'Comic Vine URL', value: cvUrl, set: setCvUrl },
              { label: 'Wikipedia URL', value: wikiUrl, set: setWikiUrl },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-medium text-slate-400 mb-1">{f.label}</label>
                <input type="text" value={f.value} onChange={e => f.set(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }} />
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#1e293b', color: '#94a3b8' }}>Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#6366f1', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CreatorDetailPage() {
  const params   = useParams()
  const id       = params.id as Id<'catalogCreators'>
  const [editing, setEditing] = useState(false)

  const creator      = useQuery(api.catalog.getCreatorById, { id })
  const markReviewed = useMutation(api.catalog.markCreatorReviewed)

  if (creator === undefined) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a' }}>
      <p className="text-slate-400">Cargando…</p>
    </div>
  }
  if (creator === null) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a' }}>
      <p className="text-slate-400">Creador no encontrado.</p>
    </div>
  }

  const c = creator as typeof creator & { storageImageUrl?: string | null; needsReview?: boolean }
  const imageUrl = c.storageImageUrl ?? c.coverUrl

  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      {/* Back nav */}
      <div className="px-8 pt-6 pb-0 flex items-center gap-3">
        <Link href="/creators" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Creadores
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300 text-sm">{creator.name}</span>
      </div>

      <div className="px-8 py-6 grid grid-cols-[280px_1fr] gap-8 items-start">
        {/* ── Left sidebar ── */}
        <div className="space-y-4">
          {/* Photo */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#1e293b', aspectRatio: '3/4' }}>
            {imageUrl
              ? <img src={imageUrl} alt={creator.name}
                  className="w-full h-full object-cover object-top" />
              : <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-16 h-16 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
            }
          </div>

          {/* Image upload */}
          {/* ponytail: deferred — ImageUpload needs Id<'_storage'>, creator type is loose here */}

          {/* Quick meta */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: '#1e293b' }}>
            {/* Diversity tags */}
            {creator.diversityTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {creator.diversityTags.map(t => {
                  const col = TAG_COLORS[t] ?? { bg: '#1e293b', text: '#94a3b8' }
                  return (
                    <span key={t} className="px-2 py-1 rounded-lg text-xs font-medium"
                      style={{ background: col.bg, color: col.text }}>
                      {TAG_LABELS[t] ?? t}
                    </span>
                  )
                })}
              </div>
            )}

            {/* Roles */}
            {creator.roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {creator.roles.map(r => (
                  <span key={r} className="px-2 py-1 rounded-lg text-xs"
                    style={{ background: '#312e81', color: '#a5b4fc' }}>
                    {ROLE_LABELS[r] ?? r}
                  </span>
                ))}
              </div>
            )}

            {/* Meta rows */}
            {[
              creator.nationality && { label: 'Nacionalidad', value: creator.nationality },
              creator.birthYear   && { label: 'Nacimiento',   value: String(creator.birthYear) },
            ].filter(Boolean).map((row) => {
              const r = row as { label: string; value: string }
              return (
                <div key={r.label} className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{r.label}</span>
                  <span className="text-slate-200">{r.value}</span>
                </div>
              )
            })}

            {/* needsReview */}
            {c.needsReview && (
              <button onClick={() => markReviewed({ id })}
                className="w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                style={{ background: '#92400e', color: '#fbbf24' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Marcar como revisado
              </button>
            )}

            {/* Links */}
            <div className="space-y-1 pt-1">
              {creator.cvUrl && (
                <a href={creator.cvUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Comic Vine
                </a>
              )}
              {creator.wikiUrl && (
                <a href={creator.wikiUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Wikipedia
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{creator.name}</h1>
              {creator.aliases && creator.aliases.length > 0 && (
                <p className="text-slate-400 text-sm mt-1">
                  También conocido como: {creator.aliases.join(', ')}
                </p>
              )}
            </div>
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar
            </button>
          </div>

          {/* needsReview alert */}
          {c.needsReview && (
            <div className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: '#451a03', border: '1px solid #92400e' }}>
              <span className="text-xl">!</span>
              <div>
                <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>Este creador necesita revisión</p>
                <p className="text-xs text-amber-200 mt-0.5">
                  Los tags de diversidad pueden ser incorrectos o faltar contexto. Verifica y marca como revisado.
                </p>
              </div>
            </div>
          )}

          {/* Deck */}
          {creator.deck && (
            <div className="rounded-2xl p-5" style={{ background: '#1e293b' }}>
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Descripción</h2>
              <p className="text-slate-200 leading-relaxed">{creator.deck}</p>
            </div>
          )}

          {/* Notable works */}
          {creator.notableWorkCvIds && creator.notableWorkCvIds.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: '#1e293b' }}>
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Obras notables (CV IDs)</h2>
              <div className="flex flex-wrap gap-2">
                {creator.notableWorkCvIds.map(cvid => (
                  <a key={cvid}
                    href={`https://comicvine.gamespot.com/search/?q=${cvid}`}
                    target="_blank" rel="noopener noreferrer"
                    className="px-2 py-1 rounded text-xs font-mono"
                    style={{ background: '#0f172a', color: '#60a5fa' }}>
                    #{cvid}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Fuentes:</span>
            {creator.sources.map(s => (
              <span key={s} className="px-2 py-0.5 rounded"
                style={{ background: '#1e293b', color: '#64748b' }}>{s}</span>
            ))}
            {creator.cvEnrichedAt && (
              <span className="text-slate-700">
                · CV enriquecido {new Date(creator.cvEnrichedAt).toLocaleDateString('es')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <EditForm
          creator={creator as Parameters<typeof EditForm>[0]['creator']}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
