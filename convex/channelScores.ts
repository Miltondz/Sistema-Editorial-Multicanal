import { query, internalMutation } from './_generated/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'

export const getByItem = query({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('channelScores')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .collect()
  },
})

export const getByItemAndChannel = query({
  args: {
    contentItemId: v.id('contentItems'),
    channel: v.union(v.literal('tumblr'), v.literal('x')),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('channelScores')
      .withIndex('by_item_and_channel', q =>
        q.eq('contentItemId', args.contentItemId).eq('channel', args.channel)
      )
      .first()
  },
})

export const updateAfterPublish = internalMutation({
  args: {
    contentItemId: v.id('contentItems'),
    channel: v.union(v.literal('tumblr'), v.literal('x')),
  },
  handler: async (ctx, args) => {
    const score = await ctx.db
      .query('channelScores')
      .withIndex('by_item_and_channel', q =>
        q.eq('contentItemId', args.contentItemId).eq('channel', args.channel)
      )
      .first()
    if (score) {
      await ctx.db.patch(score._id, {
        lastPostedAt: Date.now(),
        postCount: score.postCount + 1,
      })
    }
  },
})

function getOriginBoost(
  origin: string,
  enriched: boolean,
  rules: Doc<'scoringRules'>
): number {
  if (origin === 'manual')   return rules.originBoostManual
  if (origin === 'assisted') return rules.originBoostAssisted
  if (origin === 'imported' && enriched) return rules.originBoostEnriched
  return rules.originBoostImported
}

// Recomputes reuseScore for all items in one channel — called from scoring action
export const recomputeForChannelInternal = internalMutation({
  args: { channel: v.union(v.literal('tumblr'), v.literal('x')) },
  handler: async (ctx, args): Promise<number> => {
    const rules = await ctx.db
      .query('scoringRules')
      .withIndex('by_channel', q => q.eq('channel', args.channel))
      .first()
    if (!rules) return 0

    const allScores = await ctx.db
      .query('channelScores')
      .withIndex('by_channel_and_score', q => q.eq('channel', args.channel))
      .collect()

    let updated = 0
    for (const score of allScores) {
      const item = await ctx.db.get(score.contentItemId)
      if (!item || (item.status !== 'approved' && item.status !== 'published')) continue

      const evergreenScore =
        item.evergreenClass === 'high' ? 1.0 :
        item.evergreenClass === 'medium' ? 0.6 : 0.2

      const normalizedPriority = (item.editorialPriority - 1) / 4

      const daysSinceLast = score.lastPostedAt
        ? (Date.now() - score.lastPostedAt) / (1000 * 60 * 60 * 24)
        : 999
      const recencyPenalty = daysSinceLast >= rules.cooldownDaysItem
        ? 0
        : 1 - daysSinceLast / rules.cooldownDaysItem

      const originBoost = getOriginBoost(item.contentOrigin, item.enrichedManually, rules)

      const reuseScore = Math.max(0, Math.min(1,
        rules.weightClicks         * score.clickScore         +
        rules.weightEngagement     * score.engagementScore    +
        rules.weightEvergreen      * evergreenScore           +
        rules.weightManualPriority * normalizedPriority       -
        rules.weightRecencyPenalty * recencyPenalty           +
        originBoost
      ))

      await ctx.db.patch(score._id, { reuseScore })
      updated++
    }

    return updated
  },
})

// Called from contentItems.create — creates scores for both channels
export const createForItem = internalMutation({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    const defaults = {
      contentItemId: args.contentItemId,
      clickScore: 0,
      engagementScore: 0,
      reblogScore: 0,
      evergreenScore: 0,
      reuseScore: 0,
      postCount: 0,
    }
    await ctx.db.insert('channelScores', { ...defaults, channel: 'tumblr' })
    await ctx.db.insert('channelScores', { ...defaults, channel: 'x' })
  },
})
