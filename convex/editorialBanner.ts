import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('editorialBanner')
      .withIndex('by_active', q => q.eq('active', true))
      .first()
  },
})

export const upsert = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    badgeText: v.string(),
    imageUrl: v.optional(v.string()),
    ctaLabel: v.string(),
    ctaHref: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('editorialBanner')
      .withIndex('by_active', q => q.eq('active', true))
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, { ...args })
      return existing._id
    }
    return await ctx.db.insert('editorialBanner', { ...args, active: true })
  },
})
