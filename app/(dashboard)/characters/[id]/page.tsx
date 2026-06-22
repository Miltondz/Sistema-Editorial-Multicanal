'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
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
const ALL_TAGS = ['black', 'latino', 'asian', 'indigenous', 'arab']

// ── Inline edit form ──────────────────────────────────────────────────────────

function EditForm({ char, onClose, onSave }: {
  char: NonNullable<ReturnType<typeof useQuery<typeof api.catalog.getCharacterById>>>
  onClose: () => void
  onSave: (fields: Record<string, unknown>) => Promise<void>
}) {
  const [name,            setName]            = useState(char.name)
  const [realName,        setRealName]        = useState(char.realName ?? '')
  const [publisher,       setPublisher]       = useState(char.publisher ?? '')
  const [deck,            setDeck]            = useState(char.deck ?? '')
  const [firstAppearance, setFirstAppearance] = useState(char.firstAppearance ?? '')
  const [coverUrl,        setCoverUrl]        = useState(char.coverUrl ?? '')
  const [cvUrl,           setCvUrl]           = useState(char.cvUrl ?? '')
  const [wikiUrl,         setWikiUrl]         = useState(char.wikiUrl ?? '')
  const [cvId,            setCvId]            = useState(char.cvId?.toString() ?? '')
  const [powersRaw,       setPowersRaw]       = useState((char.powers ?? []).join(', '))
  const [aliasesRaw,      setAliasesRaw]      = useState((char.aliases ?? []).join(', '))
  const [tags,            setTags]            = useState<string[]>(char.diversityTags)
  const [mantleId,        setMantleId]        = useState((char as Record<string, unknown>).mantleId as string ?? '')
  const [versionType,     setVersionType]     = useState((char as Record<string, unknown>).versionType as string ?? '')
  const [universe,        setUniverse]        = useState((char as Record<string, unknown>).universe as string ?? '')
  const [legacyIndex,     setLegacyIndex]     = useState(((char as Record<string, unknown>).legacyIndex as number | undefined)?.toString() ?? '')
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
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const fieldCls = "w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
  const fieldStyle = { background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }

  function Field({ label, value, onChange, placeholder, textarea }: {
    label: string; value: string; onChange: (v: string) => void
    placeholder?: string; textarea?: boolean
  }) {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
        {textarea
          ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
              className={fieldCls} style={fieldStyle} />
          : <input type="text" value={value} onChange={e => onChange(e.target.value)}
              placeholder={placeholder} className={fieldCls} style={fieldStyle} />
        }
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e293b' }}>
          <h2 className="text-white font-semibold">Editar personaje</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Tags *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map(t => {
                const c = TAG_COLORS[t]
                return (
                  <button key={t} type="button" onClick={() => toggleTag(t)}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                    style={tags.includes(t)
                      ? { background: c.bg, color: c.text, outline: `2px solid ${c.dot}` }
                      : { background: '#1e293b', color: '#64748b' }
                    }>{TAG_LABELS[t]}</button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *" value={name} onChange={setName} />
            <Field label="Nombre real" value={realName} onChange={setRealName} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Publisher" value={publisher} onChange={setPublisher} />
            <Field label="Primera aparición" value={firstAppearance} onChange={setFirstAppearance} />
          </div>
          <Field label="Descripción (deck)" value={deck} onChange={setDeck} textarea />
          <Field label="Poderes (coma-separados)" value={powersRaw} onChange={setPowersRaw} />
          <Field label="Alias (coma-separados)" value={aliasesRaw} onChange={setAliasesRaw} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="CV ID" value={cvId} onChange={setCvId} placeholder="ej: 1477" />
            <Field label="Cover URL" value={coverUrl} onChange={setCoverUrl} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comic Vine URL" value={cvUrl} onChange={setCvUrl} />
            <Field label="Wikipedia URL" value={wikiUrl} onChange={setWikiUrl} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manto (mantleId)" value={mantleId} onChange={setMantleId} placeholder="ej: Batman, Robin" />
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de versión</label>
              <select value={versionType} onChange={e => setVersionType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white"
                style={{ background: '#1e293b', border: '1px solid #334155' }}>
                <option value="">— ninguno —</option>
                <option value="original">Original</option>
                <option value="legacy">Legado</option>
                <option value="alternate_universe">Universo alterno</option>
                <option value="future">Versión futura</option>
                <option value="what_if">What If / Elseworlds</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Universo / Tierra" value={universe} onChange={setUniverse} placeholder="ej: Earth-616, Flashpoint" />
            <Field label="Índice de legado" value={legacyIndex} onChange={setLegacyIndex} placeholder="1, 2, 3…" />
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

// ── Detail section helper ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CharacterDetailPage({ params }: { params: { id: string } }) {
  const router  = useRouter()
  const [showEdit,    setShowEdit]    = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  const char       = useQuery(api.catalog.getCharacterById, {
    id: params.id as Id<'catalogCharacters'>,
  })
  const charMantle = char as (typeof char & { mantleId?: string; versionType?: string; universe?: string; legacyIndex?: number }) | null | undefined
  const mantleVersions = useQuery(
    api.catalog.getCharactersByMantle,
    charMantle?.mantleId ? { mantleId: charMantle.mantleId } : 'skip',
  )
  const editChar    = useMutation(api.catalog.editCharacter)
  const deleteChar  = useMutation(api.catalog.deleteCharacter)
  const setImage    = useMutation(api.catalog.setCharacterImage)
  const clearImage  = useMutation(api.catalog.clearCharacterImage)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const charAny = char as any
  const charImageUrl: string | null | undefined = charAny?.storageImageUrl ?? char?.coverUrl
  const charHasStorage: boolean = !!charAny?.storageId

  async function handleSave(fields: Record<string, unknown>) {
    await editChar({ id: params.id as Id<'catalogCharacters'>, ...fields } as Parameters<typeof editChar>[0])
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteChar({ id: params.id as Id<'catalogCharacters'> })
      router.push('/characters')
    } catch { setDeleting(false) }
  }

  if (char === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F6F8FB' }}>
        <div className="text-slate-400 text-sm">Cargando…</div>
      </div>
    )
  }

  if (char === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F6F8FB' }}>
        <div className="text-center">
          <p className="text-slate-600 mb-3">Personaje no encontrado.</p>
          <Link href="/characters" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Volver al catálogo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#F6F8FB' }}>
      {/* Top bar */}
      <div className="px-8 pt-6 pb-4 flex items-center justify-between">
        <Link href="/characters"
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Personajes
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEdit(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#334155' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar
          </button>
          {!confirmDel
            ? <button onClick={() => setConfirmDel(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: '#fff', border: '1px solid #fecaca', color: '#dc2626' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar
              </button>
            : <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">¿Eliminar?</span>
                <button onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: '#dc2626', color: '#fff', opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' }}>
                  Cancelar
                </button>
              </div>
          }
        </div>
      </div>

      {/* Main layout */}
      <div className="px-8 pb-8 flex gap-6 items-start">
        {/* Left — cover + quick facts */}
        <div className="flex-shrink-0 space-y-4" style={{ width: 240 }}>
          {/* Cover */}
          <div className="rounded-2xl overflow-hidden" style={{ height: 320, background: '#0f172a' }}>
            {charImageUrl
              ? <img src={charImageUrl} alt={char.name}
                  className="w-full h-full object-cover object-top"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-16 h-16 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
            }
          </div>

          {/* Image upload */}
          <ImageUpload
            currentUrl={charImageUrl}
            hasStorageImage={charHasStorage}
            onUploaded={sid => setImage({ id: params.id as Id<'catalogCharacters'>, storageId: sid })}
            onClear={charHasStorage ? () => clearImage({ id: params.id as Id<'catalogCharacters'> }) : undefined}
          />

          {/* Quick meta */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            {char.publisher && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Publisher</p>
                <p className="text-sm font-medium text-slate-800">{char.publisher}</p>
              </div>
            )}
            {char.firstAppearance && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Primera aparición</p>
                <p className="text-sm font-medium text-slate-800">{char.firstAppearance}</p>
              </div>
            )}
            {char.cvId && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">CV ID</p>
                <p className="text-sm font-mono text-slate-600">{char.cvId}</p>
              </div>
            )}
            {charMantle?.mantleId && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Manto</p>
                <p className="text-sm font-medium text-slate-800">{charMantle.mantleId}</p>
                {charMantle.versionType && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs"
                    style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 10 }}>
                    {charMantle.versionType === 'original' ? 'Original'
                      : charMantle.versionType === 'legacy' ? `Legado${charMantle.legacyIndex ? ` #${charMantle.legacyIndex}` : ''}`
                      : charMantle.versionType === 'alternate_universe' ? 'Universo alterno'
                      : charMantle.versionType === 'future' ? 'Versión futura'
                      : 'What If'}
                  </span>
                )}
                {charMantle.universe && (
                  <p className="text-xs text-slate-500 mt-0.5">{charMantle.universe}</p>
                )}
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400 mb-1">Fuentes</p>
              <div className="flex flex-wrap gap-1">
                {char.sources.map(s => (
                  <span key={s} className="px-1.5 py-0.5 rounded text-xs"
                    style={{ background: '#f1f5f9', color: '#64748b', fontSize: 10 }}>{s}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              {char.cvUrl && (
                <a href={char.cvUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-600 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Comic Vine
                </a>
              )}
              {char.wikiUrl && (
                <a href={char.wikiUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Wikipedia
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Right — main info */}
        <div className="flex-1 space-y-4">
          {/* Name + tags */}
          <div>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">{char.name}</h1>
            {char.realName && (
              <p className="text-lg text-slate-500 mt-1">{char.realName}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {char.diversityTags.map(t => {
                const c = TAG_COLORS[t] ?? TAG_COLORS.black
                return (
                  <span key={t}
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{ background: c.bg, color: c.text }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block mr-1.5" style={{ background: c.dot }} />
                    {TAG_LABELS[t] ?? t}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Deck */}
          {char.deck && (
            <Section title="Descripción">
              <p className="text-slate-700 text-sm leading-relaxed">{char.deck}</p>
            </Section>
          )}

          {/* Powers */}
          {char.powers && char.powers.length > 0 && (
            <Section title={`Poderes (${char.powers.length})`}>
              <div className="flex flex-wrap gap-2">
                {char.powers.map(p => (
                  <span key={p}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe' }}>
                    {p}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Aliases */}
          {char.aliases && char.aliases.length > 0 && (
            <Section title="Alias">
              <div className="flex flex-wrap gap-2">
                {char.aliases.map(a => (
                  <span key={a} className="px-3 py-1.5 rounded-lg text-sm text-slate-600"
                    style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    {a}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Mantle versions */}
          {mantleVersions && mantleVersions.filter(v => v._id !== char._id).length > 0 && (
            <Section title={`Otras versiones del manto "${charMantle?.mantleId}"`}>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {mantleVersions
                  .filter(v => v._id !== char._id)
                  .sort((a, b) => {
                    const av = a as typeof a & { legacyIndex?: number; versionType?: string }
                    const bv = b as typeof b & { legacyIndex?: number; versionType?: string }
                    if (av.versionType === 'original') return -1
                    if (bv.versionType === 'original') return 1
                    return (av.legacyIndex ?? 99) - (bv.legacyIndex ?? 99)
                  })
                  .map(v => {
                    const vt = v as typeof v & { versionType?: string; universe?: string; legacyIndex?: number }
                    return (
                      <Link key={v._id} href={`/characters/${v._id}`}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:scale-105"
                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center"
                          style={{ background: '#e2e8f0' }}>
                          {v.coverUrl
                            ? <img src={v.coverUrl} alt={v.name} className="w-full h-full object-cover object-top"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            : <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                          }
                        </div>
                        <p className="text-xs font-medium text-slate-700 text-center leading-tight">{v.name}</p>
                        {vt.versionType && (
                          <span className="text-center" style={{ fontSize: 9, color: '#94a3b8' }}>
                            {vt.versionType === 'original' ? 'Original'
                              : vt.versionType === 'legacy' ? `Legado${vt.legacyIndex ? ` #${vt.legacyIndex}` : ''}`
                              : vt.versionType === 'alternate_universe' ? vt.universe ?? 'Alt. Universe'
                              : vt.versionType === 'future' ? 'Futuro'
                              : 'What If'}
                          </span>
                        )}
                      </Link>
                    )
                  })}
              </div>
            </Section>
          )}

          {/* Metadata */}
          <Section title="Metadatos">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div className="text-slate-400">Enriquecido CV</div>
              <div className="text-slate-700">
                {char.cvEnrichedAt
                  ? new Date(char.cvEnrichedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
                  : <span className="text-amber-500">Pendiente</span>
                }
              </div>
              <div className="text-slate-400">Creado</div>
              <div className="text-slate-700">
                {new Date(char.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="text-slate-400">Actualizado</div>
              <div className="text-slate-700">
                {new Date(char.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </Section>
        </div>
      </div>

      {showEdit && (
        <EditForm char={char} onClose={() => setShowEdit(false)} onSave={handleSave} />
      )}
    </div>
  )
}
