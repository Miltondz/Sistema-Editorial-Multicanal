import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

const CHANNEL_V = v.union(v.literal('tumblr'), v.literal('x'))

export const getByChannel = query({
  args: { channel: CHANNEL_V },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('scoringRules')
      .withIndex('by_channel', q => q.eq('channel', args.channel))
      .first()
  },
})

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('scoringRules').collect()
  },
})

export const update = mutation({
  args: {
    id: v.id('scoringRules'),
    patch: v.object({
      cooldownDaysItem: v.optional(v.number()),
      cooldownDaysTopic: v.optional(v.number()),
      weightClicks: v.optional(v.number()),
      weightEngagement: v.optional(v.number()),
      weightEvergreen: v.optional(v.number()),
      weightManualPriority: v.optional(v.number()),
      weightRecencyPenalty: v.optional(v.number()),
      weightTopicFatigue: v.optional(v.number()),
      originBoostManual: v.optional(v.number()),
      originBoostAssisted: v.optional(v.number()),
      originBoostEnriched: v.optional(v.number()),
      originBoostImported: v.optional(v.number()),
      quotaComic: v.optional(v.number()),
      quotaLibro: v.optional(v.number()),
      quotaCosplay: v.optional(v.number()),
      quotaArticulo: v.optional(v.number()),
      quotaOtros: v.optional(v.number()),
      active: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id)
    if (!rule) throw new Error('Scoring rule not found')
    await ctx.db.patch(args.id, args.patch)
  },
})

// Run once to seed default scoring rules for both channels
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query('scoringRules').collect()
    if (existing.length > 0) return { message: 'Already seeded' }

    const defaults = {
      cooldownDaysItem: 15,
      cooldownDaysTopic: 7,
      weightClicks: 0.25,
      weightEngagement: 0.25,
      weightEvergreen: 0.20,
      weightManualPriority: 0.15,
      weightRecencyPenalty: 0.10,
      weightTopicFatigue: 0.05,
      originBoostManual: 0.15,
      originBoostAssisted: 0.15,
      originBoostEnriched: 0.10,
      originBoostImported: 0.00,
      quotaComic: 0.30,
      quotaLibro: 0.25,
      quotaCosplay: 0.20,
      quotaArticulo: 0.15,
      quotaOtros: 0.10,
      active: true,
    }

    await ctx.db.insert('scoringRules', { ...defaults, channel: 'tumblr' })
    await ctx.db.insert('scoringRules', { ...defaults, channel: 'x' })

    return { message: 'Seeded scoring rules for tumblr and x' }
  },
})
