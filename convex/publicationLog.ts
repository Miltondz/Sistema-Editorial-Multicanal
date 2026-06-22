import { query, internalQuery, internalMutation } from './_generated/server'
import { v } from 'convex/values'

export const listByItem = query({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('publicationLog')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .order('desc')
      .collect()
  },
})

export const listBySlot = query({
  args: { slotId: v.id('scheduleSlots') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('publicationLog')
      .filter(q => q.eq(q.field('slotId'), args.slotId))
      .order('desc')
      .take(5)
  },
})

export const create = internalMutation({
  args: {
    slotId: v.optional(v.id('scheduleSlots')),
    contentItemId: v.optional(v.id('contentItems')),
    variantId: v.optional(v.id('contentVariants')),
    channel: v.union(v.literal('tumblr'), v.literal('x')),
    publishStatus: v.union(
      v.literal('success'), v.literal('failed'),
      v.literal('retrying'), v.literal('skipped')
    ),
    payloadJson: v.optional(v.any()),
    responseJson: v.optional(v.any()),
    externalPostId: v.optional(v.string()),
    externalPostUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('publicationLog', args)
  },
})

export const countXPostsThisMonth = internalQuery({
  args: {},
  handler: async (ctx) => {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const posts = await ctx.db
      .query('publicationLog')
      .withIndex('by_channel', q => q.eq('channel', 'x'))
      .filter(q =>
        q.and(
          q.eq(q.field('publishStatus'), 'success'),
          q.gte(q.field('_creationTime'), startOfMonth.getTime())
        )
      )
      .collect()

    return posts.length
  },
})

// Public query: X write count this month for dashboard/settings display
export const getXWriteCountThisMonth = query({
  args: {},
  handler: async (ctx) => {
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)
    // take up to 500 — the monthly cap; filter in JS
    const posts = await ctx.db
      .query('publicationLog')
      .withIndex('by_channel', q => q.eq('channel', 'x'))
      .order('desc')
      .take(500)
    return posts.filter(p =>
      p.publishStatus === 'success' &&
      p._creationTime >= startOfMonth.getTime()
    ).length
  },
})

export const getTumblrWriteCountThisMonth = query({
  args: {},
  handler: async (ctx) => {
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)
    const posts = await ctx.db
      .query('publicationLog')
      .withIndex('by_channel', q => q.eq('channel', 'tumblr'))
      .order('desc')
      .take(1000)
    return posts.filter(p =>
      p.publishStatus === 'success' &&
      p._creationTime >= startOfMonth.getTime()
    ).length
  },
})

// Publications grouped by date for calendar heatmap (last 365 days)
export const getCalendarData = query({
  args: {},
  handler: async (ctx): Promise<Array<{ date: string; tumblr: number; x: number; total: number }>> => {
    const since = Date.now() - 365 * 24 * 60 * 60 * 1000
    const logs = await ctx.db
      .query('publicationLog')
      .withIndex('by_status', q => q.eq('publishStatus', 'success'))
      .order('desc')
      .take(2000)

    const byDate = new Map<string, { tumblr: number; x: number }>()
    for (const log of logs) {
      if (log._creationTime < since) continue
      const d = new Date(log._creationTime)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      const entry = byDate.get(key) ?? { tumblr: 0, x: 0 }
      if (log.channel === 'tumblr') entry.tumblr++
      else if (log.channel === 'x') entry.x++
      byDate.set(key, entry)
    }

    return Array.from(byDate.entries()).map(([date, counts]) => ({
      date,
      tumblr: counts.tumblr,
      x: counts.x,
      total: counts.tumblr + counts.x,
    }))
  },
})

// Public query: recent successful publications for dashboard
export const listRecent = query({
  args: {
    channel: v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 50)
    let logs
    if (args.channel) {
      logs = await ctx.db
        .query('publicationLog')
        .withIndex('by_channel', q => q.eq('channel', args.channel!))
        .order('desc')
        .take(limit * 2) // take extra to filter by success
    } else {
      logs = await ctx.db
        .query('publicationLog')
        .withIndex('by_status', q => q.eq('publishStatus', 'success'))
        .order('desc')
        .take(limit)
    }
    const successful = logs.filter(l => l.publishStatus === 'success').slice(0, limit)
    // Enrich with item title
    const enriched = []
    for (const log of successful) {
      const item = log.contentItemId ? await ctx.db.get(log.contentItemId) : null
      let coverImageUrl = item?.coverImageUrl ?? null
      if (!coverImageUrl && log.contentItemId) {
        const primaryAsset = await ctx.db
          .query('mediaAssets')
          .withIndex('by_item', q => q.eq('contentItemId', log.contentItemId!))
          .filter(q => q.eq(q.field('isPrimary'), true))
          .first()
        coverImageUrl = primaryAsset?.publicUrl ?? null
        if (!coverImageUrl) {
          const anyAsset = await ctx.db
            .query('mediaAssets')
            .withIndex('by_item', q => q.eq('contentItemId', log.contentItemId!))
            .first()
          coverImageUrl = anyAsset?.publicUrl ?? null
        }
      }
      enriched.push({
        ...log,
        itemTitle: item?.title ?? null,
        itemType: item?.contentType ?? null,
        coverImageUrl,
      })
    }
    return enriched
  },
})

// Internal query: recent successful publications for metricsCron
export const listSuccessfulSinceInternal = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query('publicationLog')
      .withIndex('by_status', q => q.eq('publishStatus', 'success'))
      .order('desc')
      .take(200)
    return logs.filter(l => l._creationTime >= args.since)
  },
})

// Public query: enriched publications for analytics page
export const listForAnalytics = query({
  args: {
    channel: v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200)
    let logs
    if (args.channel) {
      logs = await ctx.db
        .query('publicationLog')
        .withIndex('by_channel', q => q.eq('channel', args.channel!))
        .order('desc')
        .take(limit * 2)
    } else {
      logs = await ctx.db
        .query('publicationLog')
        .withIndex('by_status', q => q.eq('publishStatus', 'success'))
        .order('desc')
        .take(limit)
    }
    const successful = logs.filter(l => l.publishStatus === 'success').slice(0, limit)

    const enriched = []
    for (const log of successful) {
      const item = log.contentItemId ? await ctx.db.get(log.contentItemId) : null
      const slot = log.slotId ? await ctx.db.get(log.slotId) : null
      const metrics = await ctx.db
        .query('performanceMetrics')
        .withIndex('by_log', q => q.eq('publicationLogId', log._id))
        .first()
      enriched.push({
        _id:              log._id,
        _creationTime:    log._creationTime,
        channel:          log.channel,
        externalPostUrl:  log.externalPostUrl,
        contentType:      item?.contentType ?? null,
        contentOrigin:    item?.contentOrigin ?? null,
        enrichedManually: item?.enrichedManually ?? null,
        contentMode:      slot?.contentMode ?? null,
        dayPart:          slot?.dayPart ?? null,
        likes:            metrics?.likes ?? 0,
        reposts:          metrics?.reposts ?? 0,
        reblogs:          metrics?.reblogs ?? 0,
        impressions:      metrics?.impressions ?? 0,
        engagements:      metrics?.engagements ?? 0,
      })
    }
    return enriched
  },
})
