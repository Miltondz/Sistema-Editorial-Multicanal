import { query, mutation, internalQuery, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

const channelV = v.union(v.literal('tumblr'), v.literal('x'))

const variantStatusV = v.union(
  v.literal('not_started'), v.literal('generated'), v.literal('edited'),
  v.literal('approved'), v.literal('scheduled'), v.literal('published'),
  v.literal('failed'), v.literal('disabled')
)

export const listByItem = query({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('contentVariants')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .collect()
  },
})

export const getActiveForChannel = internalQuery({
  args: {
    contentItemId: v.id('contentItems'),
    channel: channelV,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('contentVariants')
      .withIndex('by_item_and_channel', q =>
        q.eq('contentItemId', args.contentItemId).eq('channel', args.channel)
      )
      .filter(q => q.eq(q.field('isActive'), true))
      .first()
  },
})

export const create = mutation({
  args: {
    contentItemId: v.id('contentItems'),
    channel: channelV,
    headline: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    ctaText: v.optional(v.string()),
    selectedMediaIds: v.optional(v.array(v.id('mediaAssets'))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('contentVariants')
      .withIndex('by_item_and_channel', q =>
        q.eq('contentItemId', args.contentItemId).eq('channel', args.channel)
      )
      .filter(q => q.eq(q.field('isActive'), true))
      .first()

    let versionNumber = 1
    if (existing) {
      await ctx.db.patch(existing._id, { isActive: false })
      versionNumber = existing.versionNumber + 1
    }

    const variantId = await ctx.db.insert('contentVariants', {
      contentItemId: args.contentItemId,
      channel: args.channel,
      headline: args.headline,
      bodyText: args.bodyText,
      ctaText: args.ctaText,
      selectedMediaIds: args.selectedMediaIds ?? [],
      status: 'not_started',
      versionNumber,
      isActive: true,
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentVariant',
      entityId: variantId,
      eventType: 'variant.created',
      payloadJson: { channel: args.channel, contentItemId: args.contentItemId },
    })

    return variantId
  },
})

export const update = mutation({
  args: {
    id: v.id('contentVariants'),
    headline: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    ctaText: v.optional(v.string()),
    selectedMediaIds: v.optional(v.array(v.id('mediaAssets'))),
  },
  handler: async (ctx, args) => {
    const variant = await ctx.db.get(args.id)
    if (!variant) throw new Error('Variant not found')

    await ctx.db.patch(args.id, {
      headline: args.headline,
      bodyText: args.bodyText,
      ctaText: args.ctaText,
      ...(args.selectedMediaIds !== undefined ? { selectedMediaIds: args.selectedMediaIds } : {}),
      status: 'edited',
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentVariant',
      entityId: args.id,
      eventType: 'variant.edited',
      payloadJson: { channel: variant.channel },
    })
  },
})

export const approve = mutation({
  args: { id: v.id('contentVariants') },
  handler: async (ctx, args) => {
    const variant = await ctx.db.get(args.id)
    if (!variant) throw new Error('Variant not found')

    const allowed = ['not_started', 'generated', 'edited']
    if (!allowed.includes(variant.status)) {
      throw new Error(`Cannot approve variant with status: ${variant.status}`)
    }

    // Deactivate any other active variant for this item+channel before activating this one
    if (!variant.isActive) {
      const currentActive = await ctx.db
        .query('contentVariants')
        .withIndex('by_item_and_channel', q =>
          q.eq('contentItemId', variant.contentItemId).eq('channel', variant.channel)
        )
        .filter(q => q.eq(q.field('isActive'), true))
        .first()
      if (currentActive) await ctx.db.patch(currentActive._id, { isActive: false })
    }

    await ctx.db.patch(args.id, {
      status: 'approved',
      approvedAt: Date.now(),
      isActive: true,
    })

    // Auto-approve the parent content item if it's still in a pre-approved state.
    // The calendar generation requires item.status === 'approved' to include it in the pool.
    const item = await ctx.db.get(variant.contentItemId)
    if (item && ['draft', 'researching', 'in_review'].includes(item.status)) {
      await ctx.db.patch(item._id, { status: 'approved', needsReview: false })
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'contentItem',
        entityId:   item._id,
        eventType:  'item.approved',
        payloadJson: { trigger: 'variant.approved', channel: variant.channel },
      })
    }

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentVariant',
      entityId: args.id,
      eventType: 'variant.approved',
      payloadJson: { channel: variant.channel },
    })
  },
})

// Called from AI action — creates new active variant with status='generated'
export const applyGeneration = internalMutation({
  args: {
    contentItemId: v.id('contentItems'),
    channel: channelV,
    headline: v.string(),
    bodyText: v.string(),
    ctaText: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('contentVariants')
      .withIndex('by_item_and_channel', q =>
        q.eq('contentItemId', args.contentItemId).eq('channel', args.channel)
      )
      .filter(q => q.eq(q.field('isActive'), true))
      .first()

    let versionNumber = 1
    if (existing) {
      // Never deactivate a published variant — it is a permanent record
      if (existing.status === 'published') {
        versionNumber = existing.versionNumber + 1
        // Insert new variant without touching the published one
        const variantId = await ctx.db.insert('contentVariants', {
          contentItemId: args.contentItemId,
          channel: args.channel,
          headline: args.headline,
          bodyText: args.bodyText,
          ctaText: args.ctaText,
          selectedMediaIds: [],
          status: 'generated',
          versionNumber,
          isActive: false, // published one keeps isActive=true
        })
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'contentVariant',
          entityId: variantId,
          eventType: 'variant.generated',
          payloadJson: { channel: args.channel, contentItemId: args.contentItemId },
        })
        return variantId
      }
      await ctx.db.patch(existing._id, { isActive: false })
      versionNumber = existing.versionNumber + 1
    }

    const variantId = await ctx.db.insert('contentVariants', {
      contentItemId: args.contentItemId,
      channel: args.channel,
      headline: args.headline,
      bodyText: args.bodyText,
      ctaText: args.ctaText,
      selectedMediaIds: [],
      status: 'generated',
      versionNumber,
      isActive: true,
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentVariant',
      entityId: variantId,
      eventType: 'variant.generated',
      payloadJson: { channel: args.channel, contentItemId: args.contentItemId },
    })

    return variantId
  },
})

export const updateStatusInternal = internalMutation({
  args: {
    id: v.id('contentVariants'),
    status: variantStatusV,
    publishedLastAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      ...(args.publishedLastAt !== undefined ? { publishedLastAt: args.publishedLastAt } : {}),
    })
  },
})
