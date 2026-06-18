import { query, mutation, internalQuery, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'

const channelV = v.union(v.literal('tumblr'), v.literal('x'))
const dayPartV = v.union(v.literal('morning'), v.literal('afternoon'), v.literal('evening'))
const slotStatusV = v.union(
  v.literal('empty'), v.literal('planned'), v.literal('locked'),
  v.literal('ready'), v.literal('publishing'), v.literal('published'),
  v.literal('skipped'), v.literal('failed')
)

function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

// ── Public queries ────────────────────────────────────────────────────────────

export const listByDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    channel: channelV,
  },
  handler: async (ctx, args) => {
    const dates = getDatesInRange(args.startDate, args.endDate)
    const slots: Doc<'scheduleSlots'>[] = []
    for (const date of dates) {
      const daySlots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_date_and_channel', q => q.eq('scheduledFor', date).eq('channel', args.channel))
        .take(10)
      slots.push(...daySlots)
    }
    return slots
  },
})

// Enriched variant — joins slot with contentItem title/type for planner UI
export const listByDateRangeWithItems = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    channel: channelV,
  },
  handler: async (ctx, args) => {
    const dates = getDatesInRange(args.startDate, args.endDate)
    const slots: Doc<'scheduleSlots'>[] = []
    for (const date of dates) {
      const daySlots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_date_and_channel', q => q.eq('scheduledFor', date).eq('channel', args.channel))
        .take(10)
      slots.push(...daySlots)
    }

    const enriched = []
    for (const slot of slots) {
      if (!slot.contentItemId) {
        enriched.push({ ...slot, item: null })
        continue
      }
      const item = await ctx.db.get(slot.contentItemId)
      enriched.push({
        ...slot,
        item: item
          ? {
              _id: item._id,
              title: item.title,
              contentType: item.contentType,
              contentOrigin: item.contentOrigin,
              enrichedManually: item.enrichedManually,
              sourcePlatform: item.sourcePlatform,
            }
          : null,
      })
    }

    return enriched
  },
})

export const getById = query({
  args: { id: v.id('scheduleSlots') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// ── Public mutations ──────────────────────────────────────────────────────────

export const setLocked = mutation({
  args: {
    id: v.id('scheduleSlots'),
    locked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id)
    if (!slot) throw new Error('Slot not found')

    await ctx.db.patch(args.id, {
      locked: args.locked,
      status: args.locked ? 'locked' : slot.contentItemId ? 'planned' : 'empty',
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot',
      entityId: args.id,
      eventType: args.locked ? 'slot.locked' : 'slot.unlocked',
      payloadJson: { scheduledFor: slot.scheduledFor, dayPart: slot.dayPart, channel: slot.channel },
    })
  },
})

export const assign = mutation({
  args: {
    id: v.id('scheduleSlots'),
    contentItemId: v.optional(v.id('contentItems')),
    variantId: v.optional(v.id('contentVariants')),
    status: v.optional(slotStatusV),
  },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id)
    if (!slot) throw new Error('Slot not found')

    await ctx.db.patch(args.id, {
      contentItemId: args.contentItemId,
      variantId: args.variantId,
      status: args.status ?? (args.contentItemId ? 'planned' : 'empty'),
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot',
      entityId: args.id,
      eventType: 'slot.assigned',
      payloadJson: { scheduledFor: slot.scheduledFor, contentItemId: args.contentItemId, channel: slot.channel },
    })
  },
})

// ── Internal queries ──────────────────────────────────────────────────────────

// Used by publishCron (Entrega 6)
export const getReadySlotsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('scheduleSlots')
      .withIndex('by_status', q => q.eq('status', 'ready'))
      .take(50)
  },
})

// Fetches all data needed for calendar generation in a single query
export const getDataForGenerationInternal = internalQuery({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    channel: channelV,
  },
  handler: async (ctx, args) => {
    // Scoring rules for this channel
    const rules = await ctx.db
      .query('scoringRules')
      .withIndex('by_channel', q => q.eq('channel', args.channel))
      .first()

    // Existing slots in range to find locked ones
    const dates = getDatesInRange(args.startDate, args.endDate)
    const slotsInRange: Doc<'scheduleSlots'>[] = []
    for (const date of dates) {
      const daySlots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_date_and_channel', q => q.eq('scheduledFor', date).eq('channel', args.channel))
        .take(10)
      slotsInRange.push(...daySlots)
    }

    // Top candidates sorted by reuseScore desc — 300 is sufficient for a 30-day calendar
    const topScores = await ctx.db
      .query('channelScores')
      .withIndex('by_channel_and_score', q => q.eq('channel', args.channel))
      .order('desc')
      .take(300)

    // Fetch content items for those scores; filter to approved/published
    const allItems: Doc<'contentItems'>[] = []
    for (const score of topScores) {
      const item = await ctx.db.get(score.contentItemId)
      if (item && (item.status === 'approved' || item.status === 'published')) {
        allItems.push(item)
      }
    }

    // Approved variants for this channel (active check happens in action JS)
    const approvedVariants = await ctx.db
      .query('contentVariants')
      .withIndex('by_channel_and_status', q =>
        q.eq('channel', args.channel).eq('status', 'approved')
      )
      .take(500)

    // Recent publications for topic fatigue (most recent 200 for this channel)
    const recentPubs = await ctx.db
      .query('publicationLog')
      .withIndex('by_channel', q => q.eq('channel', args.channel))
      .order('desc')
      .take(200)

    return { rules, slotsInRange, topScores, allItems, approvedVariants, recentPubs }
  },
})

// ── Internal mutations ────────────────────────────────────────────────────────

export const clearUnlockedInRangeInternal = internalMutation({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    channel: channelV,
  },
  handler: async (ctx, args) => {
    const dates = getDatesInRange(args.startDate, args.endDate)
    for (const date of dates) {
      const slots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_date_and_channel', q => q.eq('scheduledFor', date).eq('channel', args.channel))
        .take(10)
      for (const slot of slots) {
        if (!slot.locked) {
          await ctx.db.delete(slot._id)
        }
      }
    }
  },
})

export const createBatchInternal = internalMutation({
  args: {
    slots: v.array(v.object({
      scheduledFor: v.string(),
      dayPart:  dayPartV,
      channel:  channelV,
      contentItemId: v.optional(v.id('contentItems')),
      variantId:     v.optional(v.id('contentVariants')),
      contentMode:   v.union(v.literal('new'), v.literal('recycled')),
      priority:      v.number(),
      locked:        v.boolean(),
      generationBatchId: v.optional(v.string()),
      status: slotStatusV,
    })),
  },
  handler: async (ctx, args): Promise<number> => {
    const ids: Id<'scheduleSlots'>[] = []
    for (const slot of args.slots) {
      const id = await ctx.db.insert('scheduleSlots', slot)
      ids.push(id)
    }

    if (ids.length > 0) {
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'scheduleSlot',
        entityId: undefined,
        eventType: 'slot.created',
        payloadJson: {
          count: ids.length,
          channel: args.slots[0].channel,
          batchId: args.slots[0].generationBatchId,
        },
      })
    }

    return ids.length
  },
})

// ── reschedule — move slot to different date / dayPart ────────────────────────

export const reschedule = mutation({
  args: {
    id: v.id('scheduleSlots'),
    scheduledFor: v.string(),  // YYYY-MM-DD
    dayPart: dayPartV,
  },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id)
    if (!slot) throw new Error('Slot not found')
    if (slot.locked) throw new Error('Slot bloqueado — desbloquear antes de mover')
    if (['publishing', 'published'].includes(slot.status)) {
      throw new Error('No se puede mover un slot ya publicado')
    }

    await ctx.db.patch(args.id, {
      scheduledFor: args.scheduledFor,
      dayPart: args.dayPart,
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot',
      entityId: args.id,
      eventType: 'slot.rescheduled',
      payloadJson: {
        channel: slot.channel,
        from: `${slot.scheduledFor} ${slot.dayPart}`,
        to: `${args.scheduledFor} ${args.dayPart}`,
      },
    })
  },
})

// ── createManual — manually add a slot for a specific date/dayPart ────────────

export const createManual = mutation({
  args: {
    scheduledFor: v.string(),
    dayPart: dayPartV,
    channel: channelV,
    contentItemId: v.optional(v.id('contentItems')),
    variantId: v.optional(v.id('contentVariants')),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('scheduleSlots', {
      scheduledFor: args.scheduledFor,
      dayPart: args.dayPart,
      channel: args.channel,
      contentItemId: args.contentItemId,
      variantId: args.variantId,
      contentMode: 'new',
      priority: 0,
      locked: false,
      status: args.contentItemId ? 'planned' : 'empty',
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot',
      entityId: id,
      eventType: 'slot.created_manual',
      payloadJson: { channel: args.channel, scheduledFor: args.scheduledFor, dayPart: args.dayPart },
    })

    return id
  },
})

// ── deleteSlot — remove an individual unlocked slot ──────────────────────────

export const deleteSlot = mutation({
  args: { id: v.id('scheduleSlots') },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id)
    if (!slot) throw new Error('Slot not found')
    if (slot.locked) throw new Error('Slot bloqueado — desbloquear antes de eliminar')
    if (['publishing', 'published'].includes(slot.status)) {
      throw new Error('No se puede eliminar un slot publicado')
    }
    await ctx.db.delete(args.id)
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot',
      entityId: args.id,
      eventType: 'slot.deleted',
      payloadJson: { channel: slot.channel, scheduledFor: slot.scheduledFor },
    })
  },
})

export const updateStatusInternal = internalMutation({
  args: {
    id: v.id('scheduleSlots'),
    status: slotStatusV,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status })
  },
})

// Used by publishSlot action to fetch slot data
export const getByIdInternal = internalQuery({
  args: { id: v.id('scheduleSlots') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Used by publishCron to find slots due for the current dayPart
export const getPlannedForDayPartInternal = internalQuery({
  args: {
    scheduledFor: v.string(),
    dayPart: dayPartV,
  },
  handler: async (ctx, args): Promise<Doc<'scheduleSlots'>[]> => {
    const channels = ['tumblr', 'x'] as const
    const result: Doc<'scheduleSlots'>[] = []
    for (const channel of channels) {
      const slots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_date_and_channel', q =>
          q.eq('scheduledFor', args.scheduledFor).eq('channel', channel)
        )
        .take(10)
      for (const slot of slots) {
        if (
          slot.dayPart === args.dayPart &&
          (slot.status === 'planned' || slot.status === 'ready') &&
          !slot.locked
        ) {
          result.push(slot)
        }
      }
    }
    return result
  },
})

// Public query: failed slots for dashboard (with item enrichment)
export const listFailed = query({
  args: { channel: v.optional(channelV) },
  handler: async (ctx, args) => {
    let slots: Doc<'scheduleSlots'>[]
    if (args.channel) {
      slots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_channel_and_status', q =>
          q.eq('channel', args.channel!).eq('status', 'failed')
        )
        .order('desc')
        .take(50)
    } else {
      slots = await ctx.db
        .query('scheduleSlots')
        .withIndex('by_status', q => q.eq('status', 'failed'))
        .order('desc')
        .take(50)
    }

    const enriched = []
    for (const slot of slots) {
      const item = slot.contentItemId ? await ctx.db.get(slot.contentItemId) : null
      enriched.push({
        ...slot,
        item: item ? { _id: item._id, title: item.title, contentType: item.contentType } : null,
      })
    }
    return enriched
  },
})
