'use client'
import { useState } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { Channel, VariantStatus } from '@/lib/types/domain'
import { RichTextEditor } from './RichTextEditor'

const STATUS_LABELS: Record<VariantStatus, string> = {
  not_started: 'Sin empezar',
  generated:   'Generada',
  edited:      'Editada',
  approved:    'Aprobada',
  scheduled:   'Programada',
  published:   'Publicada',
  failed:      'Fallida',
  disabled:    'Desactivada',
}

const STATUS_COLORS: Record<VariantStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  generated:   'bg-blue-100 text-blue-700',
  edited:      'bg-yellow-100 text-yellow-700',
  approved:    'bg-green-100 text-green-700',
  scheduled:   'bg-purple-100 text-purple-700',
  published:   'bg-indigo-100 text-indigo-700',
  failed:      'bg-red-100 text-red-700',
  disabled:    'bg-gray-100 text-gray-400',
}

const INPUT_CLASS =
  'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

/** Strip script/style/iframe/event-handler attrs before dangerouslySetInnerHTML */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
}

interface ChannelCardProps {
  contentItemId: Id<'contentItems'>
  channel: Channel
  itemStatus: string
}

function ChannelVariantCard({ contentItemId, channel, itemStatus }: ChannelCardProps) {
  const variants = useQuery(api.contentVariants.listByItem, { contentItemId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeVariant = (variants as any[])?.find((vr: any) => vr.channel === channel && vr.isActive) ?? null

  const createVariant  = useMutation(api.contentVariants.create)
  const updateVariant  = useMutation(api.contentVariants.update)
  const approveVariant = useMutation(api.contentVariants.approve)
  const publishDirect  = useAction(api.actions.publisher.publishDirect)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateVariant = useAction(api.actions.ai.generateVariant as any)

  const [editing, setEditing]             = useState(false)
  const [form, setForm]                   = useState({ headline: '', bodyText: '', ctaText: '' })
  const [saving, setSaving]               = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [publishing, setPublishing]       = useState(false)
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null)
  // 'preview' = rendered HTML (Tumblr only); 'code' = raw text
  const [bodyPreviewMode, setBodyPreviewMode] = useState<'preview' | 'code'>('preview')

  const channelLabel = channel === 'tumblr' ? 'Tumblr' : 'X / Twitter'
  const status       = activeVariant?.status as VariantStatus | undefined
  const canApprove   = status !== undefined && ['not_started', 'generated', 'edited'].includes(status)
  const canPublish   = status === 'approved' && (itemStatus === 'approved' || itemStatus === 'published')

  function startEdit() {
    setForm({
      headline: activeVariant?.headline ?? '',
      bodyText: activeVariant?.bodyText ?? '',
      ctaText:  activeVariant?.ctaText  ?? '',
    })
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (!activeVariant) {
        await createVariant({
          contentItemId,
          channel,
          headline:  form.headline  || undefined,
          bodyText:  form.bodyText  || undefined,
          ctaText:   form.ctaText   || undefined,
        })
      } else {
        await updateVariant({
          id:        activeVariant._id,
          headline:  form.headline  || undefined,
          bodyText:  form.bodyText  || undefined,
          ctaText:   form.ctaText   || undefined,
        })
      }
      setEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await generateVariant({ contentItemId, channel } as any)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Error generando variante')
    } finally {
      setGenerating(false)
    }
  }

  async function handleApprove() {
    if (!activeVariant) return
    try {
      await approveVariant({ id: activeVariant._id })
    } catch (err) {
      console.error(err)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setPublishResult(null)
    try {
      const result = await publishDirect({ contentItemId, channel })
      if (result.success) {
        setPublishResult({ url: result.externalPostUrl })
      } else {
        setPublishResult({ error: result.error ?? 'Error desconocido' })
      }
    } catch (err) {
      setPublishResult({ error: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900 text-sm">{channelLabel}</h4>
        {status ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
            Sin variante
          </span>
        )}
      </div>

      {/* Preview (not editing) */}
      {activeVariant && !editing && (
        <div className="space-y-2 text-sm text-gray-700">
          {/* Headline */}
          {activeVariant.headline && (
            <div className="bg-gray-50 rounded px-3 py-2">
              <span className="font-semibold text-gray-500 text-xs block mb-0.5">TITULAR</span>
              <p className="text-sm font-medium text-gray-900">{activeVariant.headline}</p>
            </div>
          )}

          {/* Body — HTML preview toggle for Tumblr */}
          {activeVariant.bodyText && (
            <div className="bg-gray-50 rounded px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-gray-500 text-xs">CUERPO</span>
                {channel === 'tumblr' && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBodyPreviewMode('preview')}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                        bodyPreviewMode === 'preview'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Vista previa
                    </button>
                    <button
                      type="button"
                      onClick={() => setBodyPreviewMode('code')}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                        bodyPreviewMode === 'code'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Código
                    </button>
                  </div>
                )}
              </div>

              {channel === 'tumblr' && bodyPreviewMode === 'preview' ? (
                <div
                  className="prose prose-sm max-w-none text-gray-800 [&_h2]:text-base [&_h2]:font-bold [&_p]:my-1 [&_a]:text-indigo-600 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(activeVariant.bodyText) }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-xs text-gray-700 font-mono leading-relaxed">
                  {activeVariant.bodyText}
                </p>
              )}
            </div>
          )}

          {/* CTA / Tags */}
          {activeVariant.ctaText && (
            <div className="bg-gray-50 rounded px-3 py-2">
              <span className="font-semibold text-gray-500 text-xs block mb-0.5">
                {channel === 'tumblr' ? 'TAGS' : 'CTA / LINK'}
              </span>
              <p className="text-xs text-gray-700">{activeVariant.ctaText}</p>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Titular {channel === 'x' ? '(máx 60 caracteres)' : '(máx 100 caracteres)'}
            </label>
            <input
              type="text"
              value={form.headline}
              onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
              maxLength={channel === 'x' ? 60 : 100}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cuerpo {channel === 'x' ? '(máx 150 caracteres, texto plano)' : '(editor de texto enriquecido)'}
            </label>
            {channel === 'tumblr' ? (
              <RichTextEditor
                value={form.bodyText}
                onChange={html => setForm(f => ({ ...f, bodyText: html }))}
              />
            ) : (
              <>
                <textarea
                  value={form.bodyText}
                  onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))}
                  maxLength={150}
                  rows={3}
                  className={`${INPUT_CLASS} font-mono text-xs`}
                />
                <p className="text-xs text-gray-400 mt-0.5 text-right">
                  {form.bodyText.length}/150
                </p>
              </>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CTA</label>
            <input
              type="text"
              value={form.ctaText}
              onChange={e => setForm(f => ({ ...f, ctaText: e.target.value }))}
              placeholder="Llamada a la acción"
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar variante'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Generate error */}
      {generateError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {generateError}
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {generating ? 'Generando…' : 'Generar con IA'}
          </button>
          <button
            type="button"
            onClick={startEdit}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
          >
            {activeVariant ? 'Editar' : 'Crear variante'}
          </button>
          {canApprove && (
            <button
              type="button"
              onClick={handleApprove}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Aprobar
            </button>
          )}
          {canPublish && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {publishing ? 'Publicando...' : `Publicar ahora en ${channelLabel}`}
            </button>
          )}
        </div>
      )}

      {/* Publish result */}
      {publishResult && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            publishResult.url
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {publishResult.url ? (
            <>
              ✓ Publicado.{' '}
              <a
                href={publishResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                Ver post
              </a>
            </>
          ) : (
            <>Error: {publishResult.error}</>
          )}
        </div>
      )}
    </div>
  )
}

interface VariantPanelProps {
  contentItemId: Id<'contentItems'>
  itemStatus: string
}

export function VariantPanel({ contentItemId, itemStatus }: VariantPanelProps) {
  const logs     = useQuery(api.publicationLog.listByItem, { contentItemId })
  const variants = useQuery(api.contentVariants.listByItem, { contentItemId })

  const approvedChannels = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (variants as any[] | undefined)
      ?.filter((v: any) => v.isActive && v.status === 'approved')
      ?.map((v: any) => v.channel as string) ?? []
  )
  const isApproved     = itemStatus === 'approved' || itemStatus === 'published' || itemStatus === 'scheduled'
  const missingApproval = isApproved && variants !== undefined && approvedChannels.size === 0

  return (
    <div className="space-y-6">
      {/* Warning: approved item but no approved variant */}
      {missingApproval && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-amber-500 text-base mt-0.5">⚠</span>
          <div className="text-sm text-amber-800">
            <p className="font-medium">Variante pendiente de aprobación</p>
            <p className="text-xs mt-0.5 text-amber-700">
              Ítem aprobado pero ninguna variante está aprobada. No aparecerá en el calendario automático hasta que apruebes al menos una variante de canal.
            </p>
          </div>
        </div>
      )}
      {isApproved && !missingApproval && variants !== undefined && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          {(['tumblr', 'x'] as const).map(ch => (
            <span key={ch} className={`px-2 py-0.5 rounded-full ${
              approvedChannels.has(ch) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {ch === 'tumblr' ? 'Tumblr' : 'X'}: {approvedChannels.has(ch) ? 'variante aprobada ✓' : 'sin variante aprobada'}
            </span>
          ))}
        </div>
      )}

      {/* Channel cards */}
      <div className="space-y-4">
        <ChannelVariantCard contentItemId={contentItemId} channel="tumblr" itemStatus={itemStatus} />
        <ChannelVariantCard contentItemId={contentItemId} channel="x"      itemStatus={itemStatus} />
      </div>

      {/* Publication history */}
      {logs && logs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Historial de publicaciones
          </h4>
          <div className="space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(logs as any[]).map((log: any) => (
              <div key={log._id} className="flex items-start gap-3 px-4 py-3 bg-white text-sm">
                <span
                  className={`mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    log.publishStatus === 'success' ? 'bg-green-500' : 'bg-red-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-700 capitalize">{log.channel}</span>
                    <span className="text-gray-400 text-xs">
                      {new Date(log._creationTime).toLocaleString('es-ES', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  {log.externalPostUrl ? (
                    <a
                      href={log.externalPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline text-xs truncate block"
                    >
                      {log.externalPostUrl}
                    </a>
                  ) : null}
                  {log.errorMessage ? (
                    <p className="text-red-600 text-xs">{log.errorMessage}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
