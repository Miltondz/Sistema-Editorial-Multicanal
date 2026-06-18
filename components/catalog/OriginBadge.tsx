import type { ContentOrigin, SourcePlatform } from '@/lib/types/domain'

interface OriginBadgeProps {
  contentOrigin: ContentOrigin
  sourcePlatform?: SourcePlatform
  enrichedManually: boolean
}

const BADGE_CONFIG = {
  manual: {
    label: 'Manual',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  assisted: {
    label: 'Asistido IA',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  imported_tumblr_raw: {
    label: 'Histórico Tumblr',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  imported_tumblr_enriched: {
    label: 'Tumblr ✦ curado',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  imported_x_raw: {
    label: 'Histórico X',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  imported_x_enriched: {
    label: 'X ✦ curado',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
} as const

function getBadgeKey(props: OriginBadgeProps): keyof typeof BADGE_CONFIG {
  if (props.contentOrigin === 'manual') return 'manual'
  if (props.contentOrigin === 'assisted') return 'assisted'
  if (props.sourcePlatform === 'tumblr') {
    return props.enrichedManually ? 'imported_tumblr_enriched' : 'imported_tumblr_raw'
  }
  if (props.sourcePlatform === 'x') {
    return props.enrichedManually ? 'imported_x_enriched' : 'imported_x_raw'
  }
  return 'imported_tumblr_raw'
}

export function OriginBadge(props: OriginBadgeProps) {
  const key = getBadgeKey(props)
  const config = BADGE_CONFIG[key]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.className}`}
    >
      {config.label}
    </span>
  )
}
