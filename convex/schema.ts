import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

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
  v.literal('imported'),
  v.literal('manual'),
  v.literal('assisted')
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
  ...authTables,

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

    contentOrigin: contentOrigin,
    sourcePlatform: v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    sourcePostUrl: v.optional(v.string()),
    sourcePostId: v.optional(v.string()),
    sourceDate: v.optional(v.number()),
    coverImageUrl: v.optional(v.string()),
    importJobId: v.optional(v.id('importJobs')),

    enrichedManually: v.boolean(),
    cvId:  v.optional(v.number()),
    cvUrl: v.optional(v.string()),

    topicFatigueGroup: v.optional(v.string()),
    editorialPriority: v.number(),
    evergreenClass: evergreenClass,
    isSensitive: v.boolean(),
    needsReview: v.boolean(),
    status: contentStatus,
    canonicalHash: v.optional(v.string()),
    importedAt: v.optional(v.number()),
  })
    .index('by_status', ['status'])
    .index('by_content_type', ['contentType'])
    .index('by_canonical_hash', ['canonicalHash'])
    .index('by_franchise', ['franchise'])
    .index('by_origin', ['contentOrigin'])
    .index('by_source_platform', ['sourcePlatform'])
    .index('by_needs_review', ['needsReview'])
    .index('by_import_job', ['importJobId'])
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
    storageId: v.id('_storage'),
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

  // ── CHANNEL SCORES ─────────────────────
  channelScores: defineTable({
    contentItemId: v.id('contentItems'),
    channel: channel,
    clickScore: v.number(),
    engagementScore: v.number(),
    reblogScore: v.number(),
    evergreenScore: v.number(),
    reuseScore: v.number(),
    lastPostedAt: v.optional(v.number()),
    postCount: v.number(),
  })
    .index('by_item', ['contentItemId'])
    .index('by_item_and_channel', ['contentItemId', 'channel'])
    .index('by_channel_and_score', ['channel', 'reuseScore']),

  // ── SCHEDULE SLOTS ─────────────────────
  scheduleSlots: defineTable({
    scheduledFor: v.string(),
    dayPart: dayPart,
    channel: channel,
    contentItemId: v.optional(v.id('contentItems')),
    variantId: v.optional(v.id('contentVariants')),
    contentMode: v.union(v.literal('new'), v.literal('recycled')),
    priority: v.number(),
    locked: v.boolean(),
    generationBatchId: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    status: slotStatus,
  })
    .index('by_date', ['scheduledFor'])
    .index('by_date_and_channel', ['scheduledFor', 'channel'])
    .index('by_status', ['status'])
    .index('by_channel_and_status', ['channel', 'status'])
    .index('by_content_item', ['contentItemId']),

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

  // ── SCORING RULES ──────────────────────
  scoringRules: defineTable({
    channel: channel,
    cooldownDaysItem: v.number(),
    cooldownDaysTopic: v.number(),
    weightClicks: v.number(),
    weightEngagement: v.number(),
    weightEvergreen: v.number(),
    weightManualPriority: v.number(),
    weightRecencyPenalty: v.number(),
    weightTopicFatigue: v.number(),
    originBoostManual: v.number(),
    originBoostAssisted: v.number(),
    originBoostEnriched: v.number(),
    originBoostImported: v.number(),
    quotaComic: v.number(),
    quotaLibro: v.number(),
    quotaCosplay: v.number(),
    quotaArticulo: v.number(),
    quotaOtros: v.number(),
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

  // ── EDITORIAL BANNER ──────────────────────
  editorialBanner: defineTable({
    title: v.string(),
    description: v.string(),
    badgeText: v.string(),
    imageUrl: v.optional(v.string()),
    ctaLabel: v.string(),
    ctaHref: v.optional(v.string()),
    active: v.boolean(),
  })
    .index('by_active', ['active']),

  // ── SPECIAL DATES ─────────────────────────
  specialDates: defineTable({
    date: v.string(),
    dateType: v.union(v.literal('anniversary'), v.literal('one_time')),
    title: v.string(),
    description: v.optional(v.string()),
    contentType: v.optional(v.string()),
    tags: v.array(v.string()),
    aiGenerated: v.boolean(),
    aiIdeas: v.optional(v.string()),
    relevanceScore: v.number(),
    active: v.boolean(),
    // Rich fields populated by Perplexity search (all optional for backward compat)
    titleShort: v.optional(v.string()),
    yearOriginal: v.optional(v.number()),
    category: v.optional(v.string()),
    confidence: v.optional(v.string()),
    teaserText: v.optional(v.string()),
    bannerImageUrl: v.optional(v.string()),
    bannerImageAlt: v.optional(v.string()),
    diversityTags: v.optional(v.array(v.string())),
    richDataJson: v.optional(v.any()),
  })
    .index('by_date', ['date'])
    .index('by_active', ['active'])
    .index('by_date_active', ['date', 'active']),

  // ── COMICS RESEARCH ───────────────────────
  comicsResearch: defineTable({
    sessionName: v.string(),
    dateFrom:    v.string(),
    dateTo:      v.string(),
    dateMode:    v.string(),
    maxResults:  v.number(),
    paramsJson:  v.optional(v.any()),
    resultCount: v.number(),
    rawJson:     v.optional(v.any()),
    status:      v.union(v.literal('running'), v.literal('done'), v.literal('error')),
    errorMessage: v.optional(v.string()),
  })
    .index('by_status', ['status']),

  comicsResearchItems: defineTable({
    sessionId:            v.id('comicsResearch'),
    title:                v.string(),
    issue:                v.string(),
    publisher:            v.string(),
    releaseDate:          v.string(),
    confidence:           v.string(),
    saved:                v.boolean(),
    promotedToContentId:  v.optional(v.id('contentItems')),
    itemJson:             v.any(),
  })
    .index('by_session', ['sessionId'])
    .index('by_saved',   ['saved']),

  // ── Diversity Catalog ──────────────────────────────────────────────────────
  // Designed for easy export to Supabase / any SQL DB:
  //   - cvId (integer) = canonical dedup key (not Convex _id)
  //   - arrays → TEXT[] or JSONB in SQL
  //   - timestamps → Unix ms, convert to ISO for SQL
  //   - no v.id() cross-refs between catalog tables (use cvId as FK)

  catalogCharacters: defineTable({
    // Identity
    name:            v.string(),              // canonical display name
    aliases:         v.array(v.string()),     // alternate names / search aliases
    // Diversity classification
    diversityTags:   v.array(v.string()),     // ['black','latino','asian','indigenous','arab']
    // Comic Vine data (primary enrichment source)
    cvId:            v.optional(v.number()),  // e.g. 1477 for Black Panther
    cvUrl:           v.optional(v.string()),
    // Character detail
    deck:            v.optional(v.string()),  // short CV description
    realName:        v.optional(v.string()),
    publisher:       v.optional(v.string()),
    powers:          v.optional(v.array(v.string())),
    firstAppearance: v.optional(v.string()),
    coverUrl:        v.optional(v.string()),
    // Wikipedia
    wikiUrl:         v.optional(v.string()),
    // Mantle / version tracking (legacy + multiverse)
    mantleId:        v.optional(v.string()),  // canonical identity: "Batman", "Robin", "Superman"
    versionType:     v.optional(v.string()),  // "original"|"legacy"|"alternate_universe"|"future"|"what_if"
    universe:        v.optional(v.string()),  // "Earth-616","Earth-2","Flashpoint","Ultimate","New 52"
    legacyIndex:     v.optional(v.number()),  // succession order for legacy (1=first holder)
    // Provenance
    sources:         v.array(v.string()),     // ['worldofblackheroes','wikipedia','manual']
    // Freshness tracking
    cvEnrichedAt:    v.optional(v.number()),  // Unix ms — null = not yet enriched
    createdAt:       v.number(),              // Unix ms
    updatedAt:       v.number(),              // Unix ms
  })
    .index('by_name',     ['name'])
    .index('by_cvId',     ['cvId'])
    .index('by_enriched', ['cvEnrichedAt'])
    .index('by_mantle',   ['mantleId']),

  catalogCreators: defineTable({
    // Identity
    name:            v.string(),
    aliases:         v.array(v.string()),
    // Roles & diversity
    roles:           v.array(v.string()),     // ['writer','artist','colorist','letterer']
    diversityTags:   v.array(v.string()),     // creator's own diversity background
    // Comic Vine data
    cvId:            v.optional(v.number()),
    cvUrl:           v.optional(v.string()),
    // Creator detail
    deck:            v.optional(v.string()),
    nationality:     v.optional(v.string()),
    birthYear:       v.optional(v.number()),
    coverUrl:        v.optional(v.string()),
    wikiUrl:         v.optional(v.string()),
    // Notable works (cvIds of volumes/issues)
    notableWorkCvIds: v.optional(v.array(v.number())),
    // Provenance
    sources:         v.array(v.string()),
    cvEnrichedAt:    v.optional(v.number()),
    createdAt:       v.number(),
    updatedAt:       v.number(),
  })
    .index('by_name',     ['name'])
    .index('by_cvId',     ['cvId'])
    .index('by_enriched', ['cvEnrichedAt']),
})
