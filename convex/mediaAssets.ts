import { query, mutation, internalQuery, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const saveMediaAsset = mutation({
  args: {
    contentItemId: v.id('contentItems'),
    storageId: v.id('_storage'),
    mimeType: v.string(),
    altText: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSizeBytes: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    sourceKind: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId)
    if (!url) throw new Error('Storage URL not found')

    // If marking as primary, unset previous primary
    if (args.isPrimary) {
      const existing = await ctx.db
        .query('mediaAssets')
        .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
        .collect()
      for (const asset of existing) {
        if (asset.isPrimary) {
          await ctx.db.patch(asset._id, { isPrimary: false })
        }
      }
    }

    const count = await ctx.db
      .query('mediaAssets')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .collect()

    const willBePrimary = args.isPrimary ?? count.length === 0

    const assetId = await ctx.db.insert('mediaAssets', {
      contentItemId: args.contentItemId,
      storageId: args.storageId,
      publicUrl: url,
      mimeType: args.mimeType,
      altText: args.altText,
      isPrimary: willBePrimary,
      sortOrder: count.length,
      width: args.width,
      height: args.height,
      fileSizeBytes: args.fileSizeBytes,
      sourceUrl: args.sourceUrl,
      sourceKind: args.sourceKind,
    })

    if (willBePrimary) {
      await ctx.db.patch(args.contentItemId, { coverImageUrl: url })
    }

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'mediaAsset',
      entityId: assetId,
      eventType: 'mediaAsset.created',
      payloadJson: { contentItemId: args.contentItemId, mimeType: args.mimeType },
    })
    return assetId
  },
})

export const getByItem = query({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('mediaAssets')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .collect()
  },
})

export const deleteAsset = mutation({
  args: { id: v.id('mediaAssets') },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.id)
    if (!asset) throw new Error('Asset not found')
    await ctx.storage.delete(asset.storageId)
    await ctx.db.delete(args.id)

    if (asset.isPrimary) {
      const remaining = await ctx.db
        .query('mediaAssets')
        .withIndex('by_item', q => q.eq('contentItemId', asset.contentItemId))
        .collect()
      const next = remaining[0]
      if (next) {
        await ctx.db.patch(next._id, { isPrimary: true })
        await ctx.db.patch(asset.contentItemId, { coverImageUrl: next.publicUrl })
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'mediaAsset',
          entityId:   next._id,
          eventType:  'mediaAsset.promotedToPrimary',
          payloadJson: { contentItemId: asset.contentItemId, reason: 'previous_primary_deleted' },
        })
      } else {
        await ctx.db.patch(asset.contentItemId, { coverImageUrl: undefined })
      }
    }

    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'mediaAsset',
      entityId: args.id,
      eventType: 'mediaAsset.deleted',
      payloadJson: { contentItemId: asset.contentItemId, storageId: asset.storageId },
    })
  },
})

export const listByItemInternal = internalQuery({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('mediaAssets')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .collect()
  },
})

export const saveForImportInternal = internalMutation({
  args: {
    contentItemId: v.id('contentItems'),
    storageId:     v.id('_storage'),
    publicUrl:     v.string(),
    mimeType:      v.string(),
    sourceUrl:     v.optional(v.string()),
    width:         v.optional(v.number()),
    height:        v.optional(v.number()),
    fileSizeBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const count = await ctx.db
      .query('mediaAssets')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .collect()
    const isFirst = count.length === 0
    const assetId = await ctx.db.insert('mediaAssets', {
      contentItemId: args.contentItemId,
      storageId:     args.storageId,
      publicUrl:     args.publicUrl,
      mimeType:      args.mimeType,
      sourceUrl:     args.sourceUrl,
      sourceKind:    'tumblr_import',
      isPrimary:     isFirst,
      sortOrder:     count.length,
      width:         args.width,
      height:        args.height,
      fileSizeBytes: args.fileSizeBytes,
    })
    if (isFirst) {
      await ctx.db.patch(args.contentItemId, { coverImageUrl: args.publicUrl })
    }
    return assetId
  },
})

export const setPrimary = mutation({
  args: {
    id: v.id('mediaAssets'),
    contentItemId: v.id('contentItems'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('mediaAssets')
      .withIndex('by_item', q => q.eq('contentItemId', args.contentItemId))
      .collect()
    for (const asset of existing) {
      const shouldBePrimary = asset._id === args.id
      if (asset.isPrimary !== shouldBePrimary) {
        await ctx.db.patch(asset._id, { isPrimary: shouldBePrimary })
      }
    }
    const newPrimary = existing.find(a => a._id === args.id)
    if (newPrimary) {
      await ctx.db.patch(args.contentItemId, { coverImageUrl: newPrimary.publicUrl })
    }
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'mediaAsset',
      entityId: args.id,
      eventType: 'mediaAsset.setPrimary',
      payloadJson: { contentItemId: args.contentItemId },
    })
  },
})

export const updateAltText = mutation({
  args: {
    id: v.id('mediaAssets'),
    altText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { altText: args.altText })
  },
})

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('mediaAssets')
      .order('desc')
      .take(args.limit ?? 200)
  },
})

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('mediaAssets').collect()
    const totalCount = all.length
    const totalSizeBytes = all.reduce((s, a) => s + (a.fileSizeBytes ?? 0), 0)
    const byMimeType: Record<string, number> = {}
    for (const a of all) {
      const key = a.mimeType.split('/')[0] // 'image', 'video', etc.
      byMimeType[key] = (byMimeType[key] ?? 0) + 1
    }
    const primaryCount = all.filter(a => a.isPrimary).length
    return { totalCount, totalSizeBytes, byMimeType, primaryCount }
  },
})
