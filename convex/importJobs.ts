import { query, mutation, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

const importSourceV = v.union(v.literal('tumblr'), v.literal('x_export'))
const importStatusV = v.union(
  v.literal('pending'), v.literal('running'),
  v.literal('completed'), v.literal('failed'), v.literal('partial')
)

const importErrorV = v.object({
  sourceId: v.string(),
  title:    v.string(),
  error:    v.string(),
})

// ── Public queries ────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('importJobs').order('desc').take(30)
  },
})

export const getById = query({
  args: { id: v.id('importJobs') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('importJobs')
      .withIndex('by_status', q => q.eq('status', 'running'))
      .first()
  },
})

// ── Upload URL (reused by import UI for X export file) ───────────────────────

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

// ── Internal mutations ────────────────────────────────────────────────────────

/** Last Tumblr job — public (used by UI to show watermark) */
export const getLastTumblrJob = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('importJobs')
      .withIndex('by_source', q => q.eq('source', 'tumblr'))
      .order('desc')
      .first()
  },
})

/** Internal version — callable from internalAction (startTumblrImport) */
export const getLastTumblrJobInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('importJobs')
      .withIndex('by_source', q => q.eq('source', 'tumblr'))
      .order('desc')
      .first()
  },
})

/** Internal getById — callable from internalAction (processTumblrBatch) */
export const getByIdInternal = internalQuery({
  args: { id: v.id('importJobs') },
  handler: async (ctx, args) => ctx.db.get(args.id),
})

export const createInternal = internalMutation({
  args: {
    source:     importSourceV,
    configJson: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<string> => {
    const jobId = await ctx.db.insert('importJobs', {
      source:        args.source,
      status:        'running',
      itemsTotal:    0,
      itemsImported: 0,
      itemsFailed:   0,
      startedAt:     Date.now(),
      configJson:    args.configJson,
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'importJob',
      entityId:   jobId,
      eventType:  'import.started',
      payloadJson: { source: args.source },
    })

    return jobId
  },
})

/** Save cursor (oldest timestamp seen so far) after each batch */
export const updateCursorInternal = internalMutation({
  args: { id: v.id('importJobs'), cursorTs: v.number() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id)
    if (!job) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (job.configJson as any) ?? {}
    await ctx.db.patch(args.id, { configJson: { ...existing, cursorTs: args.cursorTs } })
  },
})

export const updateProgress = internalMutation({
  args: {
    id:            v.id('importJobs'),
    itemsTotal:    v.optional(v.number()),
    itemsImported: v.optional(v.number()),
    itemsFailed:   v.optional(v.number()),
    errors:        v.optional(v.array(importErrorV)),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id)
    if (!job) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (job.configJson as any) ?? {}
    const existingErrors: Array<{ sourceId: string; title: string; error: string }> =
      (existing.errors as Array<{ sourceId: string; title: string; error: string }>) ?? []

    const patch: Record<string, unknown> = {}
    if (args.itemsTotal    !== undefined) patch.itemsTotal    = args.itemsTotal
    if (args.itemsImported !== undefined) patch.itemsImported = args.itemsImported
    if (args.itemsFailed   !== undefined) patch.itemsFailed   = args.itemsFailed

    if (args.errors && args.errors.length > 0) {
      // Cap at 200 total errors to stay within document size limits
      const newErrors = args.errors as Array<{ sourceId: string; title: string; error: string }>
      const merged = [...existingErrors, ...newErrors].slice(0, 200)
      patch.configJson = { ...existing, errors: merged }
    }

    await ctx.db.patch(args.id, patch)
  },
})

export const completeInternal = internalMutation({
  args: {
    id:     v.id('importJobs'),
    status: importStatusV,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status:      args.status,
      completedAt: Date.now(),
    })

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'importJob',
      entityId: args.id,
      eventType: args.status === 'failed' ? 'import.failed' : 'import.completed',
      payloadJson: { status: args.status },
    })
  },
})

export const deleteIfEmptyInternal = internalMutation({
  args: { id: v.id('importJobs') },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id)
    if (!job || job.itemsImported > 0) return
    await ctx.db.delete(args.id)
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'importJob',
      entityId: args.id,
      eventType: 'import.deleted_empty',
      payloadJson: {},
    })
  },
})

export const deleteJob = mutation({
  args: { id: v.id('importJobs') },
  handler: async (ctx, args): Promise<void> => {
    const remaining = await ctx.db
      .query('contentItems')
      .filter(q => q.eq(q.field('importJobId'), args.id))
      .first()
    if (remaining) throw new Error('El lote aún tiene ítems. Elimínalos primero.')
    await ctx.db.delete(args.id)
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'importJob',
      entityId: args.id,
      eventType: 'import.deleted',
      payloadJson: {},
    })
  },
})
