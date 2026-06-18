import { query, mutation, internalQuery, internalMutation } from './_generated/server'
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

    return await ctx.db.insert('mediaAssets', {
      contentItemId: args.contentItemId,
      storageId: args.storageId,
      publicUrl: url,
      mimeType: args.mimeType,
      altText: args.altText,
      isPrimary: args.isPrimary ?? count.length === 0,
      sortOrder: count.length,
      width: args.width,
      height: args.height,
      fileSizeBytes: args.fileSizeBytes,
      sourceUrl: args.sourceUrl,
      sourceKind: args.sourceKind,
    })
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
    return await ctx.db.insert('mediaAssets', {
      contentItemId: args.contentItemId,
      storageId:     args.storageId,
      publicUrl:     args.publicUrl,
      mimeType:      args.mimeType,
      sourceUrl:     args.sourceUrl,
      sourceKind:    'tumblr_import',
      isPrimary:     count.length === 0,
      sortOrder:     count.length,
      width:         args.width,
      height:        args.height,
      fileSizeBytes: args.fileSizeBytes,
    })
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
      await ctx.db.patch(asset._id, { isPrimary: asset._id === args.id })
    }
  },
})
