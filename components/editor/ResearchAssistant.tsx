'use client'
import { useState } from 'react'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'

interface Proposal {
  title?: string
  contentType?: string
  summary?: string
  franchise?: string
  publisher?: string
  characters?: string[]
  creators?: Array<{ role: string; name: string }>
  representationTags?: string[]
  themeTags?: string[]
  buyLink?: string
  evergreenClass?: string
  editorialPriority?: number
}

interface ResearchAssistantProps {
  onApply: (proposal: Proposal) => void
}

export function ResearchAssistant({ onApply }: ResearchAssistantProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const researchContent = useAction(api.actions.ai.researchContent as any)

  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [proposal, setProposal]   = useState<Proposal | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [duplicates, setDuplicates] = useState<Array<{ id: string; title: string; similarity: number }>>([])
  const [applied, setApplied]     = useState(false)

  async function handleResearch() {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    setProposal(null)
    setDuplicates([])
    setApplied(false)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await researchContent({ input: input.trim() }) as any
      setProposal(result.proposedItem as Proposal)
      setConfidence(result.confidence ?? 0)
      setDuplicates(result.possibleDuplicates ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (!proposal) return
    onApply(proposal)
    setApplied(true)
  }

  return (
    <div className="space-y-4">
      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleResearch()}
          placeholder="Pega una URL, título o descripción del contenido…"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={handleResearch}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Investigando…' : 'Investigar con IA'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Duplicate warning */}
      {duplicates.length > 0 && (
        <div className="rounded-md bg-yellow-50 border border-yellow-300 px-4 py-3 text-sm text-yellow-800">
          <p className="font-semibold mb-1">⚠ Posible duplicado detectado</p>
          {duplicates.map(d => (
            <p key={d.id} className="text-xs">
              &ldquo;{d.title}&rdquo; (similitud: {Math.round(d.similarity * 100)}%)
              {' — '}
              <a href={`/catalog/${d.id}`} target="_blank" rel="noopener noreferrer"
                className="underline">
                Ver ítem
              </a>
            </p>
          ))}
        </div>
      )}

      {/* Proposal */}
      {proposal && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Propuesta de ficha</span>
              <ConfidenceBadge value={confidence} />
            </div>
            {applied ? (
              <span className="text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">
                ✓ Aplicada al formulario
              </span>
            ) : (
              <button
                type="button"
                onClick={handleApply}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Usar esta ficha
              </button>
            )}
          </div>

          {/* Fields preview */}
          <div className="px-4 py-3 space-y-2 text-sm">
            {proposal.title && (
              <Row label="Título">{proposal.title}</Row>
            )}
            {proposal.contentType && (
              <Row label="Tipo">{proposal.contentType}</Row>
            )}
            {proposal.summary && (
              <Row label="Resumen">{proposal.summary}</Row>
            )}
            {proposal.franchise && (
              <Row label="Franquicia">{proposal.franchise}</Row>
            )}
            {proposal.publisher && (
              <Row label="Editorial">{proposal.publisher}</Row>
            )}
            {proposal.creators && proposal.creators.length > 0 && (
              <Row label="Creadores">
                {proposal.creators.map(c => `${c.name} (${c.role})`).join(', ')}
              </Row>
            )}
            {proposal.representationTags && proposal.representationTags.length > 0 && (
              <Row label="Tags representación">
                <TagList tags={proposal.representationTags} color="blue" />
              </Row>
            )}
            {proposal.themeTags && proposal.themeTags.length > 0 && (
              <Row label="Tags temáticos">
                <TagList tags={proposal.themeTags} color="purple" />
              </Row>
            )}
            {proposal.buyLink && (
              <Row label="Enlace">
                <a href={proposal.buyLink} target="_blank" rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline truncate block">
                  {proposal.buyLink}
                </a>
              </Row>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 70 ? 'bg-green-100 text-green-700' :
    pct >= 40 ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {pct}% confianza
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs font-medium text-gray-500 min-w-28 pt-0.5">{label}:</span>
      <span className="text-gray-800 flex-1">{children}</span>
    </div>
  )
}

function TagList({ tags, color }: { tags: string[]; color: 'blue' | 'purple' }) {
  const cls = color === 'blue'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-purple-100 text-purple-700'
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map(t => (
        <span key={t} className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{t}</span>
      ))}
    </span>
  )
}
