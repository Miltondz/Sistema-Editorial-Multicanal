'use client'
import { useState, useRef } from 'react'
import { useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { OriginBadge } from '@/components/catalog/OriginBadge'
import { VariantPanel } from '@/components/editor/VariantPanel'
import { ResearchAssistant } from '@/components/editor/ResearchAssistant'
import type {
  ContentItem, ContentType, ContentOrigin, EvergreenClass,
  CreatorRole, Creator, MediaAsset,
} from '@/lib/types/domain'
import type { Id } from '@/convex/_generated/dataModel'

// ── Sub-types ────────────────────────────────────────────────────────────────

type FormData = {
  contentType: ContentType
  title: string
  summary: string
  longDescription: string
  franchise: string
  publisher: string
  characters: string
  buyLink: string
  topicFatigueGroup: string
  editorialPriority: number
  evergreenClass: EvergreenClass
  isSensitive: boolean
  needsReview: boolean
  enrichedManually: boolean
  contentOrigin: ContentOrigin
  sourcePlatform: 'tumblr' | 'x' | ''
  sourcePostUrl: string
  sourcePostId: string
  representationTags: string
  themeTags: string
  creators: Creator[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
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

const CREATOR_ROLES: { value: CreatorRole; label: string }[] = [
  { value: 'writer', label: 'Guionista' },
  { value: 'artist', label: 'Artista' },
  { value: 'cover_artist', label: 'Portada' },
  { value: 'colorist', label: 'Colorista' },
  { value: 'photographer', label: 'Fotógrafa/o' },
  { value: 'other', label: 'Otro' },
]

const EVERGREEN_OPTIONS: { value: EvergreenClass; label: string }[] = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
]

// ── MediaUploader ────────────────────────────────────────────────────────────

function MediaUploader({
  contentItemId,
  media,
  onUploaded,
}: {
  contentItemId: Id<'contentItems'>
  media: MediaAsset[]
  onUploaded: () => void
}) {
  const generateUploadUrl = useMutation(api.mediaAssets.generateUploadUrl)
  const saveMediaAsset = useMutation(api.mediaAssets.saveMediaAsset)
  const deleteAsset = useMutation(api.mediaAssets.deleteAsset)
  const setPrimary = useMutation(api.mediaAssets.setPrimary)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      alert('La imagen no puede superar 500 KB')
      return
    }
    setUploading(true)
    try {
      const uploadUrl = await generateUploadUrl()
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      const { storageId } = await res.json()
      await saveMediaAsset({
        contentItemId,
        storageId,
        mimeType: file.type,
        fileSizeBytes: file.size,
      })
      onUploaded()
    } catch (err) {
      alert('Error al subir imagen: ' + (err instanceof Error ? err.message : 'desconocido'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        {media.map(asset => (
          <div key={asset._id} className="relative group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.publicUrl}
              alt={asset.altText ?? ''}
              className={`w-24 h-24 object-cover rounded border-2 ${
                asset.isPrimary ? 'border-indigo-500' : 'border-gray-200'
              }`}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded flex items-center justify-center gap-1 transition-opacity">
              {!asset.isPrimary && (
                <button
                  onClick={() => setPrimary({ id: asset._id, contentItemId })}
                  className="text-xs text-white bg-indigo-600 px-1.5 py-0.5 rounded"
                  title="Marcar como principal"
                >
                  ★
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm('¿Eliminar imagen?')) deleteAsset({ id: asset._id })
                }}
                className="text-xs text-white bg-red-600 px-1.5 py-0.5 rounded"
              >
                ✕
              </button>
            </div>
            {asset.isPrimary && (
              <span className="absolute bottom-0 left-0 right-0 text-center text-xs bg-indigo-600 text-white rounded-b py-0.5">
                Principal
              </span>
            )}
          </div>
        ))}
      </div>

      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
        {uploading ? 'Subiendo...' : '+ Subir imagen'}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
      <p className="text-xs text-gray-400 mt-1">Máximo 500 KB por imagen</p>
    </div>
  )
}

// ── Creators editor ──────────────────────────────────────────────────────────

function CreatorsEditor({
  creators,
  onChange,
}: {
  creators: Creator[]
  onChange: (c: Creator[]) => void
}) {
  function addCreator() {
    onChange([...creators, { role: 'writer', name: '' }])
  }
  function remove(idx: number) {
    onChange(creators.filter((_, i) => i !== idx))
  }
  function updateCreator(idx: number, field: keyof Creator, value: string) {
    const next = [...creators]
    next[idx] = { ...next[idx], [field]: value }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {creators.map((creator, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <select
            value={creator.role}
            onChange={e => updateCreator(idx, 'role', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
          >
            {CREATOR_ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={creator.name}
            onChange={e => updateCreator(idx, 'name', e.target.value)}
            placeholder="Nombre"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addCreator}
        className="text-sm text-indigo-600 hover:text-indigo-800"
      >
        + Añadir creador/a
      </button>
    </div>
  )
}

// ── Main ContentEditor ────────────────────────────────────────────────────────

interface ContentEditorProps {
  mode: 'create' | 'edit'
  initialItem?: ContentItem & { media?: MediaAsset[] }
  onSaved?: (id: Id<'contentItems'>) => void
}

function itemToForm(item: ContentItem): FormData {
  return {
    contentType: item.contentType,
    title: item.title,
    summary: item.summary ?? '',
    longDescription: item.longDescription ?? '',
    franchise: item.franchise ?? '',
    publisher: item.publisher ?? '',
    characters: (item.characters ?? []).join(', '),
    buyLink: item.buyLink ?? '',
    topicFatigueGroup: item.topicFatigueGroup ?? '',
    editorialPriority: item.editorialPriority,
    evergreenClass: item.evergreenClass,
    isSensitive: item.isSensitive,
    needsReview: item.needsReview,
    enrichedManually: item.enrichedManually,
    contentOrigin: item.contentOrigin,
    sourcePlatform: item.sourcePlatform ?? '',
    sourcePostUrl: item.sourcePostUrl ?? '',
    sourcePostId: item.sourcePostId ?? '',
    representationTags: (item.representationTags ?? []).join(', '),
    themeTags: (item.themeTags ?? []).join(', '),
    creators: item.creators ?? [],
  }
}

const DEFAULT_FORM: FormData = {
  contentType: 'comic',
  title: '',
  summary: '',
  longDescription: '',
  franchise: '',
  publisher: '',
  characters: '',
  buyLink: '',
  topicFatigueGroup: '',
  editorialPriority: 3,
  evergreenClass: 'medium',
  isSensitive: false,
  needsReview: false,
  enrichedManually: false,
  contentOrigin: 'manual',
  sourcePlatform: '',
  sourcePostUrl: '',
  sourcePostId: '',
  representationTags: '',
  themeTags: '',
  creators: [],
}

export function ContentEditor({ mode, initialItem, onSaved }: ContentEditorProps) {
  const createItem  = useMutation(api.contentItems.create)
  const updateItem  = useMutation(api.contentItems.update)
  const approveItem = useMutation(api.contentItems.approve)
  const archiveItem = useMutation(api.contentItems.archive)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suggestTags = useAction(api.actions.ai.suggestTags as any)

  const [form, setForm] = useState<FormData>(
    initialItem ? itemToForm(initialItem) : DEFAULT_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<Id<'contentItems'> | null>(
    initialItem?._id ?? null
  )

  function update(partial: Partial<FormData>) {
    setForm(f => ({ ...f, ...partial }))
  }

  function parseTagsArray(str: string): string[] {
    return str.split(',').map(s => s.trim()).filter(Boolean)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('El título es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        const id = await createItem({
          contentType: form.contentType,
          title: form.title.trim(),
          summary: form.summary || undefined,
          longDescription: form.longDescription || undefined,
          franchise: form.franchise || undefined,
          publisher: form.publisher || undefined,
          characters: parseTagsArray(form.characters),
          creators: form.creators,
          representationTags: parseTagsArray(form.representationTags),
          themeTags: parseTagsArray(form.themeTags),
          buyLink: form.buyLink || undefined,
          topicFatigueGroup: form.topicFatigueGroup || undefined,
          editorialPriority: form.editorialPriority,
          evergreenClass: form.evergreenClass,
          isSensitive: form.isSensitive,
          contentOrigin: form.contentOrigin,
          sourcePlatform: form.sourcePlatform || undefined,
          sourcePostUrl: form.sourcePostUrl || undefined,
          sourcePostId: form.sourcePostId || undefined,
        })
        setSavedId(id)
        onSaved?.(id)
      } else if (savedId) {
        await updateItem({
          id: savedId,
          patch: {
            title: form.title.trim(),
            summary: form.summary || undefined,
            longDescription: form.longDescription || undefined,
            franchise: form.franchise || undefined,
            publisher: form.publisher || undefined,
            characters: parseTagsArray(form.characters),
            creators: form.creators,
            representationTags: parseTagsArray(form.representationTags),
            themeTags: parseTagsArray(form.themeTags),
            buyLink: form.buyLink || undefined,
            topicFatigueGroup: form.topicFatigueGroup || undefined,
            editorialPriority: form.editorialPriority,
            evergreenClass: form.evergreenClass,
            isSensitive: form.isSensitive,
            needsReview: form.needsReview,
            enrichedManually: form.enrichedManually,
          },
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const canApprove = !!(savedId && ['draft', 'researching', 'in_review'].includes(initialItem?.status ?? ''))

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {/* Publication flow stepper */}
      {mode === 'edit' && initialItem && (
        <FlowStepper status={initialItem.status} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {mode === 'create' ? 'Nuevo ítem' : form.title || 'Editar ítem'}
          </h1>
          {initialItem && (
            <div className="mt-2 flex items-center gap-2">
              <OriginBadge
                contentOrigin={initialItem.contentOrigin}
                sourcePlatform={initialItem.sourcePlatform}
                enrichedManually={form.enrichedManually}
              />
              <span className="text-xs text-gray-400">slug: {initialItem.slug}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {canApprove && (
            <button
              type="button"
              onClick={() => approveItem({ id: savedId! })}
              className="px-4 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              ✓ Aprobar ítem
            </button>
          )}
          {savedId && !['archived', 'approved', 'published'].includes(initialItem?.status ?? '') && (
            <button
              type="button"
              onClick={() => {
                if (confirm('¿Archivar este ítem?')) archiveItem({ id: savedId })
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Archivar
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Research Assistant — create mode only */}
      {mode === 'create' && (
        <Section title="Asistente de investigación IA">
          <ResearchAssistant
            onApply={proposal => {
              update({
                ...(proposal.title                ? { title: proposal.title }                                                                              : {}),
                ...(proposal.contentType          ? { contentType: proposal.contentType as ContentType }                                                   : {}),
                ...(proposal.summary              ? { summary: proposal.summary }                                                                          : {}),
                ...(proposal.franchise            ? { franchise: proposal.franchise }                                                                      : {}),
                ...(proposal.publisher            ? { publisher: proposal.publisher }                                                                      : {}),
                ...(proposal.characters?.length   ? { characters: proposal.characters.join(', ') }                                                        : {}),
                ...(proposal.creators?.length     ? { creators: proposal.creators.map(c => ({ role: c.role as CreatorRole, name: c.name })) }            : {}),
                ...(proposal.representationTags?.length ? { representationTags: proposal.representationTags.join(', ') }                                  : {}),
                ...(proposal.themeTags?.length    ? { themeTags: proposal.themeTags.join(', ') }                                                          : {}),
                ...(proposal.buyLink              ? { buyLink: proposal.buyLink }                                                                          : {}),
              })
            }}
          />
        </Section>
      )}

      {/* Basic fields */}
      <Section title="Información básica">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de contenido" required>
            <select
              value={form.contentType}
              onChange={e => update({ contentType: e.target.value as ContentType })}
              className={INPUT_CLASS}
            >
              {CONTENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Origen" required>
            <select
              value={form.contentOrigin}
              onChange={e => update({ contentOrigin: e.target.value as ContentOrigin })}
              disabled={mode === 'edit'}
              className={INPUT_CLASS}
            >
              <option value="manual">Manual</option>
              <option value="assisted">Asistido IA</option>
              <option value="imported">Importado</option>
            </select>
          </Field>
        </div>

        <Field label="Título" required>
          <input
            type="text"
            value={form.title}
            onChange={e => update({ title: e.target.value })}
            className={INPUT_CLASS}
            placeholder="Título del ítem"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Franquicia / Serie">
            <input
              type="text"
              value={form.franchise}
              onChange={e => update({ franchise: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Editorial / Publisher">
            <input
              type="text"
              value={form.publisher}
              onChange={e => update({ publisher: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Field label="Resumen">
          <textarea
            value={form.summary}
            onChange={e => update({ summary: e.target.value })}
            rows={2}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Descripción larga">
          <textarea
            value={form.longDescription}
            onChange={e => update({ longDescription: e.target.value })}
            rows={5}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Enlace de compra">
          <input
            type="url"
            value={form.buyLink}
            onChange={e => update({ buyLink: e.target.value })}
            className={INPUT_CLASS}
            placeholder="https://..."
          />
        </Field>
      </Section>

      {/* Creators */}
      <Section title="Creadores/as">
        <CreatorsEditor creators={form.creators} onChange={c => update({ creators: c })} />
      </Section>

      {/* Characters & tags */}
      <Section title="Personajes y etiquetas">
        <Field label="Personajes" hint="Separados por coma">
          <input
            type="text"
            value={form.characters}
            onChange={e => update({ characters: e.target.value })}
            className={INPUT_CLASS}
            placeholder="Miles Morales, Kamala Khan, ..."
          />
        </Field>
        <Field label="Etiquetas de representación" hint="Separadas por coma">
          <div className="flex gap-2">
            <input
              type="text"
              value={form.representationTags}
              onChange={e => update({ representationTags: e.target.value })}
              className={INPUT_CLASS}
              placeholder="afrolatino, muslima, LGBTQ+, ..."
            />
            <SuggestTagsButton
              text={`${form.title} ${form.summary} ${form.longDescription}`}
              suggestTags={suggestTags}
              onSuggested={({ representationTags, themeTags }) => {
                if (representationTags.length) update({ representationTags: representationTags.join(', ') })
                if (themeTags.length) update({ themeTags: themeTags.join(', ') })
              }}
            />
          </div>
        </Field>
        <Field label="Etiquetas temáticas" hint="Separadas por coma">
          <input
            type="text"
            value={form.themeTags}
            onChange={e => update({ themeTags: e.target.value })}
            className={INPUT_CLASS}
            placeholder="superhéroes, independiente, ..."
          />
        </Field>
      </Section>

      {/* Editorial metadata */}
      <Section title="Metadatos editoriales">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Prioridad editorial">
            <select
              value={form.editorialPriority}
              onChange={e => update({ editorialPriority: Number(e.target.value) })}
              className={INPUT_CLASS}
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>

          <Field label="Evergreen">
            <select
              value={form.evergreenClass}
              onChange={e => update({ evergreenClass: e.target.value as EvergreenClass })}
              className={INPUT_CLASS}
            >
              {EVERGREEN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Grupo de fatiga temática">
            <input
              type="text"
              value={form.topicFatigueGroup}
              onChange={e => update({ topicFatigueGroup: e.target.value })}
              className={INPUT_CLASS}
              placeholder="ej: marvel-x-men"
            />
          </Field>
        </div>

        <div className="flex gap-6 mt-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSensitive}
              onChange={e => update({ isSensitive: e.target.checked })}
              className="rounded border-gray-300 text-indigo-600"
            />
            Contenido sensible
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.needsReview}
              onChange={e => update({ needsReview: e.target.checked })}
              className="rounded border-gray-300 text-indigo-600"
            />
            Requiere revisión
          </label>

          {mode === 'edit' && initialItem?.contentOrigin === 'imported' && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enrichedManually}
                onChange={e => update({ enrichedManually: e.target.checked })}
                disabled={initialItem.enrichedManually}
                className="rounded border-gray-300 text-indigo-600 disabled:opacity-50"
              />
              Curado manualmente
            </label>
          )}
        </div>
      </Section>

      {/* Source info (read-only for edit, editable for create when imported) */}
      {(form.contentOrigin === 'imported' || mode === 'edit') && (
        <Section title="Trazabilidad de origen">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plataforma">
              <select
                value={form.sourcePlatform}
                onChange={e => update({ sourcePlatform: e.target.value as 'tumblr' | 'x' | '' })}
                disabled={mode === 'edit'}
                className={INPUT_CLASS}
              >
                <option value="">Sin plataforma</option>
                <option value="tumblr">Tumblr</option>
                <option value="x">X / Twitter</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="URL del post original">
              <input
                type="url"
                value={form.sourcePostUrl}
                onChange={e => update({ sourcePostUrl: e.target.value })}
                disabled={mode === 'edit'}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="ID del post original">
              <input
                type="text"
                value={form.sourcePostId}
                onChange={e => update({ sourcePostId: e.target.value })}
                disabled={mode === 'edit'}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        </Section>
      )}

      {/* Media — only shown on edit once we have an ID */}
      {savedId && (
        <Section title="Imágenes">
          <MediaUploader
            contentItemId={savedId}
            media={initialItem?.media ?? []}
            onUploaded={() => {/* query refreshes reactively */}}
          />
        </Section>
      )}
      {mode === 'create' && !savedId && (
        <p className="text-sm text-gray-400 italic">
          Guarda el ítem primero para poder subir imágenes.
        </p>
      )}

      {/* Variants & Publishing — edit mode only */}
      {mode === 'edit' && savedId && (
        <Section title="Variantes de publicación">
          <VariantPanel contentItemId={savedId} itemStatus={initialItem?.status ?? 'draft'} />
        </Section>
      )}
    </form>
  )
}

// ── FlowStepper ──────────────────────────────────────────────────────────────

const FLOW_STEPS: { status: string; label: string; hint: string }[] = [
  { status: 'draft',      label: 'Borrador',    hint: 'Completa los campos y guarda' },
  { status: 'in_review',  label: 'En revisión', hint: 'Revisa la información' },
  { status: 'approved',   label: 'Aprobado',    hint: 'Crea y aprueba variantes' },
  { status: 'published',  label: 'Publicado',   hint: 'Publicado en canales' },
]

function FlowStepper({ status }: { status: string }) {
  const activeIdx = FLOW_STEPS.findIndex(s => s.status === status)
  const isArchived = status === 'archived'
  const isBlocked  = status === 'blocked'

  if (isArchived || isBlocked) {
    return (
      <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
        isBlocked ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-500'
      }`}>
        {isBlocked ? '⛔ Bloqueado — revisar antes de continuar' : '📦 Archivado'}
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
      <div className="flex items-center gap-0">
        {FLOW_STEPS.map((step, idx) => {
          const done    = idx < activeIdx
          const current = idx === activeIdx
          const pending = idx > activeIdx
          return (
            <div key={step.status} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  done    ? 'bg-green-500 border-green-500 text-white' :
                  current ? 'bg-indigo-600 border-indigo-600 text-white' :
                            'bg-white border-gray-300 text-gray-400'
                }`}>
                  {done ? '✓' : idx + 1}
                </div>
                <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                  current ? 'text-indigo-700' : done ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
              </div>
              {idx < FLOW_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>
      {activeIdx >= 0 && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          {FLOW_STEPS[activeIdx]?.hint}
          {status === 'approved' && ' → luego genera el calendario en el Planner'}
        </p>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  'mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
        {hint && <span className="text-gray-400 font-normal ml-2 text-xs">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

function SuggestTagsButton({
  text,
  suggestTags,
  onSuggested,
}: {
  text: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  suggestTags: (args: { text: string }) => Promise<any>
  onSuggested: (tags: { representationTags: string[]; themeTags: string[] }) => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (!text.trim()) return
    setLoading(true)
    try {
      const result = await suggestTags({ text })
      onSuggested(result)
    } catch (err) {
      console.error('suggestTags error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || !text.trim()}
      className="flex-shrink-0 px-3 py-2 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Sugiriendo…' : 'Sugerir tags IA'}
    </button>
  )
}
