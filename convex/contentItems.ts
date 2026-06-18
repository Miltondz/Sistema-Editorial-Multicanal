import { query, mutation, internalQuery, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { computeCanonicalHash } from '../lib/utils/hash'

// ── Validators (keep in sync with schema) ──────────────────────────────────
const contentTypeV = v.union(
  v.literal('comic'), v.literal('libro'), v.literal('autor'),
  v.literal('cosplay'), v.literal('articulo'), v.literal('poster'),
  v.literal('pelicula'), v.literal('personaje'), v.literal('coleccion')
)
const contentStatusV = v.union(
  v.literal('draft'), v.literal('researching'), v.literal('in_review'),
  v.literal('approved'), v.literal('scheduled'), v.literal('published'),
  v.literal('archived'), v.literal('blocked')
)
const contentOriginV = v.union(
  v.literal('imported'), v.literal('manual'), v.literal('assisted')
)
const evergreenClassV = v.union(
  v.literal('high'), v.literal('medium'), v.literal('low')
)
const creatorRoleV = v.union(
  v.literal('writer'), v.literal('artist'), v.literal('cover_artist'),
  v.literal('colorist'), v.literal('photographer'), v.literal('other')
)
const creatorV = v.object({ role: creatorRoleV, name: v.string() })
const sourcePlatformV = v.optional(v.union(v.literal('tumblr'), v.literal('x')))

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:       ['researching', 'in_review', 'approved', 'archived'],
  researching: ['in_review', 'approved', 'draft'],
  in_review:   ['approved', 'draft', 'blocked'],
  approved:    ['scheduled', 'published', 'archived'],
  scheduled:   ['published', 'approved'],
  published:   ['archived', 'approved'],
  archived:    [],
  blocked:     ['in_review'],
}

async function generateUniqueSlug(ctx: any, title: string): Promise<string> {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)

  const existing = await ctx.db
    .query('contentItems')
    .collect()

  const slugs = new Set(existing.map((i: any) => i.slug))

  if (!slugs.has(base)) return base

  let n = 1
  while (slugs.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

// ── QUERIES ────────────────────────────────────────────────────────────────

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(contentStatusV),
    contentType: v.optional(contentTypeV),
    contentOrigin: v.optional(contentOriginV),
    sourcePlatform: v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    enrichedManually: v.optional(v.boolean()),
    needsReview: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.search && args.search.trim().length > 0) {
      return await ctx.db
        .query('contentItems')
        .withSearchIndex('search_title', (q: any) => q.search('title', args.search!))
        .paginate(args.paginationOpts)
    }

    // Pick primary index
    if (args.contentOrigin) {
      return await ctx.db
        .query('contentItems')
        .withIndex('by_origin', (q: any) => q.eq('contentOrigin', args.contentOrigin!))
        .paginate(args.paginationOpts)
    }
    if (args.status) {
      return await ctx.db
        .query('contentItems')
        .withIndex('by_status', (q: any) => q.eq('status', args.status!))
        .paginate(args.paginationOpts)
    }
    if (args.contentType) {
      return await ctx.db
        .query('contentItems')
        .withIndex('by_content_type', (q: any) => q.eq('contentType', args.contentType!))
        .paginate(args.paginationOpts)
    }

    return await ctx.db
      .query('contentItems')
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const getById = query({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id)
    if (!item) return null
    const variants = await ctx.db
      .query('contentVariants')
      .withIndex('by_item', q => q.eq('contentItemId', args.id))
      .collect()
    const media = await ctx.db
      .query('mediaAssets')
      .withIndex('by_item', q => q.eq('contentItemId', args.id))
      .collect()
    const scores = await ctx.db
      .query('channelScores')
      .withIndex('by_item', q => q.eq('contentItemId', args.id))
      .collect()
    return { ...item, variants, media, scores }
  },
})

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('contentItems')
      .filter(q => q.eq(q.field('slug'), args.slug))
      .first()
  },
})

// Internal version for use in actions
export const getByIdInternal = internalQuery({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const findByHashInternal = internalQuery({
  args: { canonicalHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('contentItems')
      .withIndex('by_canonical_hash', q => q.eq('canonicalHash', args.canonicalHash))
      .first()
  },
})

export const listNeedsReview = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('contentItems')
      .withIndex('by_needs_review', q => q.eq('needsReview', true))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

// Batch import from importer action — skips duplicates instead of throwing
export const importBatchInternal = internalMutation({
  args: {
    items: v.array(v.object({
      title:          v.string(),
      summary:        v.optional(v.string()),
      buyLink:        v.optional(v.string()),
      coverImageUrl:  v.optional(v.string()),
      sourcePlatform: v.union(v.literal('tumblr'), v.literal('x')),
      sourcePostId:   v.string(),
      sourcePostUrl:  v.string(),
      sourceDate:     v.optional(v.number()),
    })),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx: any, args: any): Promise<{
    imported: number
    skipped:  number
    errors:   Array<{ sourceId: string; title: string; error: string }>
  }> => {
    let imported = 0
    let skipped  = 0
    const errors: Array<{ sourceId: string; title: string; error: string }> = []

    for (const item of args.items) {
      try {
        const canonicalHash = await computeCanonicalHash({
          title:        item.title,
          sourcePostUrl: item.sourcePostUrl,
          sourcePostId:  item.sourcePostId,
        })

        const existing = await ctx.db
          .query('contentItems')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .withIndex('by_canonical_hash', (q: any) => q.eq('canonicalHash', canonicalHash))
          .first()

        if (existing) {
          skipped++
          continue
        }

        // Deterministic slug using source post ID suffix — avoids expensive full-table scan
        const baseSlug = item.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 50)
          .replace(/-+$/, '') || 'item'
        const slug = `${baseSlug}-${item.sourcePostId.slice(-8)}`

        const itemId = await ctx.db.insert('contentItems', {
          slug,
          canonicalHash,
          contentType:     'comic',      // provisional — review queue
          title:           item.title,
          summary:         item.summary,
          buyLink:         item.buyLink,
          contentOrigin:   'imported',
          sourcePlatform:  item.sourcePlatform,
          sourcePostId:    item.sourcePostId,
          sourcePostUrl:   item.sourcePostUrl,
          sourceDate:      item.sourceDate,
          coverImageUrl:   item.coverImageUrl,
          enrichedManually: false,
          needsReview:     true,
          status:          'in_review',
          editorialPriority: 3,
          evergreenClass:  'medium',
          isSensitive:     false,
          characters:      [],
          creators:        [],
          representationTags: [],
          themeTags:       [],
          importedAt:      Date.now(),
        })

        await ctx.runMutation(internal.channelScores.createForItem, { contentItemId: itemId })
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'contentItem',
          entityId:   itemId,
          eventType:  'item.created',
          payloadJson: { contentOrigin: 'imported', sourcePlatform: item.sourcePlatform },
        })

        imported++
      } catch (err) {
        errors.push({
          sourceId: item.sourcePostId,
          title:    item.title,
          error:    err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { imported, skipped, errors }
  },
})

// ── MUTATIONS ──────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    contentType: contentTypeV,
    title: v.string(),
    summary: v.optional(v.string()),
    longDescription: v.optional(v.string()),
    franchise: v.optional(v.string()),
    publisher: v.optional(v.string()),
    characters: v.optional(v.array(v.string())),
    creators: v.optional(v.array(creatorV)),
    representationTags: v.optional(v.array(v.string())),
    themeTags: v.optional(v.array(v.string())),
    buyLink: v.optional(v.string()),
    topicFatigueGroup: v.optional(v.string()),
    editorialPriority: v.optional(v.number()),
    evergreenClass: v.optional(evergreenClassV),
    isSensitive: v.optional(v.boolean()),
    contentOrigin: contentOriginV,
    sourcePlatform: sourcePlatformV,
    sourcePostUrl: v.optional(v.string()),
    sourcePostId: v.optional(v.string()),
    sourceDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const slug = await generateUniqueSlug(ctx, args.title)

    const canonicalHash = await computeCanonicalHash({
      title: args.title,
      sourcePostUrl: args.sourcePostUrl,
      sourcePostId: args.sourcePostId,
    })

    const existing = await ctx.db
      .query('contentItems')
      .withIndex('by_canonical_hash', q => q.eq('canonicalHash', canonicalHash))
      .first()
    if (existing) {
      throw new Error(`Duplicate detected: ${existing._id}`)
    }

    const isImported = args.contentOrigin === 'imported'

    const itemId = await ctx.db.insert('contentItems', {
      slug,
      canonicalHash,
      contentType: args.contentType,
      title: args.title,
      summary: args.summary,
      longDescription: args.longDescription,
      franchise: args.franchise,
      publisher: args.publisher,
      characters: args.characters ?? [],
      creators: args.creators ?? [],
      representationTags: args.representationTags ?? [],
      themeTags: args.themeTags ?? [],
      buyLink: args.buyLink,
      topicFatigueGroup: args.topicFatigueGroup,
      editorialPriority: args.editorialPriority ?? 3,
      evergreenClass: args.evergreenClass ?? 'medium',
      isSensitive: args.isSensitive ?? false,
      contentOrigin: args.contentOrigin,
      sourcePlatform: args.sourcePlatform,
      sourcePostUrl: args.sourcePostUrl,
      sourcePostId: args.sourcePostId,
      sourceDate: args.sourceDate,
      enrichedManually: false,
      needsReview: isImported,
      status: isImported ? 'in_review' : 'draft',
      importedAt: isImported ? Date.now() : undefined,
    })

    await ctx.runMutation(internal.channelScores.createForItem, { contentItemId: itemId })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: itemId,
      eventType: 'item.created',
      payloadJson: { contentOrigin: args.contentOrigin, sourcePlatform: args.sourcePlatform },
    })

    return itemId
  },
})

export const update = mutation({
  args: {
    id: v.id('contentItems'),
    patch: v.object({
      title: v.optional(v.string()),
      summary: v.optional(v.string()),
      longDescription: v.optional(v.string()),
      franchise: v.optional(v.string()),
      publisher: v.optional(v.string()),
      characters: v.optional(v.array(v.string())),
      creators: v.optional(v.array(creatorV)),
      representationTags: v.optional(v.array(v.string())),
      themeTags: v.optional(v.array(v.string())),
      buyLink: v.optional(v.string()),
      topicFatigueGroup: v.optional(v.string()),
      editorialPriority: v.optional(v.number()),
      evergreenClass: v.optional(evergreenClassV),
      isSensitive: v.optional(v.boolean()),
      needsReview: v.optional(v.boolean()),
      enrichedManually: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id)
    if (!item) throw new Error('Item not found')

    // enrichedManually can only go false → true, never back
    if (args.patch.enrichedManually === false && item.enrichedManually === true) {
      throw new Error('enrichedManually cannot be set back to false')
    }

    if (args.patch.enrichedManually === true && !item.enrichedManually) {
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'contentItem',
        entityId: args.id,
        eventType: 'item.enriched',
        payloadJson: { previousValue: false },
      })
    }

    await ctx.db.patch(args.id, args.patch)

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: args.id,
      eventType: 'item.updated',
      payloadJson: { fields: Object.keys(args.patch) },
    })
  },
})

export const updateStatus = mutation({
  args: {
    id: v.id('contentItems'),
    status: contentStatusV,
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id)
    if (!item) throw new Error('Item not found')

    const valid = VALID_TRANSITIONS[item.status]
    if (!valid || !valid.includes(args.status)) {
      throw new Error(`Invalid transition: ${item.status} → ${args.status}`)
    }

    await ctx.db.patch(args.id, { status: args.status })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: args.id,
      eventType: 'item.status_changed',
      payloadJson: { from: item.status, to: args.status },
    })
  },
})

export const approve = mutation({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id)
    if (!item) throw new Error('Item not found')

    const valid = VALID_TRANSITIONS[item.status]
    if (!valid || !valid.includes('approved')) {
      throw new Error(`Cannot approve item with status: ${item.status}`)
    }

    await ctx.db.patch(args.id, { status: 'approved', needsReview: false })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: args.id,
      eventType: 'item.approved',
      payloadJson: { previousStatus: item.status },
    })
  },
})

export const archive = mutation({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id)
    if (!item) throw new Error('Item not found')

    const valid = VALID_TRANSITIONS[item.status]
    if (!valid || !valid.includes('archived')) {
      throw new Error(`Cannot archive item with status: ${item.status}`)
    }

    await ctx.db.patch(args.id, { status: 'archived' })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: args.id,
      eventType: 'item.archived',
      payloadJson: { previousStatus: item.status },
    })
  },
})

// ── BULK MUTATIONS (Entrega 7) ─────────────────────────────────────────────

export const bulkApprove = mutation({
  args: { ids: v.array(v.id('contentItems')) },
  handler: async (ctx, args): Promise<{ approved: number; skipped: number }> => {
    let approved = 0
    let skipped = 0
    for (const id of args.ids) {
      const item = await ctx.db.get(id)
      if (!item) { skipped++; continue }
      const valid = VALID_TRANSITIONS[item.status]
      if (!valid || !valid.includes('approved')) { skipped++; continue }
      await ctx.db.patch(id, { status: 'approved', needsReview: false })
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'contentItem',
        entityId: id,
        eventType: 'item.approved',
        payloadJson: { bulk: true, previousStatus: item.status },
      })
      approved++
    }
    return { approved, skipped }
  },
})

export const bulkUpdate = mutation({
  args: {
    ids: v.array(v.id('contentItems')),
    patch: v.object({
      evergreenClass:    v.optional(evergreenClassV),
      editorialPriority: v.optional(v.number()),
      enrichedManually:  v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args): Promise<{ updated: number }> => {
    for (const id of args.ids) {
      const item = await ctx.db.get(id)
      if (!item) continue
      // enrichedManually is immutable once true
      const safePatch: Partial<typeof args.patch> = { ...args.patch }
      if (safePatch.enrichedManually === false) delete safePatch.enrichedManually
      if (safePatch.enrichedManually === true && !item.enrichedManually) {
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'contentItem',
          entityId: id,
          eventType: 'item.enriched',
          payloadJson: { bulk: true },
        })
      }
      await ctx.db.patch(id, safePatch)
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'contentItem',
        entityId: id,
        eventType: 'item.updated',
        payloadJson: { bulk: true, fields: Object.keys(safePatch) },
      })
    }
    return { updated: args.ids.length }
  },
})

// Pending-approvals count for planner banner
// Counts active variants in 'generated' or 'edited' status (need approval before publish)
// plus items in 'draft' or 'in_review' (need editorial review)
export const countByStatus = query({
  args: {},
  handler: async (ctx) => {
    // Variants awaiting approval (generated or edited, not yet approved)
    const [genTumblr, genX, editTumblr, editX] = await Promise.all([
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'tumblr').eq('status', 'generated')).take(500),
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'x').eq('status', 'generated')).take(500),
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'tumblr').eq('status', 'edited')).take(500),
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'x').eq('status', 'edited')).take(500),
    ])
    // Distinct items with unapproved active variants
    const pendingItems = new Set<string>()
    for (const v of [...genTumblr, ...genX, ...editTumblr, ...editX]) {
      if (v.isActive) pendingItems.add(v.contentItemId as string)
    }

    // Items needing editorial review (imported or manual draft)
    const [inReview, draft] = await Promise.all([
      ctx.db.query('contentItems').withIndex('by_status', q => q.eq('status', 'in_review')).take(500),
      ctx.db.query('contentItems').withIndex('by_status', q => q.eq('status', 'draft')).take(500),
    ])

    return {
      inReview:        inReview.length,
      draft:           draft.length,
      variantsPending: pendingItems.size,
      total:           pendingItems.size + inReview.length + draft.length,
    }
  },
})

// Light stats for dashboard — bounded queries
export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const needsReview = await ctx.db
      .query('contentItems')
      .withIndex('by_needs_review', q => q.eq('needsReview', true))
      .take(500)
    const approved = await ctx.db
      .query('contentItems')
      .withIndex('by_status', q => q.eq('status', 'approved'))
      .take(500)
    const published = await ctx.db
      .query('contentItems')
      .withIndex('by_status', q => q.eq('status', 'published'))
      .take(500)
    return {
      needsReviewCount: needsReview.length,
      approvedCount:    approved.length,
      publishedCount:   published.length,
    }
  },
})
