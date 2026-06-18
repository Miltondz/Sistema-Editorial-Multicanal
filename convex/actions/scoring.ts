"use node";

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'

const channelV = v.union(v.literal('tumblr'), v.literal('x'))
const DAY_PARTS = ['morning', 'afternoon', 'evening'] as const

const TYPE_TO_QUOTA_GROUP: Record<string, string> = {
  comic:     'comic',
  libro:     'libro',
  cosplay:   'cosplay',
  articulo:  'articulo',
  autor:     'otros',
  poster:    'otros',
  pelicula:  'otros',
  personaje: 'otros',
  coleccion: 'otros',
}

function getQuotaGroup(contentType: string): string {
  return TYPE_TO_QUOTA_GROUP[contentType] ?? 'otros'
}

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

// ── recomputeAllScores ────────────────────────────────────────────────────────

export const recomputeAllScores = action({
  args: { channel: channelV },
  handler: async (ctx, args): Promise<{ updated: number }> => {
    const updated: number = await ctx.runMutation(
      internal.channelScores.recomputeForChannelInternal,
      { channel: args.channel }
    )
    return { updated }
  },
})

// ── generateCalendar ──────────────────────────────────────────────────────────

export const generateCalendar = action({
  args: {
    startDate:        v.string(),
    endDate:          v.string(),
    channel:          channelV,
    overwriteUnlocked: v.optional(v.boolean()),
    selectedItemIds:  v.optional(v.array(v.id('contentItems'))),
  },
  handler: async (ctx, args): Promise<{
    slotsCreated: number
    slotsSkipped: number
    batchId: string
  }> => {
    const overwrite = args.overwriteUnlocked ?? true

    // Clamp: never generate slots in the past (server-side defense-in-depth)
    const serverToday = new Date()
    const todayISO = `${serverToday.getUTCFullYear()}-${String(serverToday.getUTCMonth()+1).padStart(2,'0')}-${String(serverToday.getUTCDate()).padStart(2,'0')}`
    const effectiveStart = args.startDate < todayISO ? todayISO : args.startDate

    // Single internal query fetches all data needed
    const data = await ctx.runQuery(
      internal.scheduleSlots.getDataForGenerationInternal,
      { startDate: effectiveStart, endDate: args.endDate, channel: args.channel }
    )

    const { rules, slotsInRange, topScores, allItems, approvedVariants, recentPubs } = data as {
      rules:            Doc<'scoringRules'> | null
      slotsInRange:     Doc<'scheduleSlots'>[]
      topScores:        Doc<'channelScores'>[]
      allItems:         Doc<'contentItems'>[]
      approvedVariants: Doc<'contentVariants'>[]
      recentPubs:       Doc<'publicationLog'>[]
    }

    if (!rules) throw new Error(`No scoring rules found for channel: ${args.channel}. Run seed in /settings first.`)

    // Build lookup maps
    const scoreMap = new Map<string, Doc<'channelScores'>>()
    for (const s of topScores) scoreMap.set(s.contentItemId as string, s)

    // Active approved variants only
    const variantMap = new Map<string, Doc<'contentVariants'>>()
    for (const variant of approvedVariants) {
      if (variant.isActive) variantMap.set(variant.contentItemId as string, variant)
    }

    // Locked slot keys — these are never overwritten
    const lockedSet = new Set<string>()
    for (const slot of slotsInRange) {
      if (slot.locked) lockedSet.add(`${slot.scheduledFor}:${slot.dayPart}`)
    }

    // Topic fatigue groups from recent publications
    const itemMap = new Map<string, Doc<'contentItems'>>()
    for (const item of allItems) itemMap.set(item._id as string, item)

    const cooldownTopicMs = rules.cooldownDaysTopic * 24 * 60 * 60 * 1000
    const cutoffTs = Date.now() - cooldownTopicMs
    const fatigueGroups = new Set<string>()
    for (const pub of recentPubs) {
      if (pub._creationTime < cutoffTs) continue
      if (pub.publishStatus !== 'success') continue
      if (!pub.contentItemId) continue
      const pubItem = itemMap.get(pub.contentItemId as string)
      if (pubItem?.topicFatigueGroup) fatigueGroups.add(pubItem.topicFatigueGroup)
    }

    // Build eligible candidate pool
    const cooldownItemMs = rules.cooldownDaysItem * 24 * 60 * 60 * 1000
    const now = Date.now()

    interface Candidate {
      itemId:     Id<'contentItems'>
      variantId:  Id<'contentVariants'>
      item:       Doc<'contentItems'>
      reuseScore: number
      postCount:  number
      quotaGroup: string
    }

    const selectedSet = args.selectedItemIds && args.selectedItemIds.length > 0
      ? new Set(args.selectedItemIds.map(id => id as string))
      : null

    const eligible: Candidate[] = []
    for (const item of allItems) {
      const itemId = item._id as string
      if (selectedSet && !selectedSet.has(itemId)) continue
      const variant = variantMap.get(itemId)
      if (!variant) continue

      const score = scoreMap.get(itemId)
      if (score?.lastPostedAt && now - score.lastPostedAt < cooldownItemMs) continue
      if (item.topicFatigueGroup && fatigueGroups.has(item.topicFatigueGroup)) continue

      eligible.push({
        itemId:     item._id,
        variantId:  variant._id,
        item,
        reuseScore: score?.reuseScore ?? 0,
        postCount:  score?.postCount ?? 0,
        quotaGroup: getQuotaGroup(item.contentType),
      })
    }
    eligible.sort((a, b) => b.reuseScore - a.reuseScore)

    // Clear non-locked slots in range (full month range — removes stale past slots)
    if (overwrite) {
      await ctx.runMutation(internal.scheduleSlots.clearUnlockedInRangeInternal, {
        startDate: args.startDate,
        endDate:   args.endDate,
        channel:   args.channel,
      })
    }

    // Calendar generation with quota tracking (clamped range — no past dates)
    const batchId = `cal-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const dates = getDatesInRange(effectiveStart, args.endDate)

    const quotaCount: Record<string, number> = { comic: 0, libro: 0, cosplay: 0, articulo: 0, otros: 0 }
    const quotaTarget: Record<string, number> = {
      comic:    rules.quotaComic,
      libro:    rules.quotaLibro,
      cosplay:  rules.quotaCosplay,
      articulo: rules.quotaArticulo,
      otros:    rules.quotaOtros,
    }

    // Track intra-batch item cooldown (YYYY-MM-DD of last assignment)
    const batchItemLast = new Map<string, string>()
    // Track intra-batch topic fatigue cooldown
    const batchGroupLast = new Map<string, string>()

    type SlotPayload = {
      scheduledFor:      string
      dayPart:           'morning' | 'afternoon' | 'evening'
      channel:           'tumblr' | 'x'
      contentItemId:     Id<'contentItems'>
      variantId:         Id<'contentVariants'>
      contentMode:       'new' | 'recycled'
      priority:          number
      locked:            boolean
      generationBatchId: string
      status:            'planned'
    }

    const newSlots: SlotPayload[] = []

    for (const date of dates) {
      const dateTs = new Date(date + 'T00:00:00Z').getTime()

      for (const dayPart of DAY_PARTS) {
        if (lockedSet.has(`${date}:${dayPart}`)) continue

        const totalSoFar = newSlots.length + 1
        let best: Candidate | null = null
        let bestScore = -Infinity

        for (const c of eligible) {
          const itemId = c.itemId as string

          // Intra-batch item cooldown
          const lastItemDate = batchItemLast.get(itemId)
          if (lastItemDate) {
            const lastTs = new Date(lastItemDate + 'T00:00:00Z').getTime()
            if (dateTs - lastTs < cooldownItemMs) continue
          }

          // Intra-batch topic fatigue cooldown
          const group = c.item.topicFatigueGroup
          if (group) {
            const lastGroupDate = batchGroupLast.get(group)
            if (lastGroupDate) {
              const lastTs = new Date(lastGroupDate + 'T00:00:00Z').getTime()
              if (dateTs - lastTs < cooldownTopicMs) continue
            }
          }

          // Quota-adjusted score: boost under-represented groups
          const actual  = quotaCount[c.quotaGroup] ?? 0
          const target  = (quotaTarget[c.quotaGroup] ?? 0) * totalSoFar
          const deficit = Math.max(0, target - actual)
          const adjusted = c.reuseScore + deficit * 0.5

          if (adjusted > bestScore) {
            bestScore = adjusted
            best = c
          }
        }

        if (!best) continue

        newSlots.push({
          scheduledFor:      date,
          dayPart,
          channel:           args.channel,
          contentItemId:     best.itemId,
          variantId:         best.variantId,
          contentMode:       best.postCount > 0 ? 'recycled' : 'new',
          priority:          newSlots.length,
          locked:            false,
          generationBatchId: batchId,
          status:            'planned',
        })

        quotaCount[best.quotaGroup] = (quotaCount[best.quotaGroup] ?? 0) + 1
        batchItemLast.set(best.itemId as string, date)
        if (best.item.topicFatigueGroup) batchGroupLast.set(best.item.topicFatigueGroup, date)
      }
    }

    // Single mutation to persist all new slots
    if (newSlots.length > 0) {
      await ctx.runMutation(internal.scheduleSlots.createBatchInternal, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slots: newSlots as any,
      })
    }

    const totalPossible = dates.length * DAY_PARTS.length - lockedSet.size

    return {
      slotsCreated: newSlots.length,
      slotsSkipped: Math.max(0, totalPossible - newSlots.length),
      batchId,
    }
  },
})

// ── getEligibleItems ──────────────────────────────────────────────────────────

export const getEligibleItems = action({
  args: {
    channel: channelV,
  },
  handler: async (ctx, args): Promise<Array<{
    itemId:      string
    title:       string
    contentType: string
    quotaGroup:  string
    reuseScore:  number
    lastPostedAt?: number
  }>> => {
    const today = new Date().toISOString().slice(0, 10)
    const data = await ctx.runQuery(
      internal.scheduleSlots.getDataForGenerationInternal,
      { startDate: today, endDate: today, channel: args.channel }
    )

    const { rules, topScores, allItems, approvedVariants, recentPubs } = data as {
      rules:            Doc<'scoringRules'> | null
      topScores:        Doc<'channelScores'>[]
      allItems:         Doc<'contentItems'>[]
      approvedVariants: Doc<'contentVariants'>[]
      recentPubs:       Doc<'publicationLog'>[]
    }

    if (!rules) return []

    const scoreMap = new Map<string, Doc<'channelScores'>>()
    for (const s of topScores) scoreMap.set(s.contentItemId as string, s)

    const variantMap = new Map<string, Doc<'contentVariants'>>()
    for (const variant of approvedVariants) {
      if (variant.isActive) variantMap.set(variant.contentItemId as string, variant)
    }

    const itemMap = new Map<string, Doc<'contentItems'>>()
    for (const item of allItems) itemMap.set(item._id as string, item)

    const cutoffTs = Date.now() - rules.cooldownDaysTopic * 24 * 60 * 60 * 1000
    const fatigueGroups = new Set<string>()
    for (const pub of recentPubs) {
      if (pub._creationTime < cutoffTs || pub.publishStatus !== 'success' || !pub.contentItemId) continue
      const pubItem = itemMap.get(pub.contentItemId as string)
      if (pubItem?.topicFatigueGroup) fatigueGroups.add(pubItem.topicFatigueGroup)
    }

    const cooldownItemMs = rules.cooldownDaysItem * 24 * 60 * 60 * 1000
    const now = Date.now()

    const result = []
    for (const item of allItems) {
      const itemId = item._id as string
      if (!variantMap.has(itemId)) continue
      const score = scoreMap.get(itemId)
      if (score?.lastPostedAt && now - score.lastPostedAt < cooldownItemMs) continue
      if (item.topicFatigueGroup && fatigueGroups.has(item.topicFatigueGroup)) continue

      result.push({
        itemId,
        title:       item.title,
        contentType: item.contentType,
        quotaGroup:  getQuotaGroup(item.contentType),
        reuseScore:  score?.reuseScore ?? 0,
        lastPostedAt: score?.lastPostedAt,
      })
    }

    return result.sort((a, b) => b.reuseScore - a.reuseScore)
  },
})
