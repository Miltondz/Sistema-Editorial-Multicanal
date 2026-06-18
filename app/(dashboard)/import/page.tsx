'use client'
import { useQuery, useAction, useMutation, usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'
import { useRef, useState } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(ms: number) {
  const d = new Date(ms)
  const date = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const JOB_STATUS_CONFIG: Record<string, { label: string; dot: string; pill: string }> = {
  pending:   { label: 'Pendiente',    dot: 'bg-gray-400',              pill: 'bg-gray-100 text-gray-600' },
  running:   { label: 'En progreso',  dot: 'bg-blue-500 animate-pulse', pill: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completado',   dot: 'bg-emerald-500',            pill: 'bg-emerald-100 text-emerald-700' },
  partial:   { label: 'Parcial',      dot: 'bg-amber-500',              pill: 'bg-amber-100 text-amber-700' },
  failed:    { label: 'Fallido',      dot: 'bg-red-500',               pill: 'bg-red-100 text-red-700' },
}

const ITEM_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:       { label: 'Borrador',     cls: 'bg-gray-100 text-gray-500' },
  in_review:   { label: 'En revisión',  cls: 'bg-amber-100 text-amber-700' },
  approved:    { label: 'Aprobado',     cls: 'bg-emerald-100 text-emerald-700' },
  published:   { label: 'Publicado',    cls: 'bg-indigo-100 text-indigo-700' },
  researching: { label: 'Investigando', cls: 'bg-blue-100 text-blue-700' },
  archived:    { label: 'Archivado',    cls: 'bg-gray-100 text-gray-400' },
  blocked:     { label: 'Bloqueado',    cls: 'bg-red-100 text-red-700' },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs       = useQuery(api.importJobs.list as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active     = useQuery(api.importJobs.getActive as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastTumblr = useQuery(api.importJobs.getLastTumblrJob as any)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startTumblrImport  = useAction((api.actions as any).importer.startTumblrImport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getTumblrBlogInfo  = useAction((api.actions as any).importer.getTumblrBlogInfo)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processXExport     = useAction((api.actions as any).importer.processXExport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateUploadUrl  = useMutation(api.importJobs.generateUploadUrl as any)

  const [beforeDate, setBeforeDate] = useState(todayISO())
  const [afterDate,  setAfterDate]  = useState('')
  const [tumblrLoading, setTumblrLoading] = useState(false)
  const [tumblrError,   setTumblrError]   = useState<string | null>(null)
  const [xLoading,      setXLoading]      = useState(false)
  const [xError,        setXError]        = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [blogInfo, setBlogInfo]         = useState<{ totalPosts: number; newestTs?: number; oldestTs?: number } | null>(null)
  const [blogInfoLoading, setBlogInfoLoading] = useState(false)
  const [blogInfoError,   setBlogInfoError]   = useState<string | null>(null)

  async function handleFetchBlogInfo() {
    setBlogInfoLoading(true); setBlogInfoError(null)
    try {
      const info = await getTumblrBlogInfo({}) as { totalPosts: number; newestTs?: number; oldestTs?: number }
      setBlogInfo(info)
      if (info.oldestTs) {
        const d = new Date(info.oldestTs)
        setAfterDate(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`)
      }
    } catch (err) {
      setBlogInfoError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBlogInfoLoading(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isRunning      = (active as any)?.status === 'running'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastConfig     = (lastTumblr as any)?.configJson
  const lastCursorTs: number | undefined = lastConfig?.cursorTs
  const lastAfterTs:  number | undefined = lastConfig?.afterTs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastJobStatus: string | undefined = (lastTumblr as any)?.status
  const hasWatermark  = lastCursorTs !== undefined && lastCursorTs < Date.now() - 60_000
  const canContinue   = hasWatermark && !isRunning && lastJobStatus !== 'completed'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalImported = jobs ? (jobs as any[]).reduce((s: number, j: any) => s + (j.itemsImported ?? 0), 0) : 0

  async function handleTumblrImport(continueFromLast = false) {
    if (isRunning) return
    setTumblrLoading(true); setTumblrError(null)
    try {
      await startTumblrImport({
        beforeDate: continueFromLast ? undefined : (beforeDate || undefined),
        afterDate:  continueFromLast ? undefined : (afterDate  || undefined),
        continueFromLast,
      })
    } catch (err) {
      setTumblrError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setTumblrLoading(false)
    }
  }

  async function handleXFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || isRunning) return
    setXLoading(true); setXError(null)
    try {
      const uploadUrl = await generateUploadUrl({})
      const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/javascript' }, body: file })
      const { storageId } = await res.json()
      await processXExport({ storageId })
    } catch (err) {
      setXError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setXLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ── Hero header ── */}
      <div className="border-b border-slate-800 bg-slate-950">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-lg shadow-lg">
                  ⬇
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">Importador histórico</h1>
              </div>
              <p className="text-slate-400 text-sm">
                Descarga el historial de Tumblr y X al catálogo editorial · deduplicación automática
              </p>
            </div>
            {totalImported > 0 && (
              <div className="text-right shrink-0">
                <p className="text-3xl font-black text-white tabular-nums">{totalImported.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-0.5">posts importados</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Active job ── */}
        {isRunning && <ActiveJobCard job={active as any} />}

        {/* ── Import sources ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Tumblr card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            {/* Card header */}
            <div className="px-6 py-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl">
                  📷
                </div>
                <div>
                  <h2 className="font-bold text-white">Tumblr</h2>
                  <p className="text-xs text-slate-400 mt-0.5">OAuth · 20 posts/batch · corre en 2do plano</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Watermark / continue */}
              {hasWatermark && (
                <div className={`rounded-xl p-4 space-y-3 ${canContinue ? 'bg-indigo-500/10 border border-indigo-500/30' : 'bg-slate-800/60 border border-slate-700'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${canContinue ? 'text-indigo-400' : 'text-slate-500'}`}>
                        Marca de agua
                      </p>
                      <p className="text-sm font-semibold text-white">
                        Hasta {fmtDate(lastCursorTs!)}
                      </p>
                      {lastAfterTs && (
                        <p className="text-xs text-slate-400">límite inferior: {fmtDate(lastAfterTs)}</p>
                      )}
                      <p className="text-[11px] mt-1 text-slate-400">
                        {lastJobStatus === 'completed' ? '✓ Rango completado' : '⚡ Interrumpido · puede reanudarse'}
                      </p>
                    </div>
                    {canContinue && (
                      <button
                        type="button"
                        onClick={() => handleTumblrImport(true)}
                        disabled={tumblrLoading}
                        className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {tumblrLoading ? <><Spinner /> Iniciando</> : 'Continuar →'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Date range form */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Nuevo rango</p>
                  <button
                    type="button"
                    onClick={handleFetchBlogInfo}
                    disabled={blogInfoLoading || isRunning}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    {blogInfoLoading ? <><Spinner /> Consultando…</> : '📡 Consultar blog'}
                  </button>
                </div>

                {/* Blog info banner */}
                {blogInfo && (
                  <div className="rounded-xl bg-slate-800/70 border border-slate-700 px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Info del blog</span>
                      <span className="text-xs font-bold text-white">{blogInfo.totalPosts.toLocaleString()} posts totales</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {blogInfo.newestTs && (
                        <div>
                          <span className="text-slate-500">Más reciente</span>
                          <p className="text-slate-200 font-semibold">{fmtDate(blogInfo.newestTs)}</p>
                        </div>
                      )}
                      {blogInfo.oldestTs && (
                        <div>
                          <span className="text-slate-500">Más antiguo</span>
                          <p className="text-emerald-400 font-bold">{fmtDate(blogInfo.oldestTs)}</p>
                        </div>
                      )}
                    </div>
                    {blogInfo.oldestTs && (
                      <p className="text-[10px] text-slate-600">↑ "Desde" se completó automáticamente con la fecha del post más antiguo</p>
                    )}
                  </div>
                )}
                {blogInfoError && <ErrorBox message={blogInfoError} />}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Hasta</label>
                    <input
                      type="date"
                      value={beforeDate}
                      onChange={e => setBeforeDate(e.target.value)}
                      max={todayISO()}
                      disabled={isRunning || tumblrLoading}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Desde <span className="text-slate-600">(opcional)</span></label>
                    <input
                      type="date"
                      value={afterDate}
                      onChange={e => setAfterDate(e.target.value)}
                      max={beforeDate || todayISO()}
                      disabled={isRunning || tumblrLoading}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Range summary */}
                {(beforeDate || afterDate) && (
                  <p className="text-[11px] text-slate-500 bg-slate-800/50 rounded-lg px-3 py-2 leading-relaxed">
                    Posts{afterDate ? <> desde <strong className="text-slate-300">{fmtDate(new Date(afterDate + 'T00:00:00Z').getTime())}</strong></> : ' del inicio del blog'}
                    {beforeDate && <> hasta <strong className="text-slate-300">{fmtDate(new Date(beforeDate + 'T23:59:59Z').getTime())}</strong></>}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => handleTumblrImport(false)}
                  disabled={isRunning || tumblrLoading || !beforeDate}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2
                    bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {tumblrLoading ? (
                    <><Spinner /> Iniciando…</>
                  ) : isRunning ? (
                    '⏳ Importación en progreso'
                  ) : (
                    'Iniciar importación Tumblr'
                  )}
                </button>

                {tumblrError && <ErrorBox message={tumblrError} />}
              </div>
            </div>
          </div>

          {/* X card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-white text-base">
                  𝕏
                </div>
                <div>
                  <h2 className="font-bold text-white">X / Twitter</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Archivo <code className="text-slate-300">tweet.js</code> · filtra RT y respuestas</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Upload zone */}
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 cursor-pointer transition-all ${
                isRunning || xLoading
                  ? 'border-slate-700 cursor-not-allowed'
                  : 'border-slate-700 hover:border-indigo-500/60 hover:bg-indigo-500/5'
              }`}>
                <div className="text-4xl">
                  {xLoading ? '⏳' : '📂'}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">
                    {xLoading ? 'Procesando…' : isRunning ? 'Job en progreso' : 'Subir tweet.js'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {xLoading ? 'Esto puede tardar unos minutos' : '.js · .json · máx 50 MB recomendado'}
                  </p>
                </div>
                <input ref={fileRef} type="file" accept=".js,.json" className="hidden" onChange={handleXFile} disabled={isRunning || xLoading} />
              </label>

              {/* How to */}
              <details className="group">
                <summary className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors select-none list-none">
                  <span className="group-open:rotate-90 inline-block transition-transform duration-150">›</span>
                  Cómo obtener el export de X
                </summary>
                <ol className="mt-3 space-y-1.5 text-xs text-slate-400 ml-4 list-decimal leading-relaxed">
                  <li>Ajustes → Tu cuenta → <strong className="text-slate-300">Descargar un archivo de tus datos</strong></li>
                  <li>Solicitar archivo completo (puede tardar hasta 24h)</li>
                  <li>Descomprimir el zip → buscar <code className="text-slate-300 bg-slate-800 px-1 rounded">data/tweet.js</code></li>
                  <li>Subir ese archivo aquí</li>
                </ol>
              </details>

              {xError && <ErrorBox message={xError} />}
            </div>
          </div>
        </div>

        {/* ── Imported items browser ── */}
        <ImportedItemsBrowser />

        {/* ── Job history ── */}
        {jobs !== undefined && (jobs as any[]).length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Historial de importaciones</h2>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-800 overflow-hidden">
              {(jobs as any[]).map((job: any) => (
                <JobRow key={job._id} job={job} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Active job card ───────────────────────────────────────────────────────────

function ActiveJobCard({ job }: { job: any }) {
  const total    = job.itemsTotal ?? 0
  const imported = job.itemsImported ?? 0
  const failed   = job.itemsFailed ?? 0
  const done     = imported + failed
  const pct      = total > 0 ? Math.min(100, Math.round(done / total * 100)) : null
  const cursor: number | undefined = job.configJson?.cursorTs
  const source   = job.source === 'tumblr' ? 'Tumblr' : 'X / Twitter'

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 p-6 shadow-xl shadow-blue-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-white animate-pulse inline-block shadow-lg" />
          <span className="font-bold text-white text-lg">Importando {source}</span>
        </div>
        {cursor && (
          <span className="text-blue-200 text-xs bg-blue-500/30 px-2.5 py-1 rounded-full">
            cursor: {fmtDate(cursor)}
          </span>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-blue-100 font-medium">{imported.toLocaleString()} importados{failed > 0 && <span className="text-red-300 ml-2">{failed} fallidos</span>}</span>
          {total > 0 && <span className="text-blue-200">{pct}% de ~{total.toLocaleString()}</span>}
        </div>
        <div className="h-2.5 bg-blue-500/40 rounded-full overflow-hidden">
          {pct !== null ? (
            <div className="h-full bg-white rounded-full transition-all duration-700 shadow-sm" style={{ width: `${pct}%` }} />
          ) : (
            <div className="h-full bg-white/60 rounded-full animate-pulse w-full" />
          )}
        </div>
      </div>

      <p className="text-xs text-blue-200/70">
        Corriendo en segundo plano · puedes cerrar el navegador · se actualiza automáticamente
      </p>
    </div>
  )
}

// ── Imported items browser ────────────────────────────────────────────────────

function ImportedItemsBrowser() {
  const [platform, setPlatform] = useState<'all' | 'tumblr' | 'x'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_review' | 'approved'>('all')
  const [approving, setApproving] = useState<string | null>(null)

  const { results, status, loadMore } = usePaginatedQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.contentItems.list as any,
    { contentOrigin: 'imported' },
    { initialNumItems: 30 }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approveItem = useMutation(api.contentItems.approve as any)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = (results as any[]).filter((i: any) => {
    if (platform !== 'all' && i.sourcePlatform !== platform) return false
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    return true
  })

  async function handleApprove(id: string) {
    setApproving(id)
    try { await approveItem({ id }) } finally { setApproving(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Posts importados</h2>
        <span className="text-xs text-slate-600">
          {status === 'LoadingFirstPage' ? '' : `${filtered.length}${status === 'CanLoadMore' ? '+' : ''}`}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <TabGroup
          value={platform}
          onChange={v => setPlatform(v as typeof platform)}
          options={[
            { value: 'all',    label: 'Todos' },
            { value: 'tumblr', label: '📷 Tumblr' },
            { value: 'x',      label: '𝕏 X' },
          ]}
        />
        <TabGroup
          value={statusFilter}
          onChange={v => setStatusFilter(v as typeof statusFilter)}
          options={[
            { value: 'all',       label: 'Todos los estados' },
            { value: 'in_review', label: 'Por revisar' },
            { value: 'approved',  label: 'Aprobados' },
          ]}
        />
      </div>

      {/* List */}
      {status === 'LoadingFirstPage' ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 py-16 text-center">
          <div className="flex flex-col items-center gap-2">
            <Spinner />
            <p className="text-slate-400 text-sm">Cargando…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 py-16 text-center">
          <p className="text-2xl mb-2">📭</p>
          <p className="text-slate-400 text-sm font-medium">Sin posts con este filtro</p>
          <p className="text-slate-600 text-xs mt-1">Inicia una importación para poblar el catálogo</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-800/60 overflow-hidden">
          {filtered.map((item: any) => {
            const statusCfg = ITEM_STATUS_CONFIG[item.status] ?? { label: item.status, cls: 'bg-gray-100 text-gray-500' }
            const canApprove = ['draft', 'in_review', 'researching'].includes(item.status)
            return (
              <div key={item._id} className="px-5 py-4 flex items-start gap-4 hover:bg-slate-800/40 transition-colors group">
                {/* Platform dot */}
                <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-base">
                  {item.sourcePlatform === 'tumblr' ? '📷' : item.sourcePlatform === 'x' ? '𝕏' : '•'}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2 mb-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                    {item.needsReview && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                        Revisar
                      </span>
                    )}
                    {item.sourceDate && (
                      <span className="text-[10px] text-slate-500 ml-auto">{fmtDate(item.sourceDate)}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-100 truncate leading-snug">{item.title}</p>
                  {item.summary && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1 leading-relaxed">{item.summary}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.sourcePostUrl && (
                    <a
                      href={item.sourcePostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors"
                      title="Ver post original"
                    >
                      ↗
                    </a>
                  )}
                  <Link
                    href={`/catalog/${item._id}`}
                    className="h-8 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center transition-colors"
                  >
                    Editar
                  </Link>
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => handleApprove(item._id)}
                      disabled={approving === item._id}
                      className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      {approving === item._id ? <><Spinner /> …</> : '✓ Aprobar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {status === 'CanLoadMore' && (
            <div className="px-5 py-4 flex justify-center">
              <button
                type="button"
                onClick={() => loadMore(20)}
                className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors flex items-center gap-1.5"
              >
                Cargar 20 más ↓
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Job history row ───────────────────────────────────────────────────────────

function JobRow({ job }: { job: any }) {
  const [open, setOpen] = useState(false)
  const errors: any[] = job.configJson?.errors ?? []
  const cursor:   number | undefined = job.configJson?.cursorTs
  const afterTs:  number | undefined = job.configJson?.afterTs
  const beforeTs: number | undefined = job.configJson?.beforeTs
  const cfg = JOB_STATUS_CONFIG[job.status] ?? JOB_STATUS_CONFIG.pending
  const duration = job.completedAt && job.startedAt ? Math.round((job.completedAt - job.startedAt) / 1000) : null

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${cfg.pill}`}>
            {cfg.label}
          </span>
          <span className="text-sm font-medium text-slate-300">
            {job.source === 'tumblr' ? '📷 Tumblr' : '𝕏 X / Twitter'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="text-slate-300 font-semibold">{(job.itemsImported ?? 0).toLocaleString()} posts</span>
          {job.itemsFailed > 0 && <span className="text-red-400">{job.itemsFailed} err</span>}
          {duration !== null && <span>{duration}s</span>}
          {job.startedAt && <span>{fmtDateTime(job.startedAt)}</span>}
        </div>
      </div>

      {(beforeTs || cursor || afterTs) && (
        <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-slate-600 ml-5">
          {beforeTs && <span>Hasta: <span className="text-slate-400">{fmtDate(beforeTs)}</span></span>}
          {cursor && cursor !== beforeTs && (
            <span>Marca agua: <span className="text-indigo-400 font-medium">{fmtDate(cursor)}</span></span>
          )}
          {afterTs && <span>Desde: <span className="text-slate-400">{fmtDate(afterTs)}</span></span>}
        </div>
      )}

      {errors.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(v => !v)} className="mt-2 ml-5 text-xs text-red-400 hover:text-red-300 transition-colors">
            {open ? '▲' : '▼'} {errors.length} error{errors.length !== 1 ? 'es' : ''}
          </button>
          {open && (
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto rounded-lg border border-red-900/50 bg-red-950/30 p-3 ml-5">
              {errors.map((e: any, i: number) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-red-400 block truncate">{e.title}</span>
                  <span className="text-red-600">{e.error}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function TabGroup({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex rounded-xl border border-slate-700 overflow-hidden bg-slate-900 text-xs p-0.5 gap-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            value === opt.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-950/50 border border-red-900/60 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
      <span className="shrink-0 mt-0.5 text-red-400">⚠</span>
      <span>{message}</span>
    </div>
  )
}
