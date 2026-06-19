import { query, mutation, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'

// ── Public queries ────────────────────────────────────────────────────────────

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('comicsResearch').order('desc').take(20)
  },
})

export const getSession = query({
  args: { id: v.id('comicsResearch') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const getSessionItems = query({
  args: { sessionId: v.id('comicsResearch') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('comicsResearchItems')
      .withIndex('by_session', q => q.eq('sessionId', args.sessionId))
      .collect()
  },
})

export const listSavedItems = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('comicsResearchItems')
      .withIndex('by_saved', q => q.eq('saved', true))
      .take(100)
  },
})

// ── Public mutations ──────────────────────────────────────────────────────────

export const toggleSaved = mutation({
  args: { id: v.id('comicsResearchItems') },
  handler: async (ctx, args): Promise<void> => {
    const item = await ctx.db.get(args.id)
    if (!item) return
    await ctx.db.patch(args.id, { saved: !item.saved })
  },
})

export const deleteSession = mutation({
  args: { id: v.id('comicsResearch') },
  handler: async (ctx, args): Promise<void> => {
    const items = await ctx.db
      .query('comicsResearchItems')
      .withIndex('by_session', q => q.eq('sessionId', args.id))
      .collect()

    for (const item of items) {
      await ctx.db.delete(item._id)
    }

    await ctx.db.delete(args.id)

    await ctx.runMutation(internal.auditEvents.log, {
      entityType:  'comicsResearch',
      entityId:    args.id,
      eventType:   'research.session.deleted',
      payloadJson: { itemCount: items.length },
    })
  },
})

// ── Internal mutations ────────────────────────────────────────────────────────

export const createSession = internalMutation({
  args: {
    sessionName: v.string(),
    dateFrom:    v.string(),
    dateTo:      v.string(),
    dateMode:    v.string(),
    maxResults:  v.number(),
    paramsJson:  v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<Id<'comicsResearch'>> => {
    return await ctx.db.insert('comicsResearch', {
      ...args,
      resultCount: 0,
      status: 'running',
    })
  },
})

export const finalizeSession = internalMutation({
  args: {
    id:           v.id('comicsResearch'),
    resultCount:  v.number(),
    rawJson:      v.optional(v.any()),
    status:       v.union(v.literal('done'), v.literal('error')),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { id, ...patch } = args
    await ctx.db.patch(id, patch)

    await ctx.runMutation(internal.auditEvents.log, {
      entityType:  'comicsResearch',
      entityId:    id,
      eventType:   args.status === 'done' ? 'research.session.completed' : 'research.session.failed',
      payloadJson: { resultCount: args.resultCount },
    })
  },
})

export const insertItems = internalMutation({
  args: {
    sessionId: v.id('comicsResearch'),
    items: v.array(v.object({
      title:              v.string(),
      issue:              v.string(),
      publisher:          v.string(),
      releaseDate:        v.string(),
      confidence:         v.string(),
      promotedToContentId: v.optional(v.id('contentItems')),
      itemJson:           v.any(),
    })),
  },
  handler: async (ctx, args): Promise<void> => {
    for (const item of args.items) {
      await ctx.db.insert('comicsResearchItems', {
        ...item,
        sessionId: args.sessionId,
        saved: false,
      })
    }
  },
})
