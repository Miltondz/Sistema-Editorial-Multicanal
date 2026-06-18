'use client'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'tumblr' | 'x'

interface RuleFields {
  cooldownDaysItem:      number
  cooldownDaysTopic:     number
  weightClicks:          number
  weightEngagement:      number
  weightEvergreen:       number
  weightManualPriority:  number
  weightRecencyPenalty:  number
  weightTopicFatigue:    number
  originBoostManual:     number
  originBoostAssisted:   number
  originBoostEnriched:   number
  originBoostImported:   number
  quotaComic:            number
  quotaLibro:            number
  quotaCosplay:          number
  quotaArticulo:         number
  quotaOtros:            number
}

const WEIGHT_FIELDS: Array<{ key: keyof RuleFields; label: string; hint?: string }> = [
  { key: 'weightClicks',         label: 'Peso clicks',         hint: '0–1' },
  { key: 'weightEngagement',     label: 'Peso engagement',     hint: '0–1' },
  { key: 'weightEvergreen',      label: 'Peso evergreen',      hint: '0–1' },
  { key: 'weightManualPriority', label: 'Peso prioridad',      hint: '0–1' },
  { key: 'weightRecencyPenalty', label: 'Penalización recencia', hint: '0–1' },
  { key: 'weightTopicFatigue',   label: 'Penalización fatiga', hint: '0–1' },
]

const BOOST_FIELDS: Array<{ key: keyof RuleFields; label: string }> = [
  { key: 'originBoostManual',    label: 'Boost manual' },
  { key: 'originBoostAssisted',  label: 'Boost asistido IA' },
  { key: 'originBoostEnriched',  label: 'Boost importado + curado' },
  { key: 'originBoostImported',  label: 'Boost importado sin curar' },
]

const QUOTA_FIELDS: Array<{ key: keyof RuleFields; label: string }> = [
  { key: 'quotaComic',    label: 'Comic (30%)' },
  { key: 'quotaLibro',    label: 'Libro (25%)' },
  { key: 'quotaCosplay',  label: 'Cosplay (20%)' },
  { key: 'quotaArticulo', label: 'Artículo (15%)' },
  { key: 'quotaOtros',    label: 'Otros (10%)' },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRules = useQuery(api.scoringRules.getAll as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateRule = useMutation(api.scoringRules.update as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seedRules  = useMutation(api.scoringRules.seed as any)

  const [activeChannel, setActiveChannel] = useState<Channel>('tumblr')
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<string | null>(null)

  const hasRules = (allRules as unknown[])?.length > 0

  async function handleSeed() {
    setSeeding(true)
    setSeedMsg(null)
    try {
      const res = await seedRules({})
      setSeedMsg((res as { message?: string })?.message ?? 'Reglas creadas')
    } catch (err) {
      setSeedMsg(err instanceof Error ? err.message : 'Error')
    } finally {
      setSeeding(false)
    }
  }

  if (allRules === undefined) {
    return <div className="p-8 text-sm text-gray-400">Cargando configuración…</div>
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rule = (allRules as any[]).find(r => r.channel === activeChannel)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración de scoring</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pesos, cuotas, cooldowns y boosts por canal. Los cambios afectan la próxima generación de calendario.
        </p>
      </div>

      {/* Seed banner */}
      {!hasRules && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-yellow-800">No hay reglas de scoring</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Crea los valores por defecto para empezar a generar calendarios.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="ml-4 px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
          >
            {seeding ? 'Creando…' : 'Crear defaults'}
          </button>
        </div>
      )}
      {seedMsg && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          {seedMsg}
        </div>
      )}

      {/* Channel tabs */}
      {hasRules && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit mb-6">
          {(['tumblr', 'x'] as Channel[]).map(ch => (
            <button
              key={ch}
              type="button"
              onClick={() => setActiveChannel(ch)}
              className={`px-6 py-2 text-sm font-medium transition-colors ${
                activeChannel === ch
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {ch === 'tumblr' ? 'Tumblr' : 'X'}
            </button>
          ))}
        </div>
      )}

      {rule ? (
        <RuleEditor
          key={rule._id}
          rule={rule}
          onSave={async (patch) => {
            await updateRule({ id: rule._id, patch })
          }}
        />
      ) : hasRules ? (
        <div className="text-sm text-gray-400">
          No hay reglas para {activeChannel}. Ejecuta seed.
        </div>
      ) : null}
    </div>
  )
}

// ── RuleEditor component ──────────────────────────────────────────────────────

function RuleEditor({
  rule,
  onSave,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rule: any
  onSave: (patch: Partial<RuleFields>) => Promise<void>
}) {
  const [fields, setFields] = useState<RuleFields>({
    cooldownDaysItem:      rule.cooldownDaysItem,
    cooldownDaysTopic:     rule.cooldownDaysTopic,
    weightClicks:          rule.weightClicks,
    weightEngagement:      rule.weightEngagement,
    weightEvergreen:       rule.weightEvergreen,
    weightManualPriority:  rule.weightManualPriority,
    weightRecencyPenalty:  rule.weightRecencyPenalty,
    weightTopicFatigue:    rule.weightTopicFatigue,
    originBoostManual:     rule.originBoostManual,
    originBoostAssisted:   rule.originBoostAssisted,
    originBoostEnriched:   rule.originBoostEnriched,
    originBoostImported:   rule.originBoostImported,
    quotaComic:            rule.quotaComic,
    quotaLibro:            rule.quotaLibro,
    quotaCosplay:          rule.quotaCosplay,
    quotaArticulo:         rule.quotaArticulo,
    quotaOtros:            rule.quotaOtros,
  })
  const [saving, setSaving]   = useState(false)
  const [saved,  setSaved]    = useState(false)
  const [error,  setError]    = useState<string | null>(null)

  // Sync if parent rule changes (channel switch)
  useEffect(() => {
    setFields({
      cooldownDaysItem:      rule.cooldownDaysItem,
      cooldownDaysTopic:     rule.cooldownDaysTopic,
      weightClicks:          rule.weightClicks,
      weightEngagement:      rule.weightEngagement,
      weightEvergreen:       rule.weightEvergreen,
      weightManualPriority:  rule.weightManualPriority,
      weightRecencyPenalty:  rule.weightRecencyPenalty,
      weightTopicFatigue:    rule.weightTopicFatigue,
      originBoostManual:     rule.originBoostManual,
      originBoostAssisted:   rule.originBoostAssisted,
      originBoostEnriched:   rule.originBoostEnriched,
      originBoostImported:   rule.originBoostImported,
      quotaComic:            rule.quotaComic,
      quotaLibro:            rule.quotaLibro,
      quotaCosplay:          rule.quotaCosplay,
      quotaArticulo:         rule.quotaArticulo,
      quotaOtros:            rule.quotaOtros,
    })
  }, [rule._id])

  function setNum(key: keyof RuleFields, raw: string) {
    const n = parseFloat(raw)
    if (!isNaN(n)) setFields(f => ({ ...f, [key]: n }))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await onSave(fields)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  // Quota sum validation
  const quotaSum = fields.quotaComic + fields.quotaLibro + fields.quotaCosplay +
                   fields.quotaArticulo + fields.quotaOtros
  const quotaOk = Math.abs(quotaSum - 1.0) < 0.005

  return (
    <div className="space-y-8">
      {/* Cooldowns */}
      <Section title="Cooldowns">
        <p className="text-xs text-gray-500 mb-4">
          Días mínimos entre publicaciones del mismo ítem o grupo temático en este canal.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Por ítem (días)"
            value={fields.cooldownDaysItem}
            onChange={v => setNum('cooldownDaysItem', v)}
            min={1} max={365} step={1}
          />
          <NumberField
            label="Por grupo temático (días)"
            value={fields.cooldownDaysTopic}
            onChange={v => setNum('cooldownDaysTopic', v)}
            min={1} max={60} step={1}
          />
        </div>
      </Section>

      {/* Weights */}
      <Section title="Pesos del score">
        <p className="text-xs text-gray-500 mb-4">
          Factores que suman en la fórmula de scoring. Los pesos deben reflejar tus prioridades editoriales.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {WEIGHT_FIELDS.map(({ key, label, hint }) => (
            <NumberField
              key={key}
              label={label}
              hint={hint}
              value={fields[key] as number}
              onChange={v => setNum(key, v)}
              min={0} max={1} step={0.01}
            />
          ))}
        </div>
      </Section>

      {/* Origin boosts */}
      <Section title="Boosts por origen">
        <p className="text-xs text-gray-500 mb-4">
          Bonificación adicional según el origen del contenido. Los ítems manual/asistido tienen mayor boost por defecto.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {BOOST_FIELDS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              value={fields[key] as number}
              onChange={v => setNum(key, v)}
              min={0} max={1} step={0.01}
            />
          ))}
        </div>
      </Section>

      {/* Quotas */}
      <Section title="Cuotas por tipo de contenido">
        <p className="text-xs text-gray-500 mb-4">
          Proporción objetivo de cada tipo en el calendario. Deben sumar 1.0.
          {' '}
          <span className={quotaOk ? 'text-green-600' : 'text-red-600 font-medium'}>
            Suma actual: {quotaSum.toFixed(2)}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-4">
          {QUOTA_FIELDS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              value={fields[key] as number}
              onChange={v => setNum(key, v)}
              min={0} max={1} step={0.01}
            />
          ))}
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !quotaOk}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Guardado correctamente.</span>
        )}
        {error && (
          <span className="text-sm text-red-600">{error}</span>
        )}
        {!quotaOk && (
          <span className="text-sm text-amber-600">Las cuotas deben sumar exactamente 1.0</span>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
        {title}
      </h2>
      {children}
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label:    string
  hint?:    string
  value:    number
  onChange: (v: string) => void
  min:      number
  max:      number
  step:     number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {hint && <span className="text-gray-400 ml-1">({hint})</span>}
      </label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
      />
    </div>
  )
}
