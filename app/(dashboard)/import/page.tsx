'use client'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRef, useState } from 'react'

const STATUS_LABEL: Record<string, string> = {
  pending:   'Pendiente',
  running:   'En progreso',
  completed: 'Completado',
  partial:   'Parcial',
  failed:    'Fallido',
}

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  partial:   'bg-yellow-100 text-yellow-700',
  failed:    'bg-red-100 text-red-700',
}

const SOURCE_LABEL: Record<string, string> = {
  tumblr:   'Tumblr',
  x_export: 'X / Twitter',
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('es-ES', { dateStyle: 'medium' })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function ImportPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs       = useQuery(api.importJobs.list as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active     = useQuery(api.importJobs.getActive as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastTumblr = useQuery(api.importJobs.getLastTumblrJob as any)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startTumblrImport = useAction((api.actions as any).importer.startTumblrImport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processXExport    = useAction((api.actions as any).importer.processXExport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateUploadUrl = useMutation(api.importJobs.generateUploadUrl as any)

  // Tumblr date range
  const [beforeDate, setBeforeDate] = useState(todayISO())
  const [afterDate,  setAfterDate]  = useState('')

  const [tumblrLoading, setTumblrLoading] = useState(false)
  const [tumblrError,   setTumblrError]   = useState<string | null>(null)
  const [xLoading,      setXLoading]      = useState(false)
  const [xError,        setXError]        = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isRunning  = (active as any)?.status === 'running'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastConfig = (lastTumblr as any)?.configJson
  const lastCursor: number | undefined = lastConfig?.cursorTs
  const lastAfterTs: number | undefined = lastConfig?.afterTs
  const hasWatermark = lastCursor !== undefined && lastCursor < Date.now() - 60_000

  async function handleTumblrImport(continueFromLast = false) {
    if (isRunning) return
    setTumblrLoading(true)
    setTumblrError(null)
    try {
      await startTumblrImport({
        beforeDate: continueFromLast ? undefined : beforeDate || undefined,
        afterDate:  continueFromLast ? undefined : afterDate  || undefined,
        continueFromLast,
      })
    } catch (err) {
      setTumblrError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setTumblrLoading(false)
    }
  }

  async function handleXFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || isRunning) return
    setXLoading(true)
    setXError(null)
    try {
      const uploadUrl = await generateUploadUrl({})
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/javascript' },
        body: file,
      })
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
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importador histórico</h1>
        <p className="text-sm text-gray-500 mt-1">
          Importa el historial de Tumblr por franjas de fecha. Cada batch descarga 20 posts y guarda
          una marca de agua — puedes continuar donde quedaste en cualquier momento.
          La deduplicación es automática.
        </p>
      </div>

      {/* Active job banner */}
      {isRunning && <ActiveJobBanner job={active as any} />}

      {/* Watermark info */}
      {hasWatermark && !isRunning && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-indigo-800">Marca de agua guardada</p>
            <p className="text-xs text-indigo-600 mt-0.5">
              Última importación alcanzó posts de <strong>{fmtDate(lastCursor!)}</strong>
              {lastAfterTs && <> (límite inferior: {fmtDate(lastAfterTs)})</>}
              . Puedes continuar desde aquí.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleTumblrImport(true)}
            disabled={isRunning || tumblrLoading}
            className="shrink-0 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {tumblrLoading ? 'Iniciando…' : 'Continuar importación →'}
          </button>
        </div>
      )}

      {/* Import sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tumblr */}
        <div className={`border rounded-lg p-5 space-y-4 ${isRunning && !tumblrLoading ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">📷</span>
            <h2 className="font-semibold text-gray-900">Tumblr</h2>
          </div>
          <p className="text-sm text-gray-500">
            Pagina el blog vía OAuth usando marca de tiempo como cursor. Descarga 20 posts por batch,
            respeta el rate limit (~250 req/hora). Corre en segundo plano — puedes cerrar el navegador.
          </p>

          {/* Date range */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Hasta (fecha más reciente a importar)
              </label>
              <input
                type="date"
                value={beforeDate}
                onChange={e => setBeforeDate(e.target.value)}
                max={todayISO()}
                disabled={isRunning || tumblrLoading}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Desde (fecha más antigua — opcional)
              </label>
              <input
                type="date"
                value={afterDate}
                onChange={e => setAfterDate(e.target.value)}
                max={beforeDate || todayISO()}
                disabled={isRunning || tumblrLoading}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">
                Vacío = importar todo el historial disponible
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleTumblrImport(false)}
            disabled={isRunning || tumblrLoading}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {tumblrLoading ? 'Iniciando…' : isRunning ? 'Job en progreso…' : 'Iniciar importación Tumblr'}
          </button>

          {tumblrError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {tumblrError}
            </div>
          )}
        </div>

        {/* X export */}
        <div className={`border rounded-lg p-5 space-y-4 ${isRunning && !xLoading ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">✕</span>
            <h2 className="font-semibold text-gray-900">X / Twitter</h2>
          </div>
          <p className="text-sm text-gray-500">
            Sube el archivo <code className="text-xs bg-gray-100 px-1 rounded">tweet.js</code> del
            export oficial de X. Se filtran respuestas y retweets. Procesa en batches de 50.
          </p>
          <label
            className={`block w-full px-4 py-2 text-center text-sm rounded-md border-2 border-dashed cursor-pointer transition-colors ${
              isRunning || xLoading
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600'
            }`}
          >
            {xLoading ? 'Procesando…' : isRunning ? 'Job en progreso…' : '+ Subir tweet.js'}
            <input
              ref={fileRef}
              type="file"
              accept=".js,.json"
              className="hidden"
              onChange={handleXFileChange}
              disabled={isRunning || xLoading}
            />
          </label>
          <p className="text-xs text-gray-400 text-center">
            Archivo: <code>data/tweet.js</code> del export de X
          </p>
          {xError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {xError}
            </div>
          )}
        </div>
      </div>

      {/* Job history */}
      {jobs && (jobs as any[]).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Historial de importaciones
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
            {(jobs as any[]).map((job: any) => (
              <JobRow key={job._id} job={job} />
            ))}
          </div>
        </div>
      )}

      {jobs !== undefined && (jobs as any[]).length === 0 && (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-500">No hay importaciones registradas</p>
          <p className="text-sm text-gray-400 mt-1">Inicia una importación para poblar el catálogo</p>
        </div>
      )}
    </div>
  )
}

// ── Active job banner ─────────────────────────────────────────────────────────

function ActiveJobBanner({ job }: { job: any }) {
  const total    = job.itemsTotal ?? 0
  const imported = job.itemsImported ?? 0
  const failed   = job.itemsFailed ?? 0
  const pct      = total > 0 ? Math.round((imported + failed) / total * 100) : 0
  const cursor: number | undefined = job.configJson?.cursorTs

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-semibold text-blue-800">
            Importando {SOURCE_LABEL[job.source] ?? job.source}…
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-blue-600">
          {cursor && <span>Cursor: {fmtDate(cursor)}</span>}
          {total > 0 && <span>{pct}%</span>}
        </div>
      </div>

      {total > 0 && (
        <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="flex gap-4 text-xs text-blue-700">
        <span>Importados: <strong>{imported}</strong></span>
        {failed > 0 && <span className="text-red-600">Fallidos: <strong>{failed}</strong></span>}
        {total > 0 && <span className="text-gray-500">Total estimado: {total}</span>}
      </div>
    </div>
  )
}

// ── Job row ───────────────────────────────────────────────────────────────────

function JobRow({ job }: { job: any }) {
  const [showErrors, setShowErrors] = useState(false)
  const errors: any[] = (job.configJson as any)?.errors ?? []
  const cursor: number | undefined = (job.configJson as any)?.cursorTs
  const afterTs: number | undefined = (job.configJson as any)?.afterTs
  const beforeTs: number | undefined = (job.configJson as any)?.beforeTs

  return (
    <div className="px-4 py-3 bg-white text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[job.status] ?? job.status}
          </span>
          <span className="font-medium text-gray-800">
            {SOURCE_LABEL[job.source] ?? job.source}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {job.startedAt ? new Date(job.startedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
        </span>
      </div>

      <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-gray-500">
        <span>Importados: <strong className="text-gray-700">{job.itemsImported}</strong></span>
        {job.itemsFailed > 0 && (
          <span className="text-red-600">Fallidos: <strong>{job.itemsFailed}</strong></span>
        )}
        {job.itemsTotal > 0 && <span>Total estimado: {job.itemsTotal}</span>}
        {job.completedAt && (
          <span>Duración: {Math.round((job.completedAt - (job.startedAt ?? job.completedAt)) / 1000)}s</span>
        )}
      </div>

      {/* Date range info */}
      {(beforeTs || cursor || afterTs) && (
        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
          {beforeTs && <span>Hasta: {fmtDate(beforeTs)}</span>}
          {cursor && cursor !== beforeTs && <span>Marca agua: {fmtDate(cursor)}</span>}
          {afterTs && <span>Desde: {fmtDate(afterTs)}</span>}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowErrors(v => !v)} className="text-xs text-red-600 hover:underline">
            {showErrors ? '▲ Ocultar' : '▼ Ver'} {errors.length} error{errors.length !== 1 ? 'es' : ''}
          </button>
          {showErrors && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {errors.map((e: any, i: number) => (
                <div key={i} className="text-xs bg-red-50 border border-red-100 rounded px-2 py-1">
                  <span className="font-medium text-red-700 block truncate">{e.title}</span>
                  <span className="text-red-500">{e.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
