"use node";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { action, internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { fetchOnePage, fetchBlogInfo, normalizeTumblrPost } from '../../lib/integrations/tumblr'
import { parseTweetExport, normalizeTweetToContentItem } from '../../lib/integrations/x'

// ── processTumblrBatch ────────────────────────────────────────────────────────
// Internal scheduled action — processes one page (≤20 posts), updates cursor,
// schedules next batch. Runs until afterTs reached or no posts remain.

export const processTumblrBatch = internalAction({
  args: {
    jobId:    v.id('importJobs'),
    cursorTs: v.number(),           // "before" timestamp in ms (decreases each batch)
    afterTs:  v.optional(v.number()), // ms — stop when posts are older than this
  },
  handler: async (ctx, args): Promise<void> => {
    const blogName = process.env.TUMBLR_BLOG_NAME
    if (!blogName) {
      await ctx.runMutation(internal.importJobs.completeInternal, { id: args.jobId, status: 'failed' })
      return
    }

    // Check job still active (may have been manually cancelled via new job)
    const job = await ctx.runQuery(internal.importJobs.getByIdInternal, { id: args.jobId }) as any
    if (!job || job.status !== 'running') return

    // Fetch one page before the cursor
    let posts: Awaited<ReturnType<typeof fetchOnePage>>['posts']
    let totalPosts: number
    try {
      const result = await fetchOnePage(blogName, { beforeMs: args.cursorTs })
      posts      = result.posts
      totalPosts = result.totalPosts
    } catch (err) {
      await ctx.runMutation(internal.importJobs.completeInternal, { id: args.jobId, status: 'failed' })
      return
    }

    if (posts.length === 0) {
      await ctx.runMutation(internal.importJobs.completeInternal, { id: args.jobId, status: 'completed' })
      return
    }

    // Filter: only import posts within the date range
    const filtered = args.afterTs
      ? posts.filter(p => p.timestamp * 1000 >= args.afterTs!)
      : posts

    // Did this page reach the afterTs boundary?
    const hitAfterBound = args.afterTs !== undefined &&
      posts.some(p => p.timestamp * 1000 < args.afterTs!)

    if (filtered.length > 0) {
      const normalized = filtered.map(normalizeTumblrPost).map(n => ({
        title:          n.title,
        summary:        n.summary,
        buyLink:        n.buyLink,
        sourcePlatform: 'tumblr' as const,
        sourcePostId:   n.sourcePostId,
        sourcePostUrl:  n.sourcePostUrl,
        sourceDate:     n.sourceDate,
      }))

      const result: { imported: number; skipped: number; errors: any[] } =
        await ctx.runMutation(internal.contentItems.importBatchInternal, { items: normalized })

      await ctx.runMutation(internal.importJobs.updateProgress, {
        id:            args.jobId,
        itemsTotal:    totalPosts,
        itemsImported: (job.itemsImported ?? 0) + result.imported,
        itemsFailed:   (job.itemsFailed  ?? 0) + result.errors.length,
        errors:        result.errors.length > 0 ? result.errors : undefined,
      })
    }

    // New cursor = oldest timestamp in this page − 1ms
    const oldestTs = Math.min(...posts.map(p => p.timestamp * 1000)) - 1
    await ctx.runMutation(internal.importJobs.updateCursorInternal, {
      id: args.jobId, cursorTs: oldestTs,
    })

    if (hitAfterBound || posts.length < 20) {
      await ctx.runMutation(internal.importJobs.completeInternal, { id: args.jobId, status: 'completed' })
      return
    }

    // Schedule next batch — 600ms gap respects Tumblr rate limit (~250 req/hr)
    await ctx.scheduler.runAfter(600, internal.actions.importer.processTumblrBatch, {
      jobId:    args.jobId,
      cursorTs: oldestTs,
      afterTs:  args.afterTs,
    })
  },
})

// ── startTumblrImport ─────────────────────────────────────────────────────────
// Public action — creates job, resolves cursor, schedules first batch.
//
// beforeDate: ISO "YYYY-MM-DD" — only import posts published ON OR BEFORE this date.
//             Defaults to today.  Auto-replaced by last job's cursor when continuing.
// afterDate:  ISO "YYYY-MM-DD" — stop when posts are older than this date. Optional.
// continueFromLast: if true, start from the cursor saved in the last Tumblr job.

export const startTumblrImport = action({
  args: {
    beforeDate:       v.optional(v.string()),
    afterDate:        v.optional(v.string()),
    continueFromLast: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ jobId: string }> => {
    const blogName = process.env.TUMBLR_BLOG_NAME
    if (!blogName) throw new Error('TUMBLR_BLOG_NAME env var not set')

    // Resolve beforeTs
    let beforeTs: number
    if (args.continueFromLast) {
      const lastJob = await ctx.runQuery(internal.importJobs.getLastTumblrJobInternal, {}) as any
      const savedCursor = lastJob?.configJson?.cursorTs as number | undefined
      beforeTs = savedCursor ?? Date.now()
    } else if (args.beforeDate) {
      // End of the specified day (23:59:59 UTC)
      beforeTs = new Date(args.beforeDate + 'T23:59:59Z').getTime()
    } else {
      beforeTs = Date.now()
    }

    const afterTs = args.afterDate
      ? new Date(args.afterDate + 'T00:00:00Z').getTime()
      : undefined

    const jobId: string = await ctx.runMutation(internal.importJobs.createInternal, {
      source:     'tumblr',
      configJson: { beforeTs, afterTs, cursorTs: beforeTs },
    })

    // Schedule first batch immediately
    await ctx.scheduler.runAfter(0, internal.actions.importer.processTumblrBatch, {
      jobId:    jobId as any,
      cursorTs: beforeTs,
      afterTs,
    })

    return { jobId }
  },
})

// ── getTumblrBlogInfo ─────────────────────────────────────────────────────────
// Returns total post count + newest/oldest post dates — 2 API calls.

export const getTumblrBlogInfo = action({
  args: {},
  handler: async (_ctx): Promise<{ totalPosts: number; newestTs?: number; oldestTs?: number }> => {
    const blogName = process.env.TUMBLR_BLOG_NAME
    if (!blogName) throw new Error('TUMBLR_BLOG_NAME env var not set')
    return await fetchBlogInfo(blogName)
  },
})

// ── processXExport ────────────────────────────────────────────────────────────

export const processXExport = action({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args): Promise<{
    jobId: string
    imported: number
    skipped: number
    failed: number
  }> => {
    const url = await ctx.storage.getUrl(args.storageId)
    if (!url) throw new Error('Storage file not found')

    const fileContent = await fetch(url).then(r => r.text())

    let tweets: ReturnType<typeof parseTweetExport>
    try {
      tweets = parseTweetExport(fileContent)
    } catch (err) {
      throw new Error(
        `Error al parsear export de X: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    const jobId: string = await ctx.runMutation(internal.importJobs.createInternal, {
      source: 'x_export',
    })

    await ctx.runMutation(internal.importJobs.updateProgress, {
      id:         jobId as any,
      itemsTotal: tweets.length,
    })

    let imported = 0
    let skipped  = 0
    let failed   = 0

    const BATCH_SIZE = 50

    for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
      const batch = tweets.slice(i, i + BATCH_SIZE)

      const normalized = batch.map(normalizeTweetToContentItem).map(n => ({
        title:          n.title,
        summary:        n.summary,
        buyLink:        n.buyLink,
        sourcePlatform: 'x' as const,
        sourcePostId:   n.sourcePostId,
        sourcePostUrl:  n.sourcePostUrl,
        sourceDate:     n.sourceDate,
      }))

      const result: { imported: number; skipped: number; errors: any[] } =
        await ctx.runMutation(internal.contentItems.importBatchInternal, { items: normalized })

      imported += result.imported
      skipped  += result.skipped
      failed   += result.errors.length

      await ctx.runMutation(internal.importJobs.updateProgress, {
        id:            jobId as any,
        itemsImported: imported,
        itemsFailed:   failed,
        errors:        result.errors.length > 0 ? result.errors : undefined,
      })
    }

    const finalStatus = failed > 0 ? 'partial' : 'completed'
    await ctx.runMutation(internal.importJobs.completeInternal, {
      id:     jobId as any,
      status: finalStatus,
    })

    return { jobId, imported, skipped, failed }
  },
})
