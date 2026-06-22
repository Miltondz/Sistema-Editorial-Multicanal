'use client'
import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

export default function ImageUpload({
  currentUrl,
  hasStorageImage,
  onUploaded,
  onClear,
  label = 'Imagen propia',
}: {
  currentUrl?: string | null
  hasStorageImage?: boolean
  onUploaded: (storageId: Id<'_storage'>) => Promise<unknown>
  onClear?: () => Promise<unknown>
  label?: string
}) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const generateUploadUrl = useMutation(api.catalog.generateUploadUrl)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return setError('Solo imágenes')
    setUploading(true); setError(null)
    try {
      const uploadUrl = await generateUploadUrl()
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!res.ok) throw new Error('Upload falló')
      const { storageId } = await res.json() as { storageId: Id<'_storage'> }
      await onUploaded(storageId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>

      {/* Preview */}
      {currentUrl && (
        <div className="relative mb-2 rounded-lg overflow-hidden"
          style={{ height: 120, background: '#1e293b' }}>
          <img src={currentUrl} alt="preview"
            className="w-full h-full object-cover object-top" />
          {hasStorageImage && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-opacity"
              style={{ background: '#dc2626', color: '#fff' }}
              title="Eliminar imagen propia"
            >×</button>
          )}
          {hasStorageImage && (
            <div className="absolute bottom-1.5 left-1.5">
              <span className="px-1.5 py-0.5 rounded text-xs"
                style={{ background: '#059669', color: '#fff', fontSize: 10 }}>
                ✓ Storage
              </span>
            </div>
          )}
        </div>
      )}

      {/* Upload button */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
        style={{
          background: uploading ? '#1e293b' : '#0f172a',
          border: '1px dashed #334155',
          color: uploading ? '#64748b' : '#94a3b8',
          cursor: uploading ? 'not-allowed' : 'pointer',
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {uploading ? 'Subiendo…' : hasStorageImage ? 'Cambiar imagen' : 'Subir imagen'}
      </button>

      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
