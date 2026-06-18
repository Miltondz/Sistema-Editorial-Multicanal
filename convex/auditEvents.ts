import { internalMutation } from './_generated/server'
import { v } from 'convex/values'

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
