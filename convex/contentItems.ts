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
    const applySecondary = (base: any, usedFields: string[]) => {
      let q = base
      if (!usedFields.includes('status') && args.status)
        q = q.filter((f: any) => f.eq(f.field('status'), args.status!))
      if (!usedFields.includes('contentType') && args.contentType)
        q = q.filter((f: any) => f.eq(f.field('contentType'), args.contentType!))
      if (!usedFields.includes('contentOrigin') && args.contentOrigin)
        q = q.filter((f: any) => f.eq(f.field('contentOrigin'), args.contentOrigin!))
      if (args.sourcePlatform)
        q = q.filter((f: any) => f.eq(f.field('sourcePlatform'), args.sourcePlatform!))
      if (args.enrichedManually !== undefined)
        q = q.filter((f: any) => f.eq(f.field('enrichedManually'), args.enrichedManually!))
      if (args.needsReview !== undefined)
        q = q.filter((f: any) => f.eq(f.field('needsReview'), args.needsReview!))
      return q
    }

    if (args.search && args.search.trim().length > 0) {
      const base = ctx.db
        .query('contentItems')
        .withSearchIndex('search_title', (q: any) => q.search('title', args.search!))
      return await applySecondary(base, []).paginate(args.paginationOpts)
    }

    // Pick primary index, then apply remaining filters
    if (args.contentOrigin) {
      const base = ctx.db.query('contentItems').withIndex('by_origin', (q: any) => q.eq('contentOrigin', args.contentOrigin!))
      return await applySecondary(base, ['contentOrigin']).paginate(args.paginationOpts)
    }
    if (args.status) {
      const base = ctx.db.query('contentItems').withIndex('by_status', (q: any) => q.eq('status', args.status!))
      return await applySecondary(base, ['status']).paginate(args.paginationOpts)
    }
    if (args.contentType) {
      const base = ctx.db.query('contentItems').withIndex('by_content_type', (q: any) => q.eq('contentType', args.contentType!))
      return await applySecondary(base, ['contentType']).paginate(args.paginationOpts)
    }

    const base = ctx.db.query('contentItems').order('desc')
    return await applySecondary(base, []).paginate(args.paginationOpts)
  },
})

export const searchForDuplicates = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    if (args.title.trim().length < 3) return []
    const results = await ctx.db
      .query('contentItems')
      .withSearchIndex('search_title', (q: any) => q.search('title', args.title))
      .take(10)
    return results.map(r => ({ _id: r._id as string, title: r.title, status: r.status }))
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

export const listApprovedForCalendar = query({
  args: {
    contentType: v.optional(contentTypeV),
    channel:     v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    search:      v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<{
    itemId: string
    title: string
    contentType: string
    coverImageUrl?: string
    channels: Array<'tumblr' | 'x'>
  }>> => {
    let items
    if (args.search && args.search.trim().length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items = await ctx.db.query('contentItems').withSearchIndex('search_title', (q: any) =>
        q.search('title', args.search!).eq('status', 'approved')
      ).take(500)
    } else {
      items = await ctx.db.query('contentItems')
        .withIndex('by_status', q => q.eq('status', 'approved'))
        .take(1000)
    }

    const result: Array<{ itemId: string; title: string; contentType: string; coverImageUrl?: string; channels: Array<'tumblr' | 'x'> }> = []

    for (const item of items) {
      if (args.contentType && item.contentType !== args.contentType) continue
      const variants = await ctx.db.query('contentVariants')
        .withIndex('by_item', q => q.eq('contentItemId', item._id))
        .collect()

      const channels = new Set<'tumblr' | 'x'>()
      for (const v of variants) {
        if (v.isActive && v.status === 'approved') channels.add(v.channel)
      }
      if (channels.size === 0) continue
      if (args.channel && !channels.has(args.channel)) continue

      result.push({
        itemId:       item._id as string,
        title:        item.title,
        contentType:  item.contentType,
        coverImageUrl: item.coverImageUrl,
        channels:     Array.from(channels),
      })
    }
    return result
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

export const listByImportJob = query({
  args: {
    importJobId: v.id('importJobs'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('contentItems')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_import_job', (q: any) => q.eq('importJobId', args.importJobId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

// Batch import from importer action — skips duplicates instead of throwing
export const importBatchInternal = internalMutation({
  args: {
    importJobId: v.optional(v.id('importJobs')),
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
    imported:  number
    skipped:   number
    newItems:  Array<{ id: string; sourcePostId: string }>
    errors:    Array<{ sourceId: string; title: string; error: string }>
  }> => {
    let imported = 0
    let skipped  = 0
    const newItems: Array<{ id: string; sourcePostId: string }> = []
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
          importJobId:     args.importJobId,
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

        newItems.push({ id: itemId, sourcePostId: item.sourcePostId })
        imported++
      } catch (err) {
        errors.push({
          sourceId: item.sourcePostId,
          title:    item.title,
          error:    err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { imported, skipped, newItems, errors }
  },
})

export const patchCoverImageUrlInternal = internalMutation({
  args: { id: v.id('contentItems'), coverImageUrl: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { coverImageUrl: args.coverImageUrl })
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

// ── DELETE (hard delete — for test cleanup and correcting erroneous imports) ──

export const deleteItem = mutation({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args): Promise<void> => {
    const item = await ctx.db.get(args.id)
    if (!item) throw new Error('Item not found')

    // Clear any schedule slots referencing this item
    const slots = await ctx.db
      .query('scheduleSlots')
      .withIndex('by_content_item', q => q.eq('contentItemId', args.id))
      .collect()
    for (const slot of slots) {
      if (!slot.locked) {
        await ctx.db.patch(slot._id, { contentItemId: undefined, variantId: undefined, status: 'empty' })
      }
    }

    // Delete variants
    const variants = await ctx.db
      .query('contentVariants')
      .withIndex('by_item', q => q.eq('contentItemId', args.id))
      .collect()
    for (const v of variants) await ctx.db.delete(v._id)

    // Delete channel scores
    const scores = await ctx.db
      .query('channelScores')
      .withIndex('by_item', q => q.eq('contentItemId', args.id))
      .collect()
    for (const s of scores) await ctx.db.delete(s._id)

    const assets = await ctx.db
      .query('mediaAssets')
      .withIndex('by_item', q => q.eq('contentItemId', args.id))
      .collect()
    for (const a of assets) {
      try { await ctx.storage.delete(a.storageId) } catch (_) {}
      await ctx.db.delete(a._id)
    }

    await ctx.db.delete(args.id)

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: args.id,
      eventType: 'item.deleted',
      payloadJson: { title: item.title, status: item.status, contentOrigin: item.contentOrigin },
    })
  },
})

export const bulkDeleteByImportJob = mutation({
  args: { importJobId: v.id('importJobs') },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    // Use filter instead of index — more robust if index deployment is pending
    const items = await ctx.db
      .query('contentItems')
      .filter(q => q.eq(q.field('importJobId'), args.importJobId))
      .collect()

    let deleted = 0
    for (const item of items) {
      const slots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_content_item', q => q.eq('contentItemId', item._id))
        .collect()
      for (const slot of slots) {
        if (!slot.locked) {
          await ctx.db.patch(slot._id, { contentItemId: undefined, variantId: undefined, status: 'empty' })
        }
      }
      const variants = await ctx.db.query('contentVariants').withIndex('by_item', q => q.eq('contentItemId', item._id)).collect()
      for (const v of variants) await ctx.db.delete(v._id)
      const scores = await ctx.db.query('channelScores').withIndex('by_item', q => q.eq('contentItemId', item._id)).collect()
      for (const s of scores) await ctx.db.delete(s._id)
      const assets = await ctx.db.query('mediaAssets').withIndex('by_item', q => q.eq('contentItemId', item._id)).collect()
      for (const a of assets) {
        try { await ctx.storage.delete(a.storageId) } catch (_) {}
        await ctx.db.delete(a._id)
      }
      await ctx.db.delete(item._id)
      deleted++
    }
    if (deleted > 0) {
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'contentItem',
        entityId: undefined,
        eventType: 'item.deleted',
        payloadJson: { importJobId: args.importJobId, bulk: true, deleted },
      })
    }
    return { deleted }
  },
})

export const bulkDeleteItems = mutation({
  args: { ids: v.array(v.id('contentItems')) },
  handler: async (ctx, args): Promise<{ deleted: number; skipped: number }> => {
    let deleted = 0
    let skipped = 0
    for (const id of args.ids) {
      const item = await ctx.db.get(id)
      if (!item) { skipped++; continue }

      const slots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_content_item', q => q.eq('contentItemId', id))
        .collect()
      for (const slot of slots) {
        if (!slot.locked) {
          await ctx.db.patch(slot._id, { contentItemId: undefined, variantId: undefined, status: 'empty' })
        }
      }

      const variants = await ctx.db
        .query('contentVariants')
        .withIndex('by_item', q => q.eq('contentItemId', id))
        .collect()
      for (const v of variants) await ctx.db.delete(v._id)

      const scores = await ctx.db
        .query('channelScores')
        .withIndex('by_item', q => q.eq('contentItemId', id))
        .collect()
      for (const s of scores) await ctx.db.delete(s._id)

      const assets = await ctx.db
        .query('mediaAssets')
        .withIndex('by_item', q => q.eq('contentItemId', id))
        .collect()
      for (const a of assets) {
        try { await ctx.storage.delete(a.storageId) } catch (_) {}
        await ctx.db.delete(a._id)
      }

      await ctx.db.delete(id)
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'contentItem',
        entityId: id,
        eventType: 'item.deleted',
        payloadJson: { title: item.title, bulk: true },
      })
      deleted++
    }
    return { deleted, skipped }
  },
})

// One-shot migration: assigns each orphan imported item to the correct job
// by matching its sourceDate against each job's configJson date range.
// Items without sourceDate or outside all ranges go to the fallback job (largest by itemsImported).
// Run via: npx convex run contentItems:backfillAllJobsPublic
export const backfillAllJobsPublic = mutation({
  args: {},
  handler: async (ctx): Promise<{ patched: number; unmatched: number; byJob: Record<string, number> }> => {
    // Load all import jobs with date ranges
    const jobs = await ctx.db.query('importJobs').collect()
    const jobRanges = jobs
      .filter(j => j.configJson?.afterTs !== undefined || j.configJson?.beforeTs !== undefined)
      .map(j => ({
        id: j._id,
        afterTs:  (j.configJson?.afterTs  ?? 0)              as number,
        beforeTs: (j.configJson?.beforeTs ?? Date.now())     as number,
        imported: j.itemsImported ?? 0,
      }))
      .sort((a, b) => a.afterTs - b.afterTs)

    const fallbackJob = [...jobs].sort((a, b) => (b.itemsImported ?? 0) - (a.itemsImported ?? 0))[0]

    // Load all orphan imported items (no importJobId)
    const orphans = await ctx.db
      .query('contentItems')
      .withIndex('by_origin', q => q.eq('contentOrigin', 'imported'))
      .filter(q => q.eq(q.field('importJobId'), undefined))
      .collect()

    const byJob: Record<string, number> = {}
    let unmatched = 0

    for (const item of orphans) {
      const ts = item.sourceDate ?? item.importedAt
      let matched = ts !== undefined
        ? jobRanges.find(r => ts >= r.afterTs && ts <= r.beforeTs)
        : undefined

      // If no range match, try ±7 days tolerance (edge posts may fall just outside)
      if (!matched && ts !== undefined) {
        const tolerance = 7 * 24 * 3600 * 1000
        matched = jobRanges.find(r => ts >= r.afterTs - tolerance && ts <= r.beforeTs + tolerance)
      }

      const targetId = matched?.id ?? fallbackJob?._id
      if (!targetId) { unmatched++; continue }

      await ctx.db.patch(item._id, { importJobId: targetId })
      const key = targetId.toString()
      byJob[key] = (byJob[key] ?? 0) + 1
    }

    return { patched: orphans.length - unmatched, unmatched, byJob }
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
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'tumblr').eq('status', 'generated')).collect(),
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'x').eq('status', 'generated')).collect(),
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'tumblr').eq('status', 'edited')).collect(),
      ctx.db.query('contentVariants').withIndex('by_channel_and_status', q => q.eq('channel', 'x').eq('status', 'edited')).collect(),
    ])
    // Distinct items with unapproved active variants
    const pendingItems = new Set<string>()
    for (const v of [...genTumblr, ...genX, ...editTumblr, ...editX]) {
      if (v.isActive) pendingItems.add(v.contentItemId as string)
    }

    // Items needing editorial review (imported or manual draft)
    const [inReview, draft] = await Promise.all([
      ctx.db.query('contentItems').withIndex('by_status', q => q.eq('status', 'in_review')).collect(),
      ctx.db.query('contentItems').withIndex('by_status', q => q.eq('status', 'draft')).collect(),
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
    const now = Date.now()
    const weekAnchor = new Date(now)
    weekAnchor.setUTCHours(0, 0, 0, 0)
    const dow = weekAnchor.getUTCDay()
    weekAnchor.setUTCDate(weekAnchor.getUTCDate() - (dow === 0 ? 6 : dow - 1))
    const startOfWeek = weekAnchor.getTime()
    const startOfMonth = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)

    const needsReview = await ctx.db
      .query('contentItems')
      .withIndex('by_needs_review', q => q.eq('needsReview', true))
      .collect()

    // Approvals this week via audit log
    const approvalEvents = await ctx.db
      .query('auditEvents')
      .withIndex('by_event_type', q => q.eq('eventType', 'item.approved'))
      .order('desc')
      .take(500)
    const approvedCount = approvalEvents.filter(e => e._creationTime >= startOfWeek).length

    // Scheduled: planned + ready slots
    const plannedSlots = await ctx.db
      .query('scheduleSlots')
      .withIndex('by_status', q => q.eq('status', 'planned'))
      .collect()
    const readySlots = await ctx.db
      .query('scheduleSlots')
      .withIndex('by_status', q => q.eq('status', 'ready'))
      .collect()
    const scheduledCount = plannedSlots.length + readySlots.length

    // Publications this month via publicationLog
    const pubLogs = await ctx.db
      .query('publicationLog')
      .withIndex('by_status', q => q.eq('publishStatus', 'success'))
      .order('desc')
      .take(500)
    const publishedCount = pubLogs.filter(l => l._creationTime >= startOfMonth).length

    return { needsReviewCount: needsReview.length, approvedCount, scheduledCount, publishedCount }
  },
})

export const getDashboardSparklines = query({
  args: {},
  handler: async (ctx): Promise<{ review: number[]; approved: number[]; published: number[] }> => {
    const days: number[] = Array.from({ length: 10 }, (_, i) => {
      const d = new Date()
      d.setUTCHours(0, 0, 0, 0)
      d.setUTCDate(d.getUTCDate() - (9 - i))
      return d.getTime()
    })
    const nextDay = (ts: number) => ts + 86400000

    const [pubLogs, approvalEvents, createdEvents] = await Promise.all([
      ctx.db.query('publicationLog')
        .withIndex('by_status', q => q.eq('publishStatus', 'success'))
        .order('desc').take(500),
      ctx.db.query('auditEvents')
        .withIndex('by_event_type', q => q.eq('eventType', 'item.approved'))
        .order('desc').take(500),
      ctx.db.query('auditEvents')
        .withIndex('by_event_type', q => q.eq('eventType', 'item.created'))
        .order('desc').take(500),
    ])

    const published = days.map(dayStart =>
      pubLogs.filter(l => l._creationTime >= dayStart && l._creationTime < nextDay(dayStart)).length
    )
    const approved = days.map(dayStart =>
      approvalEvents.filter(e => e._creationTime >= dayStart && e._creationTime < nextDay(dayStart)).length
    )
    const review = days.map(dayStart =>
      createdEvents.filter(e => e._creationTime >= dayStart && e._creationTime < nextDay(dayStart)).length
    )

    return { review, approved, published }
  },
})
