'use client'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

interface IntegrationCardProps {
  name: string
  handle?: string
  description: string
  status: 'connected' | 'disconnected' | 'unknown'
  usageCount: number | undefined
  usageMax: number
  usageLabel: string
  docsUrl: string
  color: string
  initial: string
  features: string[]
}

function IntegrationCard({ name, handle, description, status, usageCount, usageMax, usageLabel, docsUrl, color, initial, features }: IntegrationCardProps) {
  const pct = usageCount !== undefined && usageMax > 0 ? Math.min(usageCount / usageMax, 1) : 0
  const barColor = pct >= 0.9 ? '#EF4444' : pct >= 0.8 ? '#F59E0B' : '#22C55E'
  const statusStyle = {
    connected:    { dot: 'bg-green-500', label: 'Conectado',    badge: 'bg-green-50 text-green-700' },
    disconnected: { dot: 'bg-red-500',   label: 'Desconectado', badge: 'bg-red-50 text-red-700' },
    unknown:      { dot: 'bg-gray-400',  label: 'Sin configurar',badge: 'bg-gray-100 text-gray-500' },
  }[status]

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
            style={{ background: color }}
          >
            {initial}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{name}</h3>
            {handle && <p className="text-xs text-gray-400">{handle}</p>}
          </div>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusStyle.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
          {statusStyle.label}
        </span>
      </div>

      <p className="text-sm text-gray-500 mb-5">{description}</p>

      {/* Usage bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{usageLabel}</span>
          <span className="font-medium">
            {usageCount !== undefined ? usageCount : '—'} / {usageMax}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct * 100}%`, background: barColor }}
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Este mes · límite editorial</p>
      </div>

      {/* Features */}
      <div className="mb-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Funcionalidades</p>
        <div className="flex flex-wrap gap-1.5">
          {features.map(f => (
            <span key={f} className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{f}</span>
          ))}
        </div>
      </div>

      {/* Config note */}
      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
        <span className="font-medium">Configuración:</span> Las credenciales se gestionan desde el panel de Convex Dashboard → Environment Variables.
        {' '}
        <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
          Ver documentación →
        </a>
      </div>
    </div>
  )
}

function ComingSoonCard({
  name, description, initial, color, badge, badgeColor,
}: {
  name: string; description: string; initial: string; color: string
  badge?: string; badgeColor?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-[#E5EAF2] p-6 opacity-70">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: color }}>
          {initial}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{name}</h3>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${badgeColor ?? 'bg-slate-100 text-slate-500'}`}>
            {badge ?? 'Próximamente'}
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  )
}

export default function IntegrationsPage() {
  // Cast required — Convex Proxy resolves at runtime.
  const xCount      = useQuery((api.publicationLog as any).getXWriteCountThisMonth, {}) as number | undefined
  const tumblrCount = useQuery((api.publicationLog as any).getTumblrWriteCountThisMonth, {}) as number | undefined

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Integraciones</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Canales conectados y uso de API. Las credenciales se configuran en Convex Dashboard.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <IntegrationCard
          name="X (Twitter)"
          handle="@SuperheroesInColor"
          description="Publicación automática de contenido editorial. Límite de 500 publicaciones por mes en el plan gratuito de la API v2."
          status="connected"
          usageCount={xCount}
          usageMax={500}
          usageLabel="Publicaciones este mes"
          docsUrl="https://developer.twitter.com/en/docs"
          color="#000000"
          initial="X"
          features={['Publicación automática', 'Programación', 'Log de errores', 'Reintentos']}
        />
        <IntegrationCard
          name="Tumblr"
          handle="superheroesincolor.tumblr.com"
          description="Publicación de contenido largo con imágenes. Compatible con galerías y texto enriquecido. Límite editorial de 500/mes."
          status="connected"
          usageCount={tumblrCount}
          usageMax={500}
          usageLabel="Publicaciones este mes"
          docsUrl="https://www.tumblr.com/docs/en/api/v2"
          color="#35465C"
          initial="T"
          features={['Publicación automática', 'Galerías de imágenes', 'Tags automáticos', 'Programación']}
        />
      </div>

      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">En desarrollo</p>
      <div className="grid grid-cols-2 gap-6 mb-8">
        <ComingSoonCard
          name="Bluesky"
          description="Red social descentralizada compatible con el protocolo AT (atproto). API pública sin límites de escritura en cuentas verificadas."
          initial="BS"
          color="#0085FF"
          badge="En desarrollo"
          badgeColor="bg-blue-50 text-blue-600"
        />
        <ComingSoonCard
          name="Threads"
          description="Plataforma de Meta basada en ActivityPub. API disponible desde 2024, compatible con publicaciones de texto e imágenes."
          initial="TH"
          color="#000000"
          badge="En desarrollo"
          badgeColor="bg-blue-50 text-blue-600"
        />
      </div>

      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Próximas integraciones</p>
      <div className="grid grid-cols-2 gap-6">
        <ComingSoonCard
          name="Instagram"
          description="Publicación de imágenes y carruseles vía Instagram Graph API."
          initial="IG"
          color="#E1306C"
          badge="Próximamente"
          badgeColor="bg-slate-100 text-slate-500"
        />
        <ComingSoonCard
          name="Pinterest"
          description="Publicación de pines con imágenes y enlaces editoriales."
          initial="P"
          color="#E60023"
          badge="Próximamente"
          badgeColor="bg-slate-100 text-slate-500"
        />
      </div>
    </div>
  )
}
