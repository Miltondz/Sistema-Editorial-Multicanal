"use node";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { action, internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { publishPost } from '../../lib/integrations/tumblr'
import { publishTweet } from '../../lib/integrations/x'
import { buildTumblrPayload, buildXPayload } from '../../lib/preview/payloads'

// ── Local type hints (resolved after `npx convex dev`) ────────────────────

interface ItemDoc {
  status: string
  contentType: string
  representationTags: string[]
  themeTags: string[]
  buyLink?: string
  coverImageUrl?: string
}
interface VariantDoc {
  _id: any
  status: string
  bodyText?: string
  headline?: string
  ctaText?: string
  channel: string
}
interface MediaDoc { publicUrl: string }

const channelV = v.union(v.literal('tumblr'), v.literal('x'))

const MAX_RETRIES = 3
const RETRY_BACKOFF_MS = [5_000, 15_000, 30_000] as const

// ── Core publish helper — API call only, no DB writes ─────────────────────

interface CorePublishResult {
  success:        boolean
  externalPostId?: string
  externalPostUrl?: string
  errorMessage?:  string
  payloadJson?:   Record<string, unknown>
  responseJson?:  Record<string, unknown>
  retryable:      boolean
}

async function corePublish(
  variant: VariantDoc,
  item: ItemDoc,
  mediaAssets: MediaDoc[],
  channel: 'tumblr' | 'x'
): Promise<CorePublishResult> {
  let externalPostId: string | undefined
  let externalPostUrl: string | undefined
  let errorMessage: string | undefined
  let success = false
  let payloadJson: Record<string, unknown> | undefined
  let responseJson: Record<string, unknown> | undefined
  let retryable = true

  try {
    if (channel === 'tumblr') {
      const payload = buildTumblrPayload(variant, item, mediaAssets)
      payloadJson = payload as unknown as Record<string, unknown>
      const result = await publishPost(payload)
      externalPostId = result.id
      externalPostUrl = result.url
      responseJson = result as unknown as Record<string, unknown>
      success = true
    } else {
      const payload = buildXPayload(variant, item, mediaAssets)
      payloadJson = payload as Record<string, unknown>
      const result = await publishTweet(payload)
      externalPostId = result.id
      externalPostUrl = result.url
      responseJson = result as unknown as Record<string, unknown>
      success = true
    }
  } catch (error) {
    if (error instanceof Error) {
      errorMessage = error.message
      // tumblr.js/got wraps HTTP errors — capture body for debugging
      const anyErr = error as any
      if (anyErr.response?.body) {
        try { errorMessage += ' | body: ' + JSON.stringify(anyErr.response.body) } catch {}
      }
      if (anyErr.body) {
        try { errorMessage += ' | body: ' + JSON.stringify(anyErr.body) } catch {}
      }
    } else {
      errorMessage = String(error)
    }
    const msg = errorMessage.toLowerCase()
    if (
      msg.includes('401') || msg.includes('403') ||
      msg.includes('453') || msg.includes('monthly cap') ||
      msg.includes('monthly write limit') ||
      msg.includes('unauthorized') || msg.includes('forbidden')
    ) {
      retryable = false
    }
  }

  return { success, externalPostId, externalPostUrl, errorMessage, payloadJson, responseJson, retryable }
}

// ── publishDirect — public action (manual publish from editor) ─────────────

export const publishDirect = action({
  args: {
    contentItemId: v.id('contentItems'),
    channel: channelV,
    variantId: v.optional(v.id('contentVariants')),
    slotId: v.optional(v.id('scheduleSlots')),
  },
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(internal.contentItems.getByIdInternal, {
      id: args.contentItemId,
    }) as ItemDoc | null
    if (!item) return { success: false, error: 'Item not found' }

    if (item.status !== 'approved' && item.status !== 'published') {
      return { success: false, error: `El ítem debe estar aprobado. Estado actual: ${item.status}` }
    }

    const variant = await ctx.runQuery(internal.contentVariants.getActiveForChannel, {
      contentItemId: args.contentItemId,
      channel: args.channel,
    }) as VariantDoc | null
    if (!variant) return { success: false, error: `No hay variante activa para: ${args.channel}` }
    if (variant.status !== 'approved') return { success: false, error: `Variante no aprobada: ${variant.status}` }
    if (!variant.bodyText?.trim()) return { success: false, error: 'El cuerpo de la variante está vacío' }

    const mediaAssets = await ctx.runQuery(internal.mediaAssets.listByItemInternal, {
      contentItemId: args.contentItemId,
    }) as MediaDoc[]

    if (args.channel === 'x') {
      const count = await ctx.runQuery(internal.publicationLog.countXPostsThisMonth, {}) as number
      if (count >= 500) {
        const errMsg = 'Límite mensual de X API alcanzado (500 posts/mes)'
        await ctx.runMutation(internal.publicationLog.create, {
          contentItemId: args.contentItemId, variantId: variant._id,
          channel: args.channel, publishStatus: 'failed', errorMessage: errMsg, retryCount: 0,
        })
        return { success: false, error: errMsg }
      }
      if (count >= 400) {
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'system', entityId: undefined,
          eventType: 'x.rate_limit_warning', payloadJson: { currentCount: count, limit: 500 },
        })
      }
    }

    const result = await corePublish(variant, item, mediaAssets, args.channel)

    const logId: any = await ctx.runMutation(internal.publicationLog.create, {
      contentItemId: args.contentItemId, variantId: variant._id,
      channel: args.channel, publishStatus: result.success ? 'success' : 'failed',
      payloadJson: result.payloadJson, responseJson: result.responseJson,
      externalPostId: result.externalPostId, externalPostUrl: result.externalPostUrl,
      errorMessage: result.errorMessage, retryCount: 0,
    })

    if (result.success) {
      await ctx.runMutation(internal.channelScores.updateAfterPublish, {
        contentItemId: args.contentItemId, channel: args.channel,
      })
      await ctx.runMutation(internal.contentVariants.updateStatusInternal, {
        id: variant._id, status: 'published', publishedLastAt: Date.now(),
      })
      if (args.slotId) {
        await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, {
          id: args.slotId, status: 'published',
        })
      }
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'contentItem', entityId: args.contentItemId,
        eventType: 'item.published_direct',
        payloadJson: { channel: args.channel, externalPostUrl: result.externalPostUrl, logId, slotId: args.slotId },
      })
    }

    return {
      success: result.success,
      externalPostId: result.externalPostId,
      externalPostUrl: result.externalPostUrl,
      publicationLogId: logId,
      error: result.errorMessage,
    }
  },
})

// ── retryFailedSlot — public action called from planner UI ─────────────────

export const retryFailedSlot = action({
  args: { slotId: v.id('scheduleSlots') },
  handler: async (ctx, args): Promise<{ queued: boolean; error?: string }> => {
    const slot = await ctx.runQuery(internal.scheduleSlots.getByIdInternal, { id: args.slotId }) as any | null
    if (!slot) return { queued: false, error: 'Slot no encontrado' }
    if (slot.status !== 'failed') return { queued: false, error: `Slot no está en estado fallido (estado actual: ${slot.status})` }

    await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, {
      id: args.slotId, status: 'ready',
    })
    await ctx.scheduler.runAfter(0, internal.actions.publisher.publishSlot, {
      slotId: args.slotId, retryCount: 0,
    })
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot', entityId: args.slotId,
      eventType: 'slot.retry_queued',
      payloadJson: { slotId: args.slotId },
    })
    return { queued: true }
  },
})

// ── publishSlot — internalAction called by cron + retry scheduler ──────────

export const publishSlot = internalAction({
  args: {
    slotId:     v.id('scheduleSlots'),
    retryCount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const currentRetry = args.retryCount ?? 0

    const slot = await ctx.runQuery(internal.scheduleSlots.getByIdInternal, {
      id: args.slotId,
    }) as any | null
    if (!slot || !slot.contentItemId) return
    if (slot.status !== 'planned' && slot.status !== 'ready' && slot.status !== 'publishing') return

    // Mark as publishing to prevent double-publish
    await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, {
      id: args.slotId, status: 'publishing',
    })

    const item = await ctx.runQuery(internal.contentItems.getByIdInternal, {
      id: slot.contentItemId,
    }) as ItemDoc | null

    const variant = await ctx.runQuery(internal.contentVariants.getActiveForChannel, {
      contentItemId: slot.contentItemId, channel: slot.channel,
    }) as VariantDoc | null

    if (!item || !variant || variant.status !== 'approved' || !variant.bodyText?.trim()) {
      await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, { id: args.slotId, status: 'failed' })
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'scheduleSlot', entityId: args.slotId,
        eventType: 'slot.failed',
        payloadJson: { error: 'No approved variant or item missing', retryCount: currentRetry },
      })
      return
    }

    const mediaAssets = await ctx.runQuery(internal.mediaAssets.listByItemInternal, {
      contentItemId: slot.contentItemId,
    }) as MediaDoc[]

    // X monthly rate limit check
    if (slot.channel === 'x') {
      const count = await ctx.runQuery(internal.publicationLog.countXPostsThisMonth, {}) as number
      if (count >= 500) {
        await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, { id: args.slotId, status: 'failed' })
        await ctx.runMutation(internal.publicationLog.create, {
          slotId: args.slotId, contentItemId: slot.contentItemId, variantId: variant._id,
          channel: slot.channel, publishStatus: 'failed',
          errorMessage: 'X API monthly write limit reached (500 posts/mes)',
          retryCount: currentRetry,
        })
        return
      }
      if (count >= 400) {
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'system', entityId: undefined,
          eventType: 'x.rate_limit_warning', payloadJson: { currentCount: count, limit: 500 },
        })
      }
    }

    const result = await corePublish(variant, item, mediaAssets, slot.channel)

    // Always log the attempt
    await ctx.runMutation(internal.publicationLog.create, {
      slotId: args.slotId,
      contentItemId: slot.contentItemId,
      variantId: variant._id,
      channel: slot.channel,
      publishStatus: result.success ? 'success' : (
        result.retryable && currentRetry < MAX_RETRIES - 1 ? 'retrying' : 'failed'
      ),
      payloadJson:    result.payloadJson,
      responseJson:   result.responseJson,
      externalPostId:  result.externalPostId,
      externalPostUrl: result.externalPostUrl,
      errorMessage:   result.errorMessage,
      retryCount:     currentRetry,
    })

    if (result.success) {
      await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, { id: args.slotId, status: 'published' })
      await ctx.runMutation(internal.channelScores.updateAfterPublish, {
        contentItemId: slot.contentItemId, channel: slot.channel,
      })
      await ctx.runMutation(internal.contentVariants.updateStatusInternal, {
        id: variant._id, status: 'published', publishedLastAt: Date.now(),
      })
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'scheduleSlot', entityId: args.slotId,
        eventType: 'slot.published',
        payloadJson: { channel: slot.channel, externalPostUrl: result.externalPostUrl },
      })
    } else if (result.retryable && currentRetry < MAX_RETRIES - 1) {
      const delay = RETRY_BACKOFF_MS[currentRetry] ?? 30_000
      await ctx.scheduler.runAfter(delay, internal.actions.publisher.publishSlot, {
        slotId: args.slotId, retryCount: currentRetry + 1,
      })
      // Reset to ready so next pick-up is clean
      await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, { id: args.slotId, status: 'ready' })
    } else {
      await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, { id: args.slotId, status: 'failed' })
      await ctx.runMutation(internal.auditEvents.log, {
        entityType: 'scheduleSlot', entityId: args.slotId,
        eventType: 'slot.failed',
        payloadJson: { error: result.errorMessage, retryCount: currentRetry, retryable: result.retryable },
      })
    }
  },
})
