import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'

function getCurrentDayPart(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getUTCHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

export const publishPendingSlots = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10)
    const dayPart = getCurrentDayPart()

    const slots = await ctx.runQuery(
      internal.scheduleSlots.getPlannedForDayPartInternal,
      { scheduledFor: today, dayPart }
    ) as Array<{ _id: any }>

    for (const slot of slots) {
      await ctx.runAction(internal.actions.publisher.publishSlot, {
        slotId: slot._id,
        retryCount: 0,
      })
    }
  },
})
