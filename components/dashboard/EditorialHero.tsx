'use client'
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'
import { BannerEditModal } from './BannerEditModal'

const DEFAULT_BANNER = {
  title: 'Diversidad en los Cómics',
  description: 'Contenido destacado: personajes que rompieron barreras en la historia del cómic.',
  badgeText: 'HOY ES UN DÍA ESPECIAL',
  imageUrl: undefined as string | undefined,
  ctaLabel: 'Ver sugerencias',
  ctaHref: '/catalog',
}

export function EditorialHero() {
  const [showEdit, setShowEdit] = useState(false)
  const fechaHoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })

  // Dynamic Convex api refs; cast required.
  const bannerData = useQuery((api.editorialBanner as any).getActive, {})
  const todayAll   = useQuery((api.specialDates as any).getTodayAll, {})
  const nextDate   = useQuery((api.specialDates as any).getNextUpcoming, {})

  const todayDates = Array.isArray(todayAll) ? (todayAll as any[]) : []
  const todayLoaded = todayAll !== undefined

  const banner = bannerData ?? (
    todayLoaded && todayDates.length > 0 ? {
      title: todayDates[0].title,
      description: todayDates[0].teaserText ?? todayDates[0].description ?? 'Una fecha especial en la historia del cómic.',
      badgeText: 'HOY ES UN DÍA ESPECIAL',
      imageUrl: todayDates[0].bannerImageUrl as string | undefined,
      ctaLabel: 'Ver ideas',
      ctaHref: '/special-dates',
    } : nextDate ? {
      title: nextDate.title,
      description: nextDate.description ?? 'Una fecha especial en la historia del cómic.',
      badgeText: 'PRÓXIMA FECHA ESPECIAL',
      imageUrl: undefined as string | undefined,
      ctaLabel: 'Ver ideas',
      ctaHref: '/special-dates',
    } : DEFAULT_BANNER
  )

  return (
    <>
      {/* Multi-banner: 2+ today dates shown side by side */}
      {todayLoaded && todayDates.length > 1 && (
        <div className="flex gap-3 mb-3">
          {(todayDates as any[]).slice(1).map((d: any) => (
            <div
              key={d._id}
              className="flex-1 rounded-2xl overflow-hidden flex items-center gap-3 px-4"
              style={{ height: 72, background: '#0B1220', minWidth: 0 }}
            >
              {d.bannerImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.bannerImageUrl} alt={d.bannerImageAlt ?? d.title} className="w-10 h-14 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Hoy también</span>
                <p className="text-white text-xs font-semibold truncate">{d.title}</p>
                {d.teaserText && <p className="text-slate-400 text-[10px] truncate">{d.teaserText}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className="relative w-full rounded-2xl overflow-hidden flex"
        style={{ height: 240, background: '#0B1220' }}
      >
        {/* Gradient overlay */}
        <div
          className="absolute inset-0 z-10"
          style={{ background: 'linear-gradient(90deg, rgba(11,18,32,1) 50%, rgba(11,18,32,0.3) 80%, transparent 100%)' }}
        />

        {/* Right side: image or gradient */}
        <div className="absolute right-0 top-0 bottom-0 w-2/5 overflow-hidden">
          {banner.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 30%, #EC4899 60%, #F59E0B 100%)', opacity: 0.85 }}>
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <svg viewBox="0 0 200 200" className="w-48 h-48" fill="white">
                  <polygon points="100,10 190,55 190,145 100,190 10,145 10,55" />
                  <polygon points="100,30 170,65 170,135 100,170 30,135 30,65" opacity="0.5" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Date badge */}
        <div className="absolute top-5 right-5 z-20 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5">
          <span className="text-white text-xs font-medium">{fechaHoy}</span>
        </div>

        {/* Edit button */}
        <button
          onClick={() => setShowEdit(true)}
          className="absolute top-5 right-[110px] z-20 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5 hover:bg-white/20 transition-colors"
        >
          <span className="text-white text-xs font-medium">✏ Editar</span>
        </button>

        {/* Left content */}
        <div className="relative z-20 flex flex-col justify-center px-10 max-w-lg">
          <div className="mb-3">
            <span
              className="inline-block bg-indigo-600 text-white rounded-full px-3 py-1 uppercase tracking-widest font-semibold"
              style={{ fontSize: 10 }}
            >
              {banner.badgeText}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white leading-tight mb-2">{banner.title}</h2>
          <p className="text-slate-300 text-sm mb-5 leading-relaxed">{banner.description}</p>
          <div className="flex items-center gap-3">
            <Link
              href={banner.ctaHref ?? '/catalog'}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all duration-150 hover:opacity-90"
              style={{ background: '#6366F1' }}
            >
              {banner.ctaLabel}
            </Link>
            <Link href="/special-dates" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
              Fechas especiales →
            </Link>
          </div>
        </div>
      </div>

      <BannerEditModal open={showEdit} onClose={() => setShowEdit(false)} />
    </>
  )
}
