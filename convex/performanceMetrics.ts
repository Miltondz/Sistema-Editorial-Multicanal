import { query, internalMutation } from './_generated/server'
import { v } from 'convex/values'

export const listByLog = query({
  args: { publicationLogId: v.id('publicationLog') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('performanceMetrics')
      .withIndex('by_log', q => q.eq('publicationLogId', args.publicationLogId))
      .first()
  },
})

export const listRecentByChannel = query({
  args: {
    channel: v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200)
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

    const result = []
    for (const log of successful) {
      const metrics = await ctx.db
        .query('performanceMetrics')
        .withIndex('by_log', q => q.eq('publicationLogId', log._id))
        .first()
      if (!metrics) continue
      result.push({
        _id:            log._id,
        _creationTime:  log._creationTime,
        channel:        log.channel,
        externalPostUrl: log.externalPostUrl,
        impressions:    metrics.impressions,
        engagements:    metrics.engagements,
        likes:          metrics.likes,
        reposts:        metrics.reposts,
        reblogs:        metrics.reblogs,
        linkClicks:     metrics.linkClicks,
      })
    }
    return result
  },
})

export const upsertInternal = internalMutation({
  args: {
    publicationLogId: v.id('publicationLog'),
    impressions:    v.number(),
    engagements:    v.number(),
    likes:          v.number(),
    replies:        v.number(),
    reposts:        v.number(),
    reblogs:        v.number(),
    linkClicks:     v.number(),
    profileClicks:  v.number(),
    bookmarks:      v.number(),
    outboundClickRate: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('performanceMetrics')
      .withIndex('by_log', q => q.eq('publicationLogId', args.publicationLogId))
      .first()
    const { publicationLogId, ...data } = args
    if (existing) {
      await ctx.db.patch(existing._id, data)
    } else {
      await ctx.db.insert('performanceMetrics', { publicationLogId, ...data })
    }
  },
})
