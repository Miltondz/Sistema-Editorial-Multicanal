import { query, mutation, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

export const getNextUpcoming = query({
  args: {},
  handler: async (ctx) => {
    const today = new Date()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day   = String(today.getDate()).padStart(2, '0')
    const todayMMDD = `${month}-${day}`
    const todayNum  = parseInt(month + day)

    const allActive = await ctx.db
      .query('specialDates')
      .withIndex('by_active', q => q.eq('active', true))
      .collect()

    const upcoming = allActive
      .filter(d => {
        const mmdd = d.dateType === 'anniversary' ? d.date : d.date.slice(5).replace('/', '-')
        const parts = mmdd.split('-')
        if (parts.length < 2) return false
        const num = parseInt(parts[0] + parts[1])
        const diff = num - todayNum
        return diff >= 0 && diff <= 30
      })
      .sort((a, b) => {
        const aDate = a.dateType === 'anniversary' ? a.date : a.date.slice(5)
        const bDate = b.dateType === 'anniversary' ? b.date : b.date.slice(5)
        return aDate.localeCompare(bDate)
      })

    return upcoming[0] ?? null
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('specialDates')
      .withIndex('by_active', q => q.eq('active', true))
      .collect()
  },
})

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('specialDates').collect()
  },
})

export const create = mutation({
  args: {
    date: v.string(),
    dateType: v.union(v.literal('anniversary'), v.literal('one_time')),
    title: v.string(),
    description: v.optional(v.string()),
    contentType: v.optional(v.string()),
    tags: v.array(v.string()),
    relevanceScore: v.number(),
    category: v.optional(v.string()),
    teaserText: v.optional(v.string()),
    bannerImageUrl: v.optional(v.string()),
    bannerImageAlt: v.optional(v.string()),
    diversityTags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('specialDates', {
      ...args,
      aiGenerated: false,
      active: true,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id('specialDates'),
    date: v.optional(v.string()),
    dateType: v.optional(v.union(v.literal('anniversary'), v.literal('one_time'))),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    relevanceScore: v.optional(v.number()),
    active: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    teaserText: v.optional(v.string()),
    bannerImageUrl: v.optional(v.string()),
    bannerImageAlt: v.optional(v.string()),
    diversityTags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args
    await ctx.db.patch(id, patch)
  },
})

export const clearIdeas = mutation({
  args: { id: v.id('specialDates') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { aiIdeas: undefined })
  },
})

export const generateBannerUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const confirmBannerUpload = mutation({
  args: {
    id: v.id('specialDates'),
    storageId: v.id('_storage'),
    alt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId)
    if (!url) throw new Error('Storage URL not found')
    await ctx.db.patch(args.id, { bannerImageUrl: url, bannerImageAlt: args.alt })
    return url
  },
})

export const remove = mutation({
  args: { id: v.id('specialDates') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})

export const saveIdeas = internalMutation({
  args: { id: v.id('specialDates'), aiIdeas: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { aiIdeas: args.aiIdeas, aiGenerated: true })
  },
})

// ── Today multi-banner ────────────────────────────────────────────────────────

export const getTodayAll = query({
  args: {},
  handler: async (ctx) => {
    const today = new Date()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day   = String(today.getDate()).padStart(2, '0')
    const todayMMDD = `${month}-${day}`

    const allActive = await ctx.db
      .query('specialDates')
      .withIndex('by_active', q => q.eq('active', true))
      .take(500)

    return allActive
      .filter(d => {
        const mmdd = d.dateType === 'anniversary' ? d.date : d.date.slice(5)
        return mmdd === todayMMDD
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
  },
})

// ── Upcoming timeline ─────────────────────────────────────────────────────────

export const listUpcoming = query({
  args: { daysAhead: v.number() },
  handler: async (ctx, args) => {
    const today = new Date()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day   = String(today.getDate()).padStart(2, '0')
    const todayNum = parseInt(month + day)

    const allActive = await ctx.db
      .query('specialDates')
      .withIndex('by_active', q => q.eq('active', true))
      .take(500)

    return allActive
      .map(d => {
        const mmdd  = d.dateType === 'anniversary' ? d.date : d.date.slice(5)
        const parts = mmdd.split('-')
        if (parts.length < 2) return null
        const num = parseInt(parts[0] + parts[1])
        const diff = num - todayNum
        if (diff < 0 || diff > args.daysAhead) return null
        return { ...d, daysUntil: diff }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => a.daysUntil - b.daysUntil)
  },
})

// ── Bulk import (internal — called from action only) ─────────────────────────

const importBatchItemV = v.object({
  date:          v.string(),
  dateType:      v.union(v.literal('anniversary'), v.literal('one_time')),
  title:         v.string(),
  titleShort:    v.optional(v.string()),
  description:   v.optional(v.string()),
  yearOriginal:  v.optional(v.number()),
  category:      v.optional(v.string()),
  confidence:    v.optional(v.string()),
  contentType:   v.optional(v.string()),
  tags:          v.array(v.string()),
  diversityTags: v.optional(v.array(v.string())),
  relevanceScore: v.number(),
  teaserText:    v.optional(v.string()),
  bannerImageUrl: v.optional(v.string()),
  bannerImageAlt: v.optional(v.string()),
  richDataJson:  v.optional(v.any()),
})

export const importBatch = internalMutation({
  args: { items: v.array(importBatchItemV) },
  handler: async (ctx, args): Promise<{ inserted: number; skipped: number }> => {
    let inserted = 0
    let skipped  = 0

    for (const item of args.items) {
      const existing = await ctx.db
        .query('specialDates')
        .withIndex('by_date', q => q.eq('date', item.date))
        .collect()
      const isDuplicate = existing.some(d => d.title === item.title)

      if (isDuplicate) {
        skipped++
        continue
      }

      await ctx.db.insert('specialDates', {
        ...item,
        aiGenerated: true,
        active: true,
      })
      inserted++
    }

    await ctx.runMutation(internal.auditEvents.log, {
      entityType:  'specialDates',
      eventType:   'import_batch',
      payloadJson: { inserted, skipped },
    })

    return { inserted, skipped }
  },
})
