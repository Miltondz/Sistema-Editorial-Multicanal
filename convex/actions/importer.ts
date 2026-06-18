"use node";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { fetchAllPosts, normalizeTumblrPost } from '../../lib/integrations/tumblr'
import { parseTweetExport, normalizeTweetToContentItem } from '../../lib/integrations/x'

// ── startTumblrImport ─────────────────────────────────────────────────────────

export const startTumblrImport = action({
  args: {},
  handler: async (ctx): Promise<{
    jobId: string
    imported: number
    skipped: number
    failed: number
  }> => {
    const blogName = process.env.TUMBLR_BLOG_NAME
    if (!blogName) throw new Error('TUMBLR_BLOG_NAME env var not set')

    const jobId: string = await ctx.runMutation(internal.importJobs.createInternal, {
      source: 'tumblr',
    })

    let imported = 0
    let skipped  = 0
    let failed   = 0
    let total    = 0

    try {
      await fetchAllPosts(blogName, async (posts) => {
        total += posts.length

        const normalized = posts.map(normalizeTumblrPost).map(n => ({
          title:          n.title,
          summary:        n.summary,
          buyLink:        n.buyLink,
          sourcePlatform: 'tumblr' as const,
          sourcePostId:   n.sourcePostId,
          sourcePostUrl:  n.sourcePostUrl,
          sourceDate:     n.sourceDate,
        }))

        const result: { imported: number; skipped: number; errors: any[] } =
          await ctx.runMutation(internal.contentItems.importBatchInternal, {
            items: normalized,
          })

        imported += result.imported
        skipped  += result.skipped
        failed   += result.errors.length

        await ctx.runMutation(internal.importJobs.updateProgress, {
          id:            jobId as any,
          itemsTotal:    total,
          itemsImported: imported,
          itemsFailed:   failed,
          errors:        result.errors.length > 0 ? result.errors : undefined,
        })
      })

      const finalStatus = failed > 0 ? 'partial' : 'completed'
      await ctx.runMutation(internal.importJobs.completeInternal, {
        id:     jobId as any,
        status: finalStatus,
      })

      return { jobId, imported, skipped, failed }
    } catch (err) {
      await ctx.runMutation(internal.importJobs.completeInternal, {
        id:     jobId as any,
        status: 'failed',
      })
      throw err
    }
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
    // Read file from Convex Storage
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

    // Process in batches of 50 to balance progress updates vs mutation calls
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
        await ctx.runMutation(internal.contentItems.importBatchInternal, {
          items: normalized,
        })

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
