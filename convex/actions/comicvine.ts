"use node";

import { action } from '../_generated/server'
import { v } from 'convex/values'
import {
  searchComicVine,
  getCharacter,
  getVolume,
  getPerson,
  getIssue,
  getRecentIssues,
  getPublisherVolumes,
  findCharacter,
  enrichFromComicVine,
  type CVResource,
} from '../../lib/integrations/comicvine'

const resourceV = v.union(
  v.literal('character'),
  v.literal('volume'),
  v.literal('issue'),
  v.literal('publisher'),
  v.literal('person'),
  v.literal('team'),
  v.literal('story_arc'),
)

// ── Basic search / fetch (low-level) ─────────────────────────────────────

export const search = action({
  args: {
    query:     v.string(),
    resources: v.optional(v.array(resourceV)),
    limit:     v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    return searchComicVine(
      args.query,
      (args.resources as CVResource[] | undefined),
      args.limit,
    )
  },
})

export const fetchCharacter = action({
  args: { id: v.number() },
  handler: async (_ctx, args) => getCharacter(args.id),
})

export const fetchVolume = action({
  args: { id: v.number() },
  handler: async (_ctx, args) => getVolume(args.id),
})

export const fetchPerson = action({
  args: { id: v.number() },
  handler: async (_ctx, args) => getPerson(args.id),
})

export const fetchIssue = action({
  args: { id: v.number() },
  handler: async (_ctx, args) => getIssue(args.id),
})

// ── High-level enrichment ─────────────────────────────────────────────────

// Main lookup: given a CMS content item's title + hints, finds the best CV match
// and returns enriched metadata (creators, cover, CV IDs).
// Used by researchContent (after AI step) and ContentEditor "Enrich from CV" button.
export const enrichItem = action({
  args: {
    title:       v.string(),
    publisher:   v.optional(v.string()),
    contentType: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    return enrichFromComicVine(args.title, args.publisher, args.contentType)
  },
})

// Character context for specialDates.generateIdeas
export const getCharacterContext = action({
  args: { name: v.string() },
  handler: async (_ctx, args) => findCharacter(args.name),
})

// ── Discovery actions ─────────────────────────────────────────────────────

// Issues by cover_date range — complement to AI comicsResearch
// Note: CV API does not support publisher filtering on /issues/ — returns all publishers including manga
export const discoverRecentIssues = action({
  args: {
    dateFrom: v.string(),
    dateTo:   v.string(),
    limit:    v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    return getRecentIssues(args.dateFrom, args.dateTo, args.limit)
  },
})

// Browse a publisher's catalog via search (CV list endpoint doesn't support publisher filter)
export const getPublisherCatalog = action({
  args: {
    publisherName: v.string(),
    limit:         v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const volumes = await getPublisherVolumes(args.publisherName, args.limit)
    return { publisher: { name: args.publisherName }, volumes }
  },
})
