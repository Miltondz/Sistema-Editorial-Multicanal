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

    enrichedManually: v.boolean(),

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
})
