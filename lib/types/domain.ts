import type { Id } from '@/convex/_generated/dataModel'

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

  contentOrigin: ContentOrigin
  sourcePlatform?: SourcePlatform
  sourcePostUrl?: string
  sourcePostId?: string
  sourceDate?: number

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
  scheduledFor: string
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
// CONTRATOS DE API
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

export interface GenerateCalendarArgs {
  startDate: string
  endDate: string
  channel: Channel
  overwriteUnlocked?: boolean
}

export interface GenerateCalendarResponse {
  slotsCreated: number
  slotsSkipped: number
  batchId: string
}

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
