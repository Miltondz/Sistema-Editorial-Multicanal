"use node";

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { searchComics } from '../../lib/comicsResearch'
import type { SearchParams, Confidence } from '../../lib/comicsResearch.types'

export const runSearch = action({
  args: {
    dateMode:           v.union(v.literal('absolute'), v.literal('relative_resolved')),
    dateFrom:           v.string(),
    dateTo:             v.string(),
    maxResults:         v.number(),
    publishers:         v.optional(v.array(v.string())),
    minConfidence:      v.optional(v.string()),
    requireImages:      v.optional(v.boolean()),
    maxImagesPerResult: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ sessionId: string; count: number }> => {
    const sessionName = `${args.dateFrom} → ${args.dateTo}`

    const sessionId = await ctx.runMutation(internal.comicsResearch.createSession, {
      sessionName,
      dateFrom:   args.dateFrom,
      dateTo:     args.dateTo,
      dateMode:   args.dateMode,
      maxResults: args.maxResults,
      paramsJson: args,
    })

    try {
      const params: SearchParams = {
        dateMode:           args.dateMode,
        dateFrom:           args.dateFrom,
        dateTo:             args.dateTo,
        maxResults:         args.maxResults,
        publishers:         args.publishers,
        minConfidence:      args.minConfidence as Confidence | undefined,
        requireImages:      args.requireImages,
        maxImagesPerResult: args.maxImagesPerResult,
      }

      const response = await searchComics(params)

      const items = response.results.map(r => ({
        title:       r.title,
        issue:       r.issue,
        publisher:   r.publisher,
        releaseDate: r.release_date,
        confidence:  r.confidence,
        itemJson:    r,
      }))

      if (items.length > 0) {
        await ctx.runMutation(internal.comicsResearch.insertItems, {
          sessionId,
          items,
        })
      }

      await ctx.runMutation(internal.comicsResearch.finalizeSession, {
        id:          sessionId,
        resultCount: items.length,
        rawJson:     response,
        status:      'done',
      })

      return { sessionId, count: items.length }
    } catch (err) {
      await ctx.runMutation(internal.comicsResearch.finalizeSession, {
        id:           sessionId,
        resultCount:  0,
        status:       'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },
})
