'use client'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRef, useState } from 'react'

// ── Status display helpers ────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs    = useQuery(api.importJobs.list as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active  = useQuery(api.importJobs.getActive as any)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startTumblrImport = useAction((api.actions as any).importer.startTumblrImport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processXExport    = useAction((api.actions as any).importer.processXExport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateUploadUrl = useMutation(api.importJobs.generateUploadUrl as any)

  const [tumblrLoading, setTumblrLoading] = useState(false)
  const [tumblrError,   setTumblrError]   = useState<string | null>(null)
  const [xLoading,      setXLoading]      = useState(false)
  const [xError,        setXError]        = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isRunning = (active as any)?.status === 'running'

  async function handleTumblrImport() {
    if (isRunning) return
    setTumblrLoading(true)
    setTumblrError(null)
    try {
      await startTumblrImport({})
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
          Importa el archivo completo de Tumblr y el export de X. Los ítems importados
          aparecen en la cola de revisión con <code className="text-xs">needsReview=true</code>.
          La deduplicación es automática — un job interrumpido puede reiniciarse sin duplicar lo ya importado.
        </p>
      </div>

      {/* Active job banner */}
      {isRunning && <ActiveJobBanner job={active as any} />}

      {/* Import sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tumblr */}
        <ImportCard
          title="Tumblr"
          description="Importa todos los posts del blog vía OAuth. Pagina automáticamente respetando el rate limit."
          icon="📷"
          disabled={isRunning || tumblrLoading}
          loading={tumblrLoading}
          error={tumblrError}
        >
          <button
            type="button"
            onClick={handleTumblrImport}
            disabled={isRunning || tumblrLoading}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {tumblrLoading ? 'Iniciando…' : isRunning ? 'Job en progreso…' : 'Iniciar importación Tumblr'}
          </button>
        </ImportCard>

        {/* X export */}
        <ImportCard
          title="X / Twitter"
          description="Sube el archivo tweet.js del export oficial de X. Se filtran respuestas y retweets."
          icon="✕"
          disabled={isRunning || xLoading}
          loading={xLoading}
          error={xError}
        >
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
          <p className="text-xs text-gray-400 mt-1 text-center">
            Archivo: <code>data/tweet.js</code> del export de X
          </p>
        </ImportCard>
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

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-semibold text-blue-800">
            Importando {SOURCE_LABEL[job.source] ?? job.source}…
          </span>
        </div>
        <span className="text-xs text-blue-600">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-4 text-xs text-blue-700">
        <span>Importados: <strong>{imported}</strong></span>
        {failed > 0 && <span className="text-red-600">Fallidos: <strong>{failed}</strong></span>}
        {total > 0 && <span className="text-gray-500">Total estimado: {total}</span>}
      </div>
    </div>
  )
}

// ── Import card ───────────────────────────────────────────────────────────────

function ImportCard({
  title,
  description,
  icon,
  disabled,
  loading,
  error,
  children,
}: {
  title: string
  description: string
  icon: string
  disabled: boolean
  loading: boolean
  error: string | null
  children: React.ReactNode
}) {
  return (
    <div className={`border rounded-lg p-5 space-y-4 transition-colors ${
      disabled && !loading ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="text-sm text-gray-500">{description}</p>
      {children}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

// ── Job row in history ────────────────────────────────────────────────────────

function JobRow({ job }: { job: any }) {
  const [showErrors, setShowErrors] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors: any[] = (job.configJson as any)?.errors ?? []

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

      <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
        <span>Importados: <strong className="text-gray-700">{job.itemsImported}</strong></span>
        {job.itemsFailed > 0 && (
          <span className="text-red-600">Fallidos: <strong>{job.itemsFailed}</strong></span>
        )}
        {job.itemsTotal > 0 && (
          <span>Total: {job.itemsTotal}</span>
        )}
        {job.completedAt && (
          <span>
            Duración: {Math.round((job.completedAt - (job.startedAt ?? job.completedAt)) / 1000)}s
          </span>
        )}
      </div>

      {/* Per-item errors (expandable) */}
      {errors.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowErrors(v => !v)}
            className="text-xs text-red-600 hover:underline"
          >
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
