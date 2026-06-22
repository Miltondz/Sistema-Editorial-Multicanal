'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { ComicResult, Confidence, InclusionType } from '@/lib/comicsResearch.types'

// ── Date helpers ──────────────────────────────────────────────────────────────

const SHORT_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getWeekRange(): { from: string; to: string } {
  const today = new Date()
  const dow = today.getDay()
  const daysToMon = dow === 0 ? 6 : dow - 1
  const mon = new Date(today); mon.setDate(today.getDate() - daysToMon)
  const sun = new Date(mon);   sun.setDate(mon.getDate() + 6)
  return { from: isoDate(mon), to: isoDate(sun) }
}

function getMonthRange(): { from: string; to: string } {
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { from: isoDate(first), to: isoDate(last) }
}

function formatDateRange(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [, tm, td]   = to.split('-').map(Number)
  if (fm === tm) return `${fd} - ${td} ${SHORT_MONTHS[fm-1]} ${fy}`
  return `${fd} ${SHORT_MONTHS[fm-1]} - ${td} ${SHORT_MONTHS[tm-1]} ${fy}`
}

// ── Color maps ────────────────────────────────────────────────────────────────

const DIVERSITY_COLORS: Record<string, string> = {
  black:          'bg-[#1a1a2e] text-white',
  latinx:         'bg-yellow-600 text-white',
  asian:          'bg-red-600 text-white',
  indigenous:     'bg-green-800 text-white',
  middle_eastern: 'bg-emerald-700 text-white',
  lgbtq:          'bg-purple-600 text-white',
  transgender:    'bg-[#55CDFC] text-[#5B5EA6]',
  disability:     'bg-blue-700 text-white',
  women:          'bg-pink-500 text-white',
  nonbinary:      'bg-yellow-300 text-purple-800',
  multiracial:    'bg-orange-400 text-white',
  jewish:         'bg-blue-800 text-white',
  muslim:         'bg-green-600 text-white',
  international:  'bg-indigo-600 text-white',
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high:   'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  low:    'bg-red-100 text-red-700',
}

const INCLUSION_STYLE: Record<InclusionType, string> = {
  protagonist_diversity: 'bg-violet-100 text-violet-700',
  character_diversity:   'bg-blue-100 text-blue-700',
  writer_diversity:      'bg-emerald-100 text-emerald-700',
  artist_diversity:      'bg-teal-100 text-teal-700',
  cover_diversity:       'bg-orange-100 text-orange-700',
  lgbtq_representation:  'bg-pink-100 text-pink-700',
}

const SESSION_STATUS_STYLE: Record<string, string> = {
  running: 'animate-pulse bg-blue-100 text-blue-700',
  done:    'bg-green-100 text-green-700',
  error:   'bg-red-100 text-red-700',
}

const PUBLISHERS = ['Marvel', 'DC', 'Image', 'Dark Horse', 'BOOM! Studios', 'IDW']

const CHAR_TAGS: Array<{ id: string; label: string }> = [
  { id: 'black',      label: 'Black / African-American' },
  { id: 'latino',     label: 'Latino / Latinx' },
  { id: 'asian',      label: 'Asian' },
  { id: 'indigenous', label: 'Indigenous' },
  { id: 'arab',       label: 'Arab / Middle Eastern' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function DiversityChip({ tag }: { tag: string }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${DIVERSITY_COLORS[tag] ?? 'bg-slate-200 text-slate-700'}`}>
      {tag}
    </span>
  )
}

function CoverImage({ url, alt, title }: { url?: string; alt?: string; title: string }) {
  const [failed, setFailed] = useState(false)
  const initials = title.split(' ').slice(0, 2).map(w => w[0] ?? '?').join('').toUpperCase()
  return (
    <div className="w-16 rounded-lg overflow-hidden flex items-center justify-center bg-slate-800 shrink-0" style={{ height: 96 }}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt ?? title} className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-white text-sm font-bold opacity-50">{initials}</span>
      )}
    </div>
  )
}

function ComicCard({ item, onToggle }: { item: any; onToggle: () => void }) {
  const r = item.itemJson as ComicResult

  const allTags = Array.from(new Set([
    ...(r.characters ?? []).flatMap(c => c.diversity_tags ?? []),
    ...(r.creators?.writers ?? []).flatMap(w => w.diversity_tags ?? []),
    ...(r.creators?.artists ?? []).flatMap(a => a.diversity_tags ?? []),
    ...(r.creators?.cover_artists ?? []).flatMap(a => a.diversity_tags ?? []),
  ]))

  const primaryReason = r.inclusion_reasons?.[0]
  const secondaryReason = r.inclusion_reasons?.[1]
  const coverImages = (r.images ?? []).filter(i => i.url && i.url.startsWith('https://')).slice(0, 2)
  const issueLink = r.verification_links?.primary_issue_page

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex gap-3">
        {/* Covers */}
        <div className="flex gap-1.5 shrink-0">
          {coverImages.length > 0
            ? coverImages.map((img, i) => (
                <CoverImage key={i} url={img.url} alt={r.title} title={r.title} />
              ))
            : <CoverImage title={r.title} />
          }
        </div>

        {/* Metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{r.title}</p>
              {r.issue && <p className="text-[11px] text-gray-400">#{r.issue}</p>}
            </div>
            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${CONFIDENCE_STYLE[r.confidence] ?? CONFIDENCE_STYLE.low}`}>
              {r.confidence}
            </span>
          </div>
          <p className="text-xs text-gray-500">{r.publisher}{r.release_date ? ` · ${r.release_date}` : ''}</p>

          {/* Inclusion reasons */}
          {(primaryReason || secondaryReason) && (
            <div className="mt-2 space-y-1">
              {[primaryReason, secondaryReason].filter(Boolean).map((reason, i) => reason && (
                <div key={i} className="flex items-start gap-1.5">
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${INCLUSION_STYLE[reason.type as InclusionType] ?? 'bg-slate-100 text-slate-500'}`}>
                    {reason.type.replace(/_/g, ' ')}
                  </span>
                  <p className="text-[10px] text-gray-600 leading-tight line-clamp-2">{reason.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Diversity tags */}
      {allTags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {allTags.slice(0, 8).map(tag => <DiversityChip key={tag} tag={tag} />)}
          {allTags.length > 8 && <span className="text-[9px] text-slate-400">+{allTags.length - 8}</span>}
        </div>
      )}

      {/* Creators */}
      {(r.creators?.writers?.length > 0 || r.creators?.artists?.length > 0) && (
        <div className="text-[10px] text-gray-500 space-y-0.5">
          {r.creators.writers.length > 0 && (
            <p><span className="font-semibold text-gray-700">Guión:</span> {r.creators.writers.map(w => w.name).join(', ')}</p>
          )}
          {r.creators.artists.length > 0 && (
            <p><span className="font-semibold text-gray-700">Arte:</span> {r.creators.artists.map(a => a.name).join(', ')}</p>
          )}
        </div>
      )}

      {/* Characters */}
      {r.characters?.filter(c => c.category === 'protagonist' || c.category === 'main_cast').length > 0 && (
        <div className="text-[10px] text-gray-500">
          <span className="font-semibold text-gray-700">Personajes:</span>{' '}
          {r.characters.filter(c => c.category === 'protagonist' || c.category === 'main_cast').map(c => c.name).join(', ')}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        {issueLink ? (
          <a href={issueLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-500 hover:text-indigo-700">
            Ver fuente →
          </a>
        ) : <span />}
        <button
          type="button"
          onClick={onToggle}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            item.saved
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {item.saved ? '★' : '☆'} {item.saved ? 'Guardado' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function SessionCard({
  session, active, onClick, onDelete, confirmId, setConfirmId,
}: {
  session: any; active: boolean; onClick: () => void
  onDelete: (id: string) => void | Promise<void>; confirmId: string | null; setConfirmId: (id: string | null) => void
}) {
  const delTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmId !== session._id) {
      if (delTimerRef.current) clearTimeout(delTimerRef.current)
      setConfirmId(session._id)
      delTimerRef.current = setTimeout(() => setConfirmId(null), 4000)
      return
    }
    if (delTimerRef.current) clearTimeout(delTimerRef.current)
    setConfirmId(null)
    onDelete(session._id)
  }

  useEffect(() => () => { if (delTimerRef.current) clearTimeout(delTimerRef.current) }, [])

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
        active ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{session.sessionName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${SESSION_STATUS_STYLE[session.status] ?? 'bg-slate-100 text-slate-500'}`}>
            {session.status}
          </span>
          <span className="text-[10px] text-gray-400">{session.resultCount} resultados</span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        className={`ml-3 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${
          confirmId === session._id ? 'bg-red-600 text-white' : 'bg-red-50 text-red-500 hover:bg-red-100'
        }`}
      >
        {confirmId === session._id ? '¿Eliminar?' : '✕'}
      </button>
    </div>
  )
}

type CharVolume = { id: number; name: string; year?: string; publisher?: string; coverUrl?: string; siteUrl?: string; issueCount?: number }
type CharGroup  = { character: string; tags: string[]; deck?: string; realName?: string; firstAppearance?: string; powers?: string[]; volumes: CharVolume[] }

function CharacterGroupCard({ group }: { group: CharGroup }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-4">
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900">{group.character}</p>
            {group.realName && <span className="text-[10px] text-gray-400">({group.realName})</span>}
            <div className="flex gap-1">
              {group.tags.map(t => <DiversityChip key={t} tag={t === 'latino' ? 'latinx' : t === 'arab' ? 'middle_eastern' : t} />)}
            </div>
          </div>
          {group.deck && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{group.deck}</p>}
          {(group.powers?.length || group.firstAppearance) && (
            <div className="flex gap-3 mt-1 flex-wrap">
              {group.firstAppearance && <span className="text-[10px] text-indigo-400">1st: {group.firstAppearance}</span>}
              {group.powers?.length && <span className="text-[10px] text-emerald-500">{group.powers.join(' · ')}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {group.volumes.map(vol => (
          <a
            key={vol.id}
            href={vol.siteUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 w-28 flex flex-col gap-1.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-28 h-36 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
              {vol.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vol.coverUrl} alt={vol.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-400 text-xs text-center px-1">{vol.name.slice(0, 20)}</span>
              )}
            </div>
            <p className="text-[10px] font-semibold text-gray-800 line-clamp-2 leading-tight">{vol.name}</p>
            <p className="text-[9px] text-gray-400">{vol.year}{vol.publisher ? ` · ${vol.publisher}` : ''}</p>
            {vol.issueCount !== undefined && (
              <p className="text-[9px] text-indigo-500">{vol.issueCount} issues</p>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'results' | 'saved' | 'history'
type DateMode = 'week' | 'month' | 'custom'
type SearchMode = 'ai' | 'character'

export default function ResearchPage() {
  const initialWeek = getWeekRange()

  // State
  const [tab,                setTab]               = useState<Tab>('results')
  const [searchMode,         setSearchMode]         = useState<SearchMode>('ai')
  const [currentSessionId,   setCurrentSessionId]  = useState<string | null>(null)
  const [searching,          setSearching]          = useState(false)
  const [searchError,        setSearchError]        = useState<string | null>(null)
  const [dateMode,           setDateMode]           = useState<DateMode>('week')
  const [dateFrom,           setDateFrom]           = useState(initialWeek.from)
  const [dateTo,             setDateTo]             = useState(initialWeek.to)
  const [maxResults,         setMaxResults]         = useState(15)
  const [selectedPublishers, setSelectedPublishers] = useState<string[]>([])
  const [minConfidence,      setMinConfidence]      = useState('')
  const [requireImages,      setRequireImages]      = useState(false)
  const [confirmDelId,       setConfirmDelId]       = useState<string | null>(null)
  // AI mode diversity tags (fed into Perplexity as character context)
  const [aiDiversityTags, setAiDiversityTags] = useState<string[]>(['black', 'latino', 'asian'])
  // Character-first mode
  const [selectedTags,    setSelectedTags]    = useState<string[]>(['black', 'latino'])
  const [charDateFrom,    setCharDateFrom]    = useState<string>('')
  const [charDateTo,      setCharDateTo]      = useState<string>('')
  const [charResults,     setCharResults]     = useState<CharGroup[]>([])
  const [charMaxResults,  setCharMaxResults]  = useState(30)

  // Convex hooks
  const sessions   = useQuery((api.comicsResearch as any).listSessions, {})
  const savedItems = useQuery((api.comicsResearch as any).listSavedItems, {})
  const sessionDoc  = useQuery(
    (api.comicsResearch as any).getSession,
    currentSessionId ? { id: currentSessionId as any } : 'skip'
  )
  const sessionItems = useQuery(
    (api.comicsResearch as any).getSessionItems,
    currentSessionId ? { sessionId: currentSessionId as any } : 'skip'
  )
  const toggleSaved              = useMutation((api.comicsResearch as any).toggleSaved)
  const deleteSession            = useMutation((api.comicsResearch as any).deleteSession)
  const runSearch                = useAction((api.actions.comicsResearch as any).runSearch)
  const searchByDiverseCharacters = useAction((api.actions.comicsResearch as any).searchByDiverseCharacters)

  function applyDateMode(mode: DateMode) {
    setDateMode(mode)
    if (mode === 'week') {
      const r = getWeekRange(); setDateFrom(r.from); setDateTo(r.to)
    } else if (mode === 'month') {
      const r = getMonthRange(); setDateFrom(r.from); setDateTo(r.to)
    }
  }

  function togglePublisher(pub: string) {
    setSelectedPublishers(prev =>
      prev.includes(pub) ? prev.filter(p => p !== pub) : [...prev, pub]
    )
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  async function handleCharacterSearch() {
    if (!selectedTags.length) return
    setSearching(true)
    setSearchError(null)
    setCharResults([])
    try {
      const results = await searchByDiverseCharacters({
        diversityTags: selectedTags,
        dateFrom:      charDateFrom || undefined,
        dateTo:        charDateTo   || undefined,
        maxResults:    charMaxResults,
      }) as CharGroup[]
      setCharResults(results)
      setTab('results')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  async function handleSearch() {
    setSearching(true)
    setSearchError(null)
    try {
      const r = await runSearch({
        dateMode:      dateMode === 'custom' ? 'absolute' : 'relative_resolved',
        dateFrom,
        dateTo,
        maxResults,
        publishers:    selectedPublishers.length ? selectedPublishers : undefined,
        minConfidence: minConfidence || undefined,
        requireImages,
        diversityTags: aiDiversityTags.length ? aiDiversityTags : undefined,
      }) as any
      setCurrentSessionId(r.sessionId)
      setTab('results')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  async function handleDeleteSession(id: string) {
    await deleteSession({ id: id as any })
    if (currentSessionId === id) setCurrentSessionId(null)
  }

  const items    = (sessionItems as any[]) ?? []
  const saved    = (savedItems  as any[]) ?? []
  const sessions_ = (sessions  as any[]) ?? []
  const isLoading = sessionDoc?.status === 'running' || (currentSessionId && sessionItems === undefined)

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Research</h1>
        <p className="text-sm text-gray-500 mt-0.5">Descubre cómics con representación diversa.</p>
      </div>

      {/* ── Search form ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E5EAF2] p-5 mb-6">

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-5">
          <button type="button" onClick={() => setSearchMode('ai')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${searchMode === 'ai' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            ✦ AI (Perplexity)
          </button>
          <button type="button" onClick={() => setSearchMode('character')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${searchMode === 'character' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            ◈ Personajes (Wikipedia + CV)
          </button>
        </div>

        {searchMode === 'ai' ? (
          <>
            {/* Date mode */}
            <div className="flex gap-2 mb-4">
              {(['week', 'month', 'custom'] as DateMode[]).map(m => (
                <button key={m} type="button" onClick={() => applyDateMode(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    dateMode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {m === 'week' ? 'Esta semana' : m === 'month' ? 'Este mes' : 'Personalizado'}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-400 self-center">{formatDateRange(dateFrom, dateTo)}</span>
            </div>

            {dateMode === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-4 mb-4 items-end">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Resultados</p>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {[10, 15, 20].map(n => (
                    <button key={n} type="button" onClick={() => setMaxResults(n)}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors ${maxResults === n ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Confianza mínima</label>
                <select value={minConfidence} onChange={e => setMinConfidence(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Cualquiera</option>
                  <option value="medium">Medio+</option>
                  <option value="high">Solo alto</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={requireImages} onChange={e => setRequireImages(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500" />
                <span className="text-xs font-medium text-gray-600">Solo con imágenes</span>
              </label>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-1.5">Publishers</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setSelectedPublishers([])}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    selectedPublishers.length === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  Todos
                </button>
                {PUBLISHERS.map(pub => (
                  <button key={pub} type="button" onClick={() => togglePublisher(pub)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                      selectedPublishers.includes(pub) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {pub}
                  </button>
                ))}
              </div>
            </div>

            {/* Diversity tags feed Wikipedia character list into Perplexity prompt */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-1.5">Diversidad (guía la búsqueda)</p>
              <div className="flex flex-wrap gap-1.5">
                {CHAR_TAGS.map(({ id, label }) => (
                  <button key={id} type="button"
                    onClick={() => setAiDiversityTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                      aiDiversityTags.includes(id) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Los personajes de Wikipedia de estos grupos guiarán a Perplexity</p>
            </div>

            {searchError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {searchError}
              </div>
            )}

            <button type="button" onClick={handleSearch} disabled={searching}
              className="w-full py-2.5 bg-[#0B1220] hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              {searching ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
                </svg>Buscando con Perplexity…</>
              ) : <><span className="text-indigo-400">✦</span> Buscar con Perplexity</>}
            </button>
          </>
        ) : (
          <>
            {/* Character-first form */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Grupos de diversidad</p>
              <div className="flex flex-wrap gap-2">
                {CHAR_TAGS.map(({ id, label }) => (
                  <button key={id} type="button" onClick={() => toggleTag(id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      selectedTags.includes(id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha desde</label>
                <input type="date" value={charDateFrom} onChange={e => setCharDateFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha hasta</label>
                <input type="date" value={charDateTo} onChange={e => setCharDateTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-1.5">Máx. personajes</p>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
                {[20, 30, 50].map(n => (
                  <button key={n} type="button" onClick={() => setCharMaxResults(n)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${charMaxResults === n ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {searchError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {searchError}
              </div>
            )}

            <button type="button" onClick={handleCharacterSearch} disabled={searching || !selectedTags.length}
              className="w-full py-2.5 bg-[#0B1220] hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              {searching ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
                </svg>Buscando en Wikipedia + Comic Vine…</>
              ) : <><span className="text-indigo-400">◈</span> Buscar personajes diversos</>}
            </button>
          </>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5 w-fit">
        {(['results', 'saved', 'history'] as Tab[]).map(t => {
          const count = t === 'results' ? items.length : t === 'saved' ? saved.length : sessions_.length
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'results' ? 'Resultados' : t === 'saved' ? 'Guardados' : 'Historial'}
              {count > 0 && (
                <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Results tab ──────────────────────────────────────────────────── */}
      {tab === 'results' && (
        searchMode === 'character' ? (
          searching ? (
            <div className="space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-[#E5EAF2] p-4 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
                  <div className="flex gap-2">
                    {[1,2,3].map(j => <div key={j} className="w-28 h-36 bg-slate-100 rounded-lg shrink-0" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : charResults.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                <span className="text-indigo-400 text-xl">◈</span>
              </div>
              <p className="text-gray-500 text-sm font-medium">Selecciona grupos y busca</p>
              <p className="text-gray-300 text-xs mt-1">Wikipedia + Comic Vine buscará personajes y sus series</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">{charResults.length} personajes con series encontradas</p>
              {charResults.map(group => (
                <CharacterGroupCard key={group.character} group={group} />
              ))}
            </div>
          )
        ) : (
          !currentSessionId ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                <span className="text-indigo-400 text-xl">✦</span>
              </div>
              <p className="text-gray-500 text-sm font-medium">Configura una búsqueda arriba</p>
              <p className="text-gray-300 text-xs mt-1">Los resultados aparecerán aquí</p>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-[#E5EAF2] p-4 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-16 h-24 bg-slate-100 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-100 rounded w-3/4" />
                      <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                      <div className="h-2 bg-slate-100 rounded w-full" />
                      <div className="h-2 bg-slate-100 rounded w-4/5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">Sin resultados para este período y filtros.</p>
              <p className="text-gray-300 text-xs mt-1">Prueba con fechas más amplias o baja la confianza mínima.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item: any) => (
                <ComicCard
                  key={item._id}
                  item={item}
                  onToggle={() => toggleSaved({ id: item._id as any })}
                />
              ))}
            </div>
          )
        )
      )}

      {/* ── Saved tab ────────────────────────────────────────────────────── */}
      {tab === 'saved' && (
        saved.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">Sin items guardados aún.</p>
            <p className="text-gray-300 text-xs mt-1">Marca ☆ en cualquier resultado para guardarlo aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {saved.map((item: any) => (
              <ComicCard
                key={item._id}
                item={item}
                onToggle={() => toggleSaved({ id: item._id as any })}
              />
            ))}
          </div>
        )
      )}

      {/* ── History tab ──────────────────────────────────────────────────── */}
      {tab === 'history' && (
        sessions_.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">Sin búsquedas previas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions_.map((s: any) => (
              <SessionCard
                key={s._id}
                session={s}
                active={currentSessionId === s._id}
                onClick={() => { setCurrentSessionId(s._id); setTab('results') }}
                onDelete={handleDeleteSession}
                confirmId={confirmDelId}
                setConfirmId={setConfirmDelId}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}
