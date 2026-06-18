"use node";

import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'

// X free tier doesn't expose tweet metrics — attempt gracefully, catch 401/403
async function tryFetchXMetrics(postId: string): Promise<{
  impressions: number; likes: number; reposts: number
} | null> {
  const token = process.env.X_BEARER_TOKEN
  if (!token) return null
  try {
    const resp = await fetch(
      `https://api.twitter.com/2/tweets/${postId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!resp.ok) return null
    const data = await resp.json() as any
    const m = data?.data?.public_metrics
    if (!m) return null
    return {
      impressions: m.impression_count ?? 0,
      likes: m.like_count ?? 0,
      reposts: m.retweet_count ?? 0,
    }
  } catch {
    return null
  }
}

// Tumblr free tier doesn't expose per-post note counts via API — stub
async function tryFetchTumblrMetrics(_postId: string): Promise<{
  reblogs: number; likes: number
} | null> {
  // Tumblr v2 API /posts/{id}/notes requires OAuth; stub returns null until authenticated
  return null
}

export const collectMetrics = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000  // last 7 days

    const logs = await ctx.runQuery(
      internal.publicationLog.listSuccessfulSinceInternal,
      { since }
    ) as Array<{
      _id: any
      channel: 'tumblr' | 'x'
      externalPostId?: string
    }>

    for (const log of logs) {
      if (!log.externalPostId) continue

      let metrics: {
        impressions?: number; likes?: number; reposts?: number
        reblogs?: number; engagements?: number
      } | null = null

      if (log.channel === 'x') {
        const raw = await tryFetchXMetrics(log.externalPostId)
        if (raw) {
          metrics = {
            impressions: raw.impressions,
            likes: raw.likes,
            reposts: raw.reposts,
            engagements: raw.likes + raw.reposts,
          }
        }
      } else if (log.channel === 'tumblr') {
        const raw = await tryFetchTumblrMetrics(log.externalPostId)
        if (raw) {
          metrics = {
            reblogs: raw.reblogs,
            likes: raw.likes,
            engagements: raw.reblogs + raw.likes,
          }
        }
      }

      if (!metrics) continue

      await ctx.runMutation((internal as any).performanceMetrics.upsertInternal, {
        publicationLogId: log._id,
        impressions:    metrics.impressions    ?? 0,
        engagements:    metrics.engagements    ?? 0,
        likes:          metrics.likes          ?? 0,
        reposts:        metrics.reposts        ?? 0,
        reblogs:        metrics.reblogs        ?? 0,
        replies:        0,
        linkClicks:     0,
        profileClicks:  0,
        bookmarks:      0,
        outboundClickRate: 0,
      })
    }
  },
})
