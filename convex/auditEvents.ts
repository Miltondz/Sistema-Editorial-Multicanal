import { query, internalMutation } from './_generated/server'
import { v } from 'convex/values'

export const listByEntity = query({
  args: {
    entityType: v.string(),
    entityId:   v.string(),
    limit:      v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('auditEvents')
      .withIndex('by_entity', q =>
        q.eq('entityType', args.entityType).eq('entityId', args.entityId)
      )
      .order('desc')
      .take(args.limit ?? 50)
  },
})

export const log = internalMutation({
  args: {
    entityType: v.string(),
    entityId: v.optional(v.string()),
    eventType: v.string(),
    payloadJson: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('auditEvents', {
      entityType: args.entityType,
      entityId: args.entityId,
      eventType: args.eventType,
      payloadJson: args.payloadJson,
    })
  },
})
