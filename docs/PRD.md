# PRD — Sistema Editorial Multicanal SuperheroesInColor
# Versión 5.0 — Convex + Next.js — Documento ejecutable para Claude Code

---

## 0. Resumen ejecutivo

SuperheroesInColor necesita una plataforma editorial que convierta un archivo histórico amplio y subutilizado en una operación continua de publicación, recirculación y creación de contenido nuevo para Tumblr y X.

El producto es un CMS editorial especializado que cubre seis capacidades integradas: rescate histórico, modelado estructurado del catálogo, creación manual de nuevas piezas, investigación y enriquecimiento asistido por IA, calendarización automática, y publicación con retroalimentación analítica.

**Meta**: reducir al mínimo la operación manual repetitiva preservando la curaduría editorial diferenciada del proyecto (cómics y cultura pop con perspectiva de diversidad racial y cultural).

---

## 1. Stack técnico (fijo, no negociable)

| Capa | Tecnología | Tier |
|---|---|---|
| Framework | Next.js 14, App Router, TypeScript estricto | — |
| Deploy | Vercel | Free |
| Backend / DB / Realtime | Convex | Free (1M calls/mes, 1GB storage) |
| Auth | Convex Auth | Free |
| File Storage | Convex File Storage | Free (1GB) |
| IA | Anthropic API — claude-sonnet-4-6 | Pay-as-you-go |
| Cron / Scheduled jobs | Convex Scheduled Functions | Free |
| Publicación | Tumblr API v2 + X API v2 free tier | Free / Free |
| Importación X | Export JSON oficial de Twitter/X | Manual, una vez |
| Estilos | Tailwind CSS v3 | — |

**Restricciones de free tier que afectan el diseño:**
- Convex: 1M function calls/mes, 1GB file storage, DB sin límite de filas pero con límite de bandwidth
- X API v2 free: 500 escrituras/mes (≈16/día), sin lectura de timeline propio
- Tumblr API v2: sin límites prácticos para este volumen

**Convenciones de arquitectura Convex + Next.js:**
- Todo TypeScript con `strict: true`
- El schema de datos vive en `convex/schema.ts` — fuente de verdad del modelo de datos
- Las **queries** (lectura) y **mutations** (escritura) viven en `convex/` y se llaman directamente desde componentes React via hooks de Convex
- Las **actions** de Convex se usan para lógica con efectos secundarios: llamadas a APIs externas (Tumblr, X, Anthropic), importadores
- Las **Scheduled Functions** de Convex reemplazan completamente los cron jobs (no se necesita `vercel.json` para cron)
- Next.js Route Handlers (`/app/api/`) se usan SOLO para webhooks externos que necesitan endpoint HTTP público
- No se usan Server Actions de Next.js — las mutaciones van directo via `useMutation()` de Convex
- El cliente de Convex tiene acceso tipado end-to-end: el schema define los tipos, no hace falta un cliente admin separado

---

## 2. Variables de entorno requeridas

```env
# Convex
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOY_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Tumblr
TUMBLR_CONSUMER_KEY=
TUMBLR_CONSUMER_SECRET=
TUMBLR_OAUTH_TOKEN=
TUMBLR_OAUTH_TOKEN_SECRET=
TUMBLR_BLOG_NAME=

# X / Twitter
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=

# App
NEXT_PUBLIC_APP_URL=
```

> Nota: Convex no necesita `CRON_SECRET` — las Scheduled Functions son internas y no exponen endpoints HTTP públicos.

---

## 3. Schema de Convex (`convex/schema.ts`)

> Este archivo es la fuente de verdad del modelo de datos. Reemplaza completamente el SQL del PRD anterior. Se crea en la Entrega 1 completo y no cambia en entregas posteriores.

```typescript
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// ─────────────────────────────────────────
// VALIDATORS REUTILIZABLES
// ─────────────────────────────────────────

const contentType = v.union(
  v.literal('comic'), v.literal('libro'), v.literal('autor'),
  v.literal('cosplay'), v.literal('articulo'), v.literal('poster'),
  v.literal('pelicula'), v.literal('personaje'), v.literal('coleccion')
)

const contentStatus = v.union(
  v.literal('draft'), v.literal('researching'), v.literal('in_review'),
  v.literal('approved'), v.literal('scheduled'), v.literal('published'),
  v.literal('archived'), v.literal('blocked')
)

const contentOrigin = v.union(
  v.literal('imported'),  // vino de importación histórica (Tumblr o X)
  v.literal('manual'),    // creado desde cero en el CMS
  v.literal('assisted')   // creado con asistente IA como punto de partida
)

const channel = v.union(v.literal('tumblr'), v.literal('x'))

const variantStatus = v.union(
  v.literal('not_started'), v.literal('generated'), v.literal('edited'),
  v.literal('approved'), v.literal('scheduled'), v.literal('published'),
  v.literal('failed'), v.literal('disabled')
)

const slotStatus = v.union(
  v.literal('empty'), v.literal('planned'), v.literal('locked'),
  v.literal('ready'), v.literal('publishing'), v.literal('published'),
  v.literal('skipped'), v.literal('failed')
)

const dayPart = v.union(
  v.literal('morning'), v.literal('afternoon'), v.literal('evening')
)

const publishStatus = v.union(
  v.literal('success'), v.literal('failed'),
  v.literal('retrying'), v.literal('skipped')
)

const evergreenClass = v.union(
  v.literal('high'), v.literal('medium'), v.literal('low')
)

const creatorRole = v.union(
  v.literal('writer'), v.literal('artist'), v.literal('cover_artist'),
  v.literal('colorist'), v.literal('photographer'), v.literal('other')
)

const creator = v.object({
  role: creatorRole,
  name: v.string(),
})

// ─────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────

export default defineSchema({

  // ── CONTENT ITEMS ──────────────────────
  contentItems: defineTable({
    slug: v.string(),
    contentType: contentType,
    title: v.string(),
    summary: v.optional(v.string()),
    longDescription: v.optional(v.string()),
    franchise: v.optional(v.string()),
    publisher: v.optional(v.string()),
    characters: v.array(v.string()),
    creators: v.array(creator),
    representationTags: v.array(v.string()),
    themeTags: v.array(v.string()),
    buyLink: v.optional(v.string()),

    // Trazabilidad de origen — inmutables una vez establecidos
    contentOrigin: contentOrigin,
    sourcePlatform: v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    sourcePostUrl: v.optional(v.string()),
    sourcePostId: v.optional(v.string()),
    sourceDate: v.optional(v.number()), // timestamp ms

    // Enriquecimiento posterior — mutable
    // true si un ítem importado fue editado manualmente después de la importación
    enrichedManually: v.boolean(),

    topicFatigueGroup: v.optional(v.string()),
    editorialPriority: v.number(), // 1-5
    evergreenClass: evergreenClass,
    isSensitive: v.boolean(),
    needsReview: v.boolean(),
    status: contentStatus,
    canonicalHash: v.optional(v.string()),
    importedAt: v.optional(v.number()), // timestamp ms
  })
    .index('by_status', ['status'])
    .index('by_content_type', ['contentType'])
    .index('by_canonical_hash', ['canonicalHash'])
    .index('by_franchise', ['franchise'])
    .index('by_origin', ['contentOrigin'])
    .index('by_source_platform', ['sourcePlatform'])
    .index('by_needs_review', ['needsReview'])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['contentType', 'status', 'contentOrigin'],
    }),

  // ── CONTENT VARIANTS ───────────────────
  contentVariants: defineTable({
    contentItemId: v.id('contentItems'),
    channel: channel,
    headline: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    ctaText: v.optional(v.string()),
    selectedMediaIds: v.array(v.id('mediaAssets')),
    status: variantStatus,
    versionNumber: v.number(),
    isActive: v.boolean(),
    approvedAt: v.optional(v.number()),
    publishedLastAt: v.optional(v.number()),
  })
    .index('by_item', ['contentItemId'])
    .index('by_item_and_channel', ['contentItemId', 'channel'])
    .index('by_channel_and_status', ['channel', 'status']),

  // ── MEDIA ASSETS ───────────────────────
  mediaAssets: defineTable({
    contentItemId: v.id('contentItems'),
    storageId: v.id('_storage'), // Convex file storage
    publicUrl: v.string(),
    mimeType: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSizeBytes: v.optional(v.number()),
    altText: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceKind: v.optional(v.string()),
    sortOrder: v.number(),
    isPrimary: v.boolean(),
  })
    .index('by_item', ['contentItemId']),

  // ── CHANNEL SCORES (independientes por canal) ──
  channelScores: defineTable({
    contentItemId: v.id('contentItems'),
    channel: channel,
    clickScore: v.number(),
    engagementScore: v.number(),
    reblogScore: v.number(),
    evergreenScore: v.number(),
    reuseScore: v.number(), // score compuesto final
    lastPostedAt: v.optional(v.number()),
    postCount: v.number(),
  })
    .index('by_item', ['contentItemId'])
    .index('by_item_and_channel', ['contentItemId', 'channel'])
    .index('by_channel_and_score', ['channel', 'reuseScore']),

  // ── SCHEDULE SLOTS ─────────────────────
  scheduleSlots: defineTable({
    scheduledFor: v.string(), // YYYY-MM-DD
    dayPart: dayPart,
    channel: channel,
    contentItemId: v.optional(v.id('contentItems')),
    variantId: v.optional(v.id('contentVariants')),
    contentMode: v.union(v.literal('new'), v.literal('recycled')),
    priority: v.number(),
    locked: v.boolean(),
    generationBatchId: v.optional(v.string()),
    status: slotStatus,
  })
    .index('by_date', ['scheduledFor'])
    .index('by_date_and_channel', ['scheduledFor', 'channel'])
    .index('by_status', ['status'])
    .index('by_channel_and_status', ['channel', 'status']),

  // ── PUBLICATION LOG ────────────────────
  publicationLog: defineTable({
    slotId: v.optional(v.id('scheduleSlots')),
    contentItemId: v.optional(v.id('contentItems')),
    variantId: v.optional(v.id('contentVariants')),
    channel: channel,
    publishStatus: publishStatus,
    payloadJson: v.optional(v.any()),
    responseJson: v.optional(v.any()),
    externalPostId: v.optional(v.string()),
    externalPostUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
  })
    .index('by_item', ['contentItemId'])
    .index('by_channel', ['channel'])
    .index('by_status', ['publishStatus']),

  // ── PERFORMANCE METRICS ────────────────
  performanceMetrics: defineTable({
    publicationLogId: v.id('publicationLog'),
    impressions: v.number(),
    engagements: v.number(),
    likes: v.number(),
    replies: v.number(),
    reposts: v.number(),
    reblogs: v.number(),
    linkClicks: v.number(),
    profileClicks: v.number(),
    bookmarks: v.number(),
    outboundClickRate: v.number(),
  })
    .index('by_log', ['publicationLogId']),

  // ── IMPORT JOBS ────────────────────────
  importJobs: defineTable({
    source: v.union(v.literal('tumblr'), v.literal('x_export')),
    status: v.union(
      v.literal('pending'), v.literal('running'),
      v.literal('completed'), v.literal('failed'), v.literal('partial')
    ),
    configJson: v.optional(v.any()),
    itemsTotal: v.number(),
    itemsImported: v.number(),
    itemsFailed: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index('by_status', ['status'])
    .index('by_source', ['source']),

  // ── SCORING RULES (una por canal) ──────
  scoringRules: defineTable({
    channel: channel,
    cooldownDaysItem: v.number(),      // default: 15
    cooldownDaysTopic: v.number(),     // default: 7
    weightClicks: v.number(),          // default: 0.25
    weightEngagement: v.number(),      // default: 0.25
    weightEvergreen: v.number(),       // default: 0.20
    weightManualPriority: v.number(),  // default: 0.15
    weightRecencyPenalty: v.number(),  // default: 0.10
    weightTopicFatigue: v.number(),    // default: 0.05
    // Boost por origen
    originBoostManual: v.number(),     // default: 0.15
    originBoostAssisted: v.number(),   // default: 0.15
    originBoostEnriched: v.number(),   // default: 0.10 (imported + enrichedManually=true)
    originBoostImported: v.number(),   // default: 0.00 (imported sin enriquecer)
    // Cuotas por tipo (deben sumar 1.0)
    quotaComic: v.number(),            // default: 0.30
    quotaLibro: v.number(),            // default: 0.25
    quotaCosplay: v.number(),          // default: 0.20
    quotaArticulo: v.number(),         // default: 0.15
    quotaOtros: v.number(),            // default: 0.10
    active: v.boolean(),
  })
    .index('by_channel', ['channel']),

  // ── AUDIT EVENTS ───────────────────────
  auditEvents: defineTable({
    entityType: v.string(),
    entityId: v.optional(v.string()),
    eventType: v.string(),
    payloadJson: v.optional(v.any()),
  })
    .index('by_entity', ['entityType', 'entityId'])
    .index('by_event_type', ['eventType']),

})
```

---

## 4. Interfaces TypeScript — contratos de dominio

> Archivo: `lib/types/domain.ts` — fuente de verdad de tipos para componentes y servicios.
> Los IDs de Convex son `Id<'tableName'>` importados de `convex/_generated/dataModel`.

```typescript
import type { Id } from '../convex/_generated/dataModel'

// ─────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────

export type ContentType =
  | 'comic' | 'libro' | 'autor' | 'cosplay'
  | 'articulo' | 'poster' | 'pelicula' | 'personaje' | 'coleccion'

export type ContentStatus =
  | 'draft' | 'researching' | 'in_review' | 'approved'
  | 'scheduled' | 'published' | 'archived' | 'blocked'

export type ContentOrigin = 'imported' | 'manual' | 'assisted'

export type EvergreenClass = 'high' | 'medium' | 'low'

export type Channel = 'tumblr' | 'x'

export type VariantStatus =
  | 'not_started' | 'generated' | 'edited' | 'approved'
  | 'scheduled' | 'published' | 'failed' | 'disabled'

export type SlotStatus =
  | 'empty' | 'planned' | 'locked' | 'ready'
  | 'publishing' | 'published' | 'skipped' | 'failed'

export type DayPart = 'morning' | 'afternoon' | 'evening'

export type PublishStatus = 'success' | 'failed' | 'retrying' | 'skipped'

export type SourcePlatform = 'tumblr' | 'x'

export type CreatorRole =
  | 'writer' | 'artist' | 'cover_artist'
  | 'colorist' | 'photographer' | 'other'

// ─────────────────────────────────────────
// ENTIDADES DE DOMINIO
// ─────────────────────────────────────────

export interface Creator {
  role: CreatorRole
  name: string
}

export interface ContentItem {
  _id: Id<'contentItems'>
  _creationTime: number
  slug: string
  contentType: ContentType
  title: string
  summary?: string
  longDescription?: string
  franchise?: string
  publisher?: string
  characters: string[]
  creators: Creator[]
  representationTags: string[]
  themeTags: string[]
  buyLink?: string

  // Trazabilidad de origen — inmutables una vez establecidos
  contentOrigin: ContentOrigin
  sourcePlatform?: SourcePlatform
  sourcePostUrl?: string
  sourcePostId?: string
  sourceDate?: number // timestamp ms

  // Enriquecimiento posterior — mutable
  enrichedManually: boolean

  topicFatigueGroup?: string
  editorialPriority: 1 | 2 | 3 | 4 | 5
  evergreenClass: EvergreenClass
  isSensitive: boolean
  needsReview: boolean
  status: ContentStatus
  canonicalHash?: string
  importedAt?: number
}

export interface ContentVariant {
  _id: Id<'contentVariants'>
  _creationTime: number
  contentItemId: Id<'contentItems'>
  channel: Channel
  headline?: string
  bodyText?: string
  ctaText?: string
  selectedMediaIds: Id<'mediaAssets'>[]
  status: VariantStatus
  versionNumber: number
  isActive: boolean
  approvedAt?: number
  publishedLastAt?: number
}

export interface MediaAsset {
  _id: Id<'mediaAssets'>
  _creationTime: number
  contentItemId: Id<'contentItems'>
  storageId: Id<'_storage'>
  publicUrl: string
  mimeType: string
  width?: number
  height?: number
  fileSizeBytes?: number
  altText?: string
  sourceUrl?: string
  sourceKind?: string
  sortOrder: number
  isPrimary: boolean
}

export interface ChannelScore {
  _id: Id<'channelScores'>
  _creationTime: number
  contentItemId: Id<'contentItems'>
  channel: Channel
  clickScore: number
  engagementScore: number
  reblogScore: number
  evergreenScore: number
  reuseScore: number
  lastPostedAt?: number
  postCount: number
}

export interface ScheduleSlot {
  _id: Id<'scheduleSlots'>
  _creationTime: number
  scheduledFor: string // YYYY-MM-DD
  dayPart: DayPart
  channel: Channel
  contentItemId?: Id<'contentItems'>
  variantId?: Id<'contentVariants'>
  contentMode: 'new' | 'recycled'
  priority: number
  locked: boolean
  generationBatchId?: string
  status: SlotStatus
}

export interface PublicationLog {
  _id: Id<'publicationLog'>
  _creationTime: number
  slotId?: Id<'scheduleSlots'>
  contentItemId?: Id<'contentItems'>
  variantId?: Id<'contentVariants'>
  channel: Channel
  publishStatus: PublishStatus
  payloadJson?: Record<string, unknown>
  responseJson?: Record<string, unknown>
  externalPostId?: string
  externalPostUrl?: string
  errorMessage?: string
  retryCount: number
}

export interface ScoringRules {
  _id: Id<'scoringRules'>
  channel: Channel
  cooldownDaysItem: number
  cooldownDaysTopic: number
  weightClicks: number
  weightEngagement: number
  weightEvergreen: number
  weightManualPriority: number
  weightRecencyPenalty: number
  weightTopicFatigue: number
  originBoostManual: number
  originBoostAssisted: number
  originBoostEnriched: number
  originBoostImported: number
  quotaComic: number
  quotaLibro: number
  quotaCosplay: number
  quotaArticulo: number
  quotaOtros: number
  active: boolean
}

export interface ImportJob {
  _id: Id<'importJobs'>
  _creationTime: number
  source: 'tumblr' | 'x_export'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial'
  configJson?: Record<string, unknown>
  itemsTotal: number
  itemsImported: number
  itemsFailed: number
  startedAt?: number
  completedAt?: number
}

// ─────────────────────────────────────────
// CONTRATOS DE API — REQUEST / RESPONSE
// ─────────────────────────────────────────

export interface CreateContentItemArgs {
  contentType: ContentType
  title: string
  summary?: string
  longDescription?: string
  franchise?: string
  publisher?: string
  characters?: string[]
  creators?: Creator[]
  representationTags?: string[]
  themeTags?: string[]
  buyLink?: string
  topicFatigueGroup?: string
  editorialPriority?: 1 | 2 | 3 | 4 | 5
  evergreenClass?: EvergreenClass
  isSensitive?: boolean
  contentOrigin: ContentOrigin
  sourcePlatform?: SourcePlatform
}

export interface UpdateContentItemArgs {
  id: Id<'contentItems'>
  patch: Partial<Omit<CreateContentItemArgs, 'contentOrigin' | 'sourcePlatform'>> & {
    status?: ContentStatus
    needsReview?: boolean
    enrichedManually?: boolean
    // Al pasar enrichedManually=true en un ítem imported,
    // la mutation registra audit_event 'item.enriched'
  }
}

export interface CatalogFilters {
  status?: ContentStatus[]
  contentType?: ContentType[]
  contentOrigin?: ContentOrigin[]
  sourcePlatform?: SourcePlatform[]
  enrichedManually?: boolean
  needsReview?: boolean
  search?: string
  paginationOpts?: { numItems: number; cursor: string | null }
}

// IA
export interface ResearchRequest {
  input: string
  contentType?: ContentType
}

export interface ResearchResponse {
  proposedItem: Partial<CreateContentItemArgs>
  confidence: number
  possibleDuplicates: Array<{ id: Id<'contentItems'>; title: string; similarity: number }>
  sourcesUsed: string[]
}

export interface GenerateVariantArgs {
  contentItemId: Id<'contentItems'>
  channel: Channel
}

export interface GenerateVariantResponse {
  headline: string
  bodyText: string
  ctaText: string
  modelUsed: string
}

// Publicación
export interface PublishDirectArgs {
  contentItemId: Id<'contentItems'>
  channel: Channel
  variantId?: Id<'contentVariants'>
}

export interface PublishDirectResponse {
  success: boolean
  externalPostId?: string
  externalPostUrl?: string
  publicationLogId?: Id<'publicationLog'>
  error?: string
}

// Scheduler
export interface GenerateCalendarArgs {
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  channel: Channel
  overwriteUnlocked?: boolean
}

export interface GenerateCalendarResponse {
  slotsCreated: number
  slotsSkipped: number
  batchId: string
}

// Dashboard
export interface DashboardStats {
  totalItems: number
  itemsByStatus: Record<ContentStatus, number>
  itemsByType: Record<ContentType, number>
  itemsByOrigin: Record<ContentOrigin, number>
  enrichedCount: number
  upcomingSlots: ScheduleSlot[]
  recentPublications: PublicationLog[]
  failedSlots: ScheduleSlot[]
}
```

---

## 5. Estructura de archivos Convex (`convex/`)

> Cada archivo en `convex/` expone queries, mutations y/o actions.
> Las queries y mutations tienen acceso tipado automático via `convex/_generated/`.

```
convex/
├── schema.ts                   # Schema completo (sección 3)
├── _generated/                 # Auto-generado por Convex CLI — no editar
│
├── contentItems.ts             # queries + mutations de content_items
├── contentVariants.ts          # queries + mutations de variantes
├── mediaAssets.ts              # queries + mutations de media
├── channelScores.ts            # queries + mutations de scores
├── scheduleSlots.ts            # queries + mutations de slots
├── publicationLog.ts           # queries de historial de publicación
├── importJobs.ts               # queries + mutations de import jobs
├── scoringRules.ts             # queries + mutations de reglas
├── auditEvents.ts              # mutation de registro de auditoría
│
├── actions/
│   ├── publisher.ts            # action: publishDirect, publishSlot (llama a Tumblr/X API)
│   ├── importer.ts             # action: startTumblrImport, processXExport
│   ├── ai.ts                   # action: researchContent, generateVariant, suggestTags
│   └── scoring.ts              # action: recomputeAllScores
│
└── scheduled/
    ├── publishCron.ts          # Scheduled Function: publica slots ready (cada hora)
    ├── metricsCron.ts          # Scheduled Function: recolecta métricas (diario)
    └── scoringCron.ts          # Scheduled Function: recomputa scores (semanal)
```

### Patrón de Scheduled Functions (reemplaza vercel.json cron)

```typescript
// convex/scheduled/publishCron.ts
import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'

export const publishPendingSlots = internalAction({
  args: {},
  handler: async (ctx) => {
    // lógica de publicación de slots ready
  },
})

// Se registra en convex/crons.ts:
import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.hourly('publish pending slots', { minuteOffset: 0 },
  internal.scheduled.publishCron.publishPendingSlots)

crons.daily('collect metrics', { hourUTC: 2, minuteUTC: 0 },
  internal.scheduled.metricsCron.collectMetrics)

crons.weekly('recompute scores', { dayOfWeek: 'sunday', hourUTC: 3, minuteUTC: 0 },
  internal.scheduled.scoringCron.recomputeScores)

export default crons
// convex/crons.ts es el único lugar donde se definen los schedules
```

---

## 6. Contratos de funciones Convex por módulo

```typescript
// ── convex/contentItems.ts ─────────────────────────────

// Queries
export const list = query({
  // Retorna lista paginada respetando CatalogFilters
  // Usa searchIndex 'search_title' si hay término de búsqueda
  // Filtra por status, contentType, contentOrigin, sourcePlatform, enrichedManually, needsReview
})

export const getById = query({
  // Retorna ContentItem con variantes, media y channel_scores anidados
})

export const getBySlug = query({ /* ... */ })

// Mutations
export const create = mutation({
  // Args: CreateContentItemArgs
  // Genera slug único desde title
  // Computa canonicalHash
  // Registra audit_event 'item.created'
  // Crea channelScores vacíos para tumblr y x
})

export const update = mutation({
  // Args: UpdateContentItemArgs
  // Si enrichedManually pasa de false a true: registra audit_event 'item.enriched'
  // No permite modificar contentOrigin ni sourcePlatform
})

export const updateStatus = mutation({
  // Args: { id, status }
  // Registra audit_event 'item.status_changed'
})

export const archive = mutation({ /* registra audit_event 'item.archived' */ })
export const approve = mutation({ /* registra audit_event 'item.approved' */ })


// ── convex/actions/publisher.ts ────────────────────────

export const publishDirect = action({
  // Args: PublishDirectArgs
  // 1. Obtiene el ContentItem y la variante activa aprobada del canal
  // 2. Valida que status sea 'approved'
  // 3. Llama a TumblrAdapter.publishPost o XAdapter.publishTweet
  // 4. Persiste en publicationLog
  // 5. Actualiza channelScores.lastPostedAt y postCount
  // 6. Registra audit_event 'item.published_direct'
  // Returns: PublishDirectResponse
})

export const publishSlot = action({
  // Args: { slotId }
  // 1. Obtiene el slot y verifica status='ready'
  // 2. Llama a publishDirect internamente
  // 3. Actualiza slot status a 'published' o 'failed'
  // 4. Si falla: incrementa retryCount, re-schedules si retryCount < 3
  // Returns: PublishDirectResponse
})


// ── convex/actions/ai.ts ───────────────────────────────

export const researchContent = action({
  // Args: ResearchRequest
  // 1. Llama a AnthropicAdapter.complete con prompt de investigación
  // 2. Parsea JSON de respuesta
  // 3. Busca duplicados por canonicalHash en contentItems
  // Returns: ResearchResponse
})

export const generateVariant = action({
  // Args: GenerateVariantArgs
  // 1. Obtiene ContentItem completo
  // 2. Llama a AnthropicAdapter.complete con prompt de canal correspondiente
  // 3. Parsea JSON de respuesta
  // 4. Crea o actualiza ContentVariant con status='generated'
  // 5. Registra audit_event 'variant.generated'
  // Returns: GenerateVariantResponse
})

export const suggestTags = action({
  // Args: { text: string }
  // Returns: { representationTags: string[], themeTags: string[] }
})


// ── convex/actions/importer.ts ─────────────────────────

export const startTumblrImport = action({
  // 1. Crea ImportJob con status='running'
  // 2. Llama a TumblrAdapter.fetchAllPosts con paginación
  // 3. Por cada página: normaliza posts, deduplica por canonicalHash,
  //    crea contentItems con origin='imported', sourcePlatform='tumblr',
  //    status='in_review', needsReview=true, enrichedManually=false
  // 4. Actualiza ImportJob.itemsImported en tiempo real (reactivo en UI)
  // 5. Al terminar: status='completed' o 'partial'
})

export const processXExport = action({
  // Args: { storageId: Id<'_storage'> } — archivo subido previamente
  // 1. Lee tweet.js desde Convex Storage
  // 2. Parsea XAdapter.parseTweetExport
  // 3. Normaliza y persiste igual que Tumblr pero sourcePlatform='x'
})


// ── convex/actions/scoring.ts ──────────────────────────

export const recomputeAllScores = action({
  // Args: { channel: Channel }
  // Para cada ContentItem con status approved/published:
  //   computa score con fórmula de sección 9
  //   actualiza channelScores.reuseScore
})

export const getEligibleItems = action({
  // Args: { channel: Channel, date: string }
  // Aplica filtros de elegibilidad antes de devolver candidatos:
  //   1. status approved o published
  //   2. variante activa del canal con status approved
  //   3. days_since_last_post >= cooldownDaysItem
  //   4. no hay ítem del mismo topicFatigueGroup en últimos cooldownDaysTopic días
  // Returns: ContentItem[] ordenados por reuseScore desc
})
```

---

## 7. Contratos de integraciones externas

```typescript
// lib/integrations/tumblr.ts
export interface TumblrPost {
  id: string
  type: 'text' | 'photo' | 'link' | 'quote' | 'video'
  timestamp: number
  slug: string
  tags: string[]
  photos?: Array<{ original_size: { url: string; width: number; height: number } }>
  body?: string
  caption?: string
  url?: string
  post_url: string
}

export interface TumblrPublishParams {
  blog_name: string
  type: 'photo' | 'text' | 'link'
  body?: string
  caption?: string
  tags: string[]
  image_urls?: string[]
  link_url?: string
}

export interface TumblrAdapter {
  fetchAllPosts(
    blogName: string,
    onPage: (posts: TumblrPost[]) => Promise<void>
  ): Promise<void>
  publishPost(params: TumblrPublishParams): Promise<{ id: string; url: string }>
}

// lib/integrations/x.ts
export interface XTweet {
  id: string
  full_text: string
  created_at: string
  entities?: {
    urls?: Array<{ expanded_url: string }>
    media?: Array<{ media_url_https: string; type: string }>
  }
}

export interface XPublishParams {
  text: string
  media_ids?: string[]
}

export interface XAdapter {
  parseTweetExport(fileContent: string): XTweet[]
  // Recibe el contenido del archivo data/tweet.js como string
  publishTweet(params: XPublishParams): Promise<{ id: string; url: string }>
}

// lib/integrations/anthropic.ts
export interface AnthropicAdapter {
  complete(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number
  ): Promise<string>
}
```

---

## 8. Estructura de carpetas del proyecto

```
superherosincolor-cms/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # Dashboard principal
│   │   ├── catalog/
│   │   │   ├── page.tsx                  # Vista de catálogo
│   │   │   ├── [id]/page.tsx             # Editor de ítem
│   │   │   └── new/page.tsx              # Crear ítem
│   │   ├── import/
│   │   │   └── page.tsx                  # Importadores
│   │   ├── planner/
│   │   │   └── page.tsx                  # Calendario mensual
│   │   ├── review/
│   │   │   └── page.tsx                  # Cola de revisión
│   │   ├── analytics/
│   │   │   └── page.tsx                  # Dashboard analítico
│   │   └── settings/
│   │       └── page.tsx                  # Scoring rules y configuración
│   └── api/
│       └── webhooks/                     # Solo para webhooks HTTP externos
│           └── tumblr/route.ts           # Si se necesita webhook de Tumblr
│
├── convex/
│   ├── schema.ts                         # Schema completo (sección 3)
│   ├── crons.ts                          # Definición de scheduled functions
│   ├── contentItems.ts
│   ├── contentVariants.ts
│   ├── mediaAssets.ts
│   ├── channelScores.ts
│   ├── scheduleSlots.ts
│   ├── publicationLog.ts
│   ├── importJobs.ts
│   ├── scoringRules.ts
│   ├── auditEvents.ts
│   ├── actions/
│   │   ├── publisher.ts
│   │   ├── importer.ts
│   │   ├── ai.ts
│   │   └── scoring.ts
│   └── scheduled/
│       ├── publishCron.ts
│       ├── metricsCron.ts
│       └── scoringCron.ts
│
├── lib/
│   ├── types/
│   │   └── domain.ts                     # Interfaces TypeScript (sección 4)
│   └── integrations/
│       ├── tumblr.ts
│       ├── x.ts
│       └── anthropic.ts
│
├── components/
│   ├── ui/                               # Componentes base
│   ├── catalog/
│   │   ├── CatalogTable.tsx
│   │   ├── OriginBadge.tsx
│   │   └── CatalogFilters.tsx
│   ├── editor/
│   │   ├── ContentEditor.tsx
│   │   ├── VariantEditor.tsx
│   │   └── ResearchAssistant.tsx
│   ├── planner/
│   │   └── CalendarGrid.tsx
│   └── dashboard/
│       └── DashboardStats.tsx
│
├── providers/
│   └── ConvexProvider.tsx                # ConvexReactClient + Auth setup
│
└── .env.example
```

---

## 9. Reglas editoriales y scoring

### Cooldowns (por canal, independientes)
- Mismo ítem: **15 días**
- Mismo `topicFatigueGroup`: **7 días**

### Cuotas por tipo (sobre el calendario generado)
- comic: 30% | libro: 25% | cosplay: 20% | artículo: 15% | otros: 10%

### Boost por origen

| contentOrigin | enrichedManually | Boost |
|---|---|---|
| manual | — | +0.15 |
| assisted | — | +0.15 |
| imported | true | +0.10 |
| imported | false | +0.00 |

### Fórmula de score compuesto (por canal)

```
score = (weightClicks        × normalizedClickScore)
      + (weightEngagement    × normalizedEngagementScore)
      + (weightEvergreen     × evergreenScore)
      + (weightManualPriority × normalizedPriority)
      - (weightRecencyPenalty × recencyPenalty)
      - (weightTopicFatigue  × topicFatiguePenalty)
      + originBoost
```

Pesos por defecto (configurables en `scoringRules` por canal):
`clicks: 0.25 | engagement: 0.25 | evergreen: 0.20 | priority: 0.15 | recency: 0.10 | fatigue: 0.05`

### Reglas de elegibilidad (previas al score)
1. `status = 'approved'` o `'published'`
2. Variante activa del canal con `status = 'approved'`
3. `daysSinceLastPost >= cooldownDaysItem` (por canal)
4. No hay ítem del mismo `topicFatigueGroup` publicado en los últimos `cooldownDaysTopic` días en ese canal

### canonicalHash

```typescript
// lib/utils/hash.ts
import { createHash } from 'crypto'

export function computeCanonicalHash(item: {
  title: string
  sourcePostUrl?: string | null
  sourcePostId?: string | null
}): string {
  const input = [
    item.title.toLowerCase().trim(),
    item.sourcePostUrl ?? '',
    item.sourcePostId ?? '',
  ].join('|')
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}
```

---

## 10. Prompts de IA

### Sistema base (todas las llamadas)
```
Eres un asistente editorial especializado en cómics y cultura pop con perspectiva de diversidad racial, étnica y de género. Ayudas a gestionar el catálogo editorial de SuperheroesInColor. Responde siempre en español. Sé conciso y preciso. Cuando debas generar JSON, devuelve únicamente JSON válido sin texto adicional ni bloques de código markdown.
```

### Investigación asistida
```
A partir del siguiente input: "{input}"

Genera una ficha editorial en JSON con esta estructura exacta:
{
  "title": "",
  "contentType": "",
  "summary": "",
  "franchise": "",
  "publisher": "",
  "characters": [],
  "creators": [{ "role": "", "name": "" }],
  "representationTags": [],
  "themeTags": [],
  "buyLink": "",
  "evergreenClass": "",
  "editorialPriority": 3,
  "confidence": 0.0
}

contentType válidos: comic, libro, autor, cosplay, articulo, poster, pelicula, personaje, coleccion
evergreenClass válidos: high, medium, low
creatorRole válidos: writer, artist, cover_artist, colorist, photographer, other
confidence: número entre 0 y 1
```

### Generar variante Tumblr
```
Eres un redactor para Tumblr con tono editorial entusiasta sobre diversidad en cómics.

Ítem: {title}
Tipo: {contentType}
Descripción: {longDescription}
Creadores: {creators}
Tags de representación: {representationTags}
Enlace: {buyLink}

Devuelve JSON:
{
  "headline": "",   // máx 100 caracteres
  "bodyText": "",   // 200-400 palabras: creadores, representación, por qué importa
  "ctaText": ""     // llamada a la acción con enlace si existe
}
```

### Generar variante X
```
Eres un redactor para X con tono directo y curatorial.

Ítem: {title}
Tipo: {contentType}
Creadores: {creators}
Tags de representación: {representationTags}
Enlace: {buyLink}

Devuelve JSON:
{
  "headline": "",   // máx 60 caracteres
  "bodyText": "",   // máx 220 caracteres (deja espacio para el enlace)
  "ctaText": ""     // CTA corto con enlace si existe
}
```

### Sugerencia de tags
```
Dado este texto: "{text}"

Devuelve JSON:
{
  "representationTags": [],
  "themeTags": []
}
```

---

## 11. Diferenciación visual por origen (`OriginBadge`)

| contentOrigin | enrichedManually | sourcePlatform | Label | Color |
|---|---|---|---|---|
| manual | — | — | Manual | verde |
| assisted | — | — | Asistido IA | azul |
| imported | false | tumblr | Histórico Tumblr | gris |
| imported | true | tumblr | Tumblr ✦ curado | amarillo |
| imported | false | x | Histórico X | gris |
| imported | true | x | X ✦ curado | amarillo |

Visible en: filas del catálogo, cabecera del editor, slots del planner, analytics.

---

## 12. Pantallas requeridas

| # | Pantalla | Ruta | Descripción |
|---|---|---|---|
| 1 | Dashboard | `/` | Slots próximos, errores, publicaciones recientes, top ítems por score, breakdown por origen |
| 2 | Catálogo | `/catalog` | Tabla con filtros por tipo, estado, origen, plataforma, enriquecido, búsqueda. OriginBadge en cada fila |
| 3 | Editor | `/catalog/[id]` `/catalog/new` | Formulario completo, variantes por canal, media library, generación IA, botón publicar directo |
| 4 | Importador | `/import` | Jobs reactivos con progreso en tiempo real (sin polling — Convex reactivo), errores por ítem |
| 5 | Cola de revisión | `/review` | Ítems `needsReview=true`, conflictos de deduplicación, aprobación rápida |
| 6 | Planner | `/planner` | Calendario mensual con slots por franja y canal, new vs recycled, edición manual |
| 7 | Analytics | `/analytics` | Métricas por canal, tipo, origen, horario, nuevo vs reciclado, importado vs curado |
| 8 | Settings | `/settings` | Pesos de scoring por canal, cuotas, cooldowns, boosts por origen |

---

## 13. Roadmap de entregas funcionales

> El schema de `convex/schema.ts` se define completo en la Entrega 1 y **no cambia**. Cada entrega agrega archivos en `convex/` y páginas en `app/` sin modificar el schema base.

---

### Entrega 1 — Fundaciones + CMS base
**Objetivo**: sistema funcional para registrar y consultar contenido manualmente.

**Incluye:**
- Setup Next.js 14 + Convex + Tailwind + TypeScript strict
- `convex/schema.ts` completo (sección 3) — todas las tablas desde el inicio
- Seed de `scoringRules` para tumblr y x con valores por defecto
- Autenticación con Convex Auth (login/logout, protección de rutas)
- `providers/ConvexProvider.tsx` con ConvexReactClient y Auth
- Layout de dashboard con navegación completa
- `convex/contentItems.ts`: queries `list`, `getById` + mutations `create`, `update`, `updateStatus`, `archive`, `approve`
- `convex/mediaAssets.ts`: upload a Convex Storage + gestión de assets
- `convex/auditEvents.ts`: mutation `log` usada en todas las mutaciones
- `convex/channelScores.ts`: creación automática al crear ítem
- UI: catálogo con filtros (tipo, estado, origen, plataforma, enrichedManually, búsqueda), OriginBadge
- UI: editor con formulario completo por tipo de contenido
- `.env.example` con todas las variables documentadas

**Criterios de aceptación:**
- Puedo crear, editar, archivar y buscar ítems con todos los campos del schema
- El filtro por origen funciona (manual / importado / asistido)
- Las imágenes se suben a Convex Storage y se asocian a ítems
- El login protege todas las rutas
- El schema completo existe y Convex lo valida

---

### Entrega 2 — Publicación directa (sin scheduler)
**Objetivo**: ciclo completo funcional — crear contenido y publicarlo en Tumblr y X.

**Incluye:**
- `lib/integrations/tumblr.ts` — OAuth + `publishPost`
- `lib/integrations/x.ts` — `publishTweet`
- `convex/actions/publisher.ts` — `publishDirect`
- `convex/contentVariants.ts` — queries y mutations de variantes (crear, aprobar, editar)
- UI en editor: panel de variantes por canal con estado, botón "Publicar ahora en Tumblr / X"
- `convex/publicationLog.ts` — query de historial por ítem
- Historial de publicaciones en el detalle del ítem con URLs externas
- Manejo de errores con mensaje descriptivo en UI

**Criterios de aceptación:**
- Puedo publicar un ítem en Tumblr desde el editor (requiere variante aprobada)
- Puedo publicar un ítem en X desde el editor (requiere variante aprobada)
- Cada publicación queda en `publicationLog` con URL externa y payload completo
- Los errores de API muestran mensaje descriptivo sin romper el flujo

---

### Entrega 3 — Generación IA + asistente de investigación
**Objetivo**: CMS con asistencia de IA para curaduría y creación.

**Incluye:**
- `lib/integrations/anthropic.ts`
- `convex/actions/ai.ts` — `researchContent`, `generateVariant`, `suggestTags`
- UI: ResearchAssistant en editor — input libre → propuesta de ficha editable
- Detección de duplicados por `canonicalHash` durante research, mostrada en UI
- Generación de variantes Tumblr y X con un clic, editables antes de aprobar
- Sugerencia de `representationTags` y `themeTags`
- `/review`: cola de ítems `needsReview=true` con aprobación/edición rápida

**Criterios de aceptación:**
- Pego una URL y el sistema propone ficha editable con metadata prellenada
- El sistema alerta si detecta posible duplicado
- Puedo generar copy por canal, editarlo y aprobarlo
- La cola de revisión muestra todos los ítems pendientes

---

### Entrega 4 — Importadores históricos
**Objetivo**: catálogo poblado con el archivo completo de Tumblr y X.

**Incluye:**
- `convex/actions/importer.ts` — `startTumblrImport`, `processXExport`
- `convex/importJobs.ts` — queries reactivas de progreso (UI actualiza sin polling gracias a Convex)
- `lib/integrations/tumblr.ts` — `fetchAllPosts` (OAuth + paginado)
- `lib/integrations/x.ts` — `parseTweetExport`
- UI `/import`: inicio de job, progreso en tiempo real reactivo, errores por ítem, reinicio
- Upload de export JSON de X desde UI a Convex Storage, luego procesado por action
- Normalización: `contentOrigin='imported'`, `sourcePlatform`, `status='in_review'`, `needsReview=true`, `enrichedManually=false`
- Deduplicación por `canonicalHash` — ambiguos aparecen en `/review`

**Criterios de aceptación:**
- El importador de Tumblr recorre todos los posts sin duplicados
- El parser de X procesa el export JSON correctamente
- El progreso se actualiza en tiempo real en UI sin polling
- Los ítems ambiguos aparecen en `/review` con opción merge/ignorar
- Un job interrumpido puede reanudarse sin duplicar lo ya importado

---

### Entrega 5 — Motor de scoring + Calendario
**Objetivo**: calendario editorial automático operativo.

**Incluye:**
- `convex/actions/scoring.ts` — `recomputeAllScores`, `getEligibleItems`
- `convex/scheduleSlots.ts` — queries y mutations de slots
- Lógica de generación de calendario en `convex/actions/scoring.ts` respetando cuotas y cooldowns
- UI `/planner`: calendario mensual con slots por franja/canal, new vs recycled, edición manual
- Bloqueo/desbloqueo de slots desde planner
- `convex/scoringRules.ts` — queries y mutations
- UI `/settings`: edición de pesos, cuotas, cooldowns y boosts por canal

**Criterios de aceptación:**
- El sistema genera calendario de 30 días respetando cuotas (30/25/20/15/10)
- Los cooldowns de 15 días por ítem y 7 días por franquicia se respetan por canal
- El boost por origen afecta el ranking de candidatos
- Los slots bloqueados no se sobreescriben en regeneración
- Los pesos y cuotas son editables desde `/settings`

---

### Entrega 6 — Automatización (Scheduled Functions)
**Objetivo**: publicación completamente automática sin intervención manual.

**Incluye:**
- `convex/actions/publisher.ts` — `publishSlot` con política de reintentos (3 intentos, backoff)
- `convex/scheduled/publishCron.ts` — publica slots `ready` del momento actual (cada hora)
- `convex/crons.ts` — registro de los 3 scheduled jobs
- Dashboard muestra slots fallidos con opción de republicar manualmente
- Throttle de X API: contador de escrituras/mes en settings, alerta al 80% (≈400/500)

**Criterios de aceptación:**
- El scheduled job publica automáticamente los slots `ready` en el horario correcto
- Cada publicación queda en `publicationLog` con URL externa
- Los slots con error reintentan hasta 3 veces con backoff
- Los slots agotados aparecen en dashboard con opción de republicación manual
- El throttle de X es visible en dashboard

---

### Entrega 7 — Analítica + cierre del ciclo
**Objetivo**: retroalimentación real que mejora el scoring automáticamente.

**Incluye:**
- `convex/scheduled/metricsCron.ts` — recolecta métricas de X y Tumblr API por publicación
- `convex/scheduled/scoringCron.ts` — recomputa `channelScores` con datos reales
- `convex/performanceMetrics.ts` — queries de métricas
- UI `/analytics`: métricas por canal, tipo, origen, horario, nuevo vs reciclado, importado vs curado
- Explicabilidad de scoring en el editor: desglose de factores del score actual
- Acciones masivas en catálogo: aprobar lote, marcar evergreen, cambiar prioridad, marcar enriquecido

**Criterios de aceptación:**
- Las métricas de X y Tumblr se capturan y afectan `channelScores`
- El dashboard muestra comparativo importado vs manual vs asistido vs curado
- El editor explica el score con desglose de factores
- Las acciones masivas funcionan correctamente

---

## 14. Estados editoriales (referencia rápida)

**Ítem:** `draft` → `researching` → `in_review` → `approved` → `scheduled` → `published` → `archived` / `blocked`

**Variante:** `not_started` → `generated` → `edited` → `approved` → `scheduled` → `published` / `failed` / `disabled`

**Slot:** `empty` → `planned` → `locked` → `ready` → `publishing` → `published` / `skipped` / `failed`

---

## 15. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| X API free (500 posts/mes) agotado | Publicación interrumpida | Throttle: máx 1 post/día/canal; alerta en dashboard al 80% |
| Convex file storage 1GB lleno | Imágenes no se suben | Comprimir en cliente antes de subir (máx 500KB); monitorear en `/settings` |
| Convex function calls 1M/mes agotadas | Sistema no responde | Las queries reactivas no cuentan en su totalidad; monitorear en Convex dashboard |
| APIs externas revocan acceso | Interrupción de publicación | Capa de abstracción en integraciones; slot pasa a `failed`, no se pierde |
| Calidad heterogénea del histórico | Datos sucios en catálogo | Todos los importados entran con `needsReview=true`; deduplicación por hash |
| Anthropic API latencia alta | UX lenta en editor | Todas las actions IA son async con loading state; nunca bloquean guardado |
| X no permite leer histórico vía API | Archivo X incompleto | Import via export JSON oficial; la interfaz `XAdapter` ya está preparada para futura API |

---

## 16. Decisiones de diseño fijas (no reabrir)

- Backend exclusivamente en Convex — no Supabase, no Prisma, no REST propio
- Scheduled Functions de Convex reemplazan completamente los cron jobs externos
- No se usan Server Actions de Next.js — mutaciones van via `useMutation()` de Convex
- Next.js Route Handlers solo para webhooks HTTP externos que lo requieran
- Scoring independiente por canal — `channelScores` tiene una fila por ítem por canal
- `contentOrigin` es inmutable una vez establecido
- `sourcePlatform` es inmutable — distingue histórico Tumblr de histórico X
- `enrichedManually` es mutable e independiente de `contentOrigin`
- Cooldown 15 días por ítem, 7 días por `topicFatigueGroup`, ambos por canal
- Cuotas: 30% comic / 25% libro / 20% cosplay / 15% artículo / 10% otros
- Todos los ítems importados entran con `status='in_review'` y `needsReview=true`
- Generación IA nunca publica sin aprobación humana
- Slots bloqueados (`locked=true`) no se sobreescriben en regeneración automática
- La publicación directa (E2) y por slot (E6) comparten `publishDirect` internamente
