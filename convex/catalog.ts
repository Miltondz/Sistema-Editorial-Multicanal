import { query, internalMutation } from './_generated/server'
import { v } from 'convex/values'

const now = () => Date.now()

// ── Upsert character ──────────────────────────────────────────────────────────
// Insert if new (by name or cvId), update if existing. Safe to call repeatedly.

export const upsertCharacter = internalMutation({
  args: {
    name:            v.string(),
    aliases:         v.optional(v.array(v.string())),
    diversityTags:   v.array(v.string()),
    cvId:            v.optional(v.number()),
    cvUrl:           v.optional(v.string()),
    deck:            v.optional(v.string()),
    realName:        v.optional(v.string()),
    publisher:       v.optional(v.string()),
    powers:          v.optional(v.array(v.string())),
    firstAppearance: v.optional(v.string()),
    coverUrl:        v.optional(v.string()),
    wikiUrl:         v.optional(v.string()),
    sources:         v.array(v.string()),
    cvEnrichedAt:    v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ts = now()

    // Look up by cvId first (most reliable), then by exact name
    let existing = args.cvId != null
      ? await ctx.db.query('catalogCharacters').withIndex('by_cvId', q => q.eq('cvId', args.cvId)).first()
      : null
    if (!existing) {
      existing = await ctx.db.query('catalogCharacters').withIndex('by_name', q => q.eq('name', args.name)).first()
    }

    if (existing) {
      // Merge: only overwrite fields that are actually provided (don't blank existing data)
      const patch: Record<string, unknown> = { updatedAt: ts }
      if (args.cvId        != null) patch.cvId           = args.cvId
      if (args.cvUrl)               patch.cvUrl          = args.cvUrl
      if (args.deck)                patch.deck           = args.deck
      if (args.realName)            patch.realName       = args.realName
      if (args.publisher)           patch.publisher      = args.publisher
      if (args.powers?.length)      patch.powers         = args.powers
      if (args.firstAppearance)     patch.firstAppearance= args.firstAppearance
      if (args.coverUrl)            patch.coverUrl       = args.coverUrl
      if (args.wikiUrl)             patch.wikiUrl        = args.wikiUrl
      if (args.cvEnrichedAt != null)patch.cvEnrichedAt   = args.cvEnrichedAt
      // Merge diversity tags (union)
      const mergedTags = [...new Set([...existing.diversityTags, ...args.diversityTags])]
      patch.diversityTags = mergedTags
      // Merge sources (union)
      const mergedSources = [...new Set([...existing.sources, ...args.sources])]
      patch.sources = mergedSources
      // Merge aliases
      const mergedAliases = [...new Set([...(existing.aliases ?? []), ...(args.aliases ?? [])])]
      patch.aliases = mergedAliases

      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert('catalogCharacters', {
      name:            args.name,
      aliases:         args.aliases         ?? [],
      diversityTags:   args.diversityTags,
      cvId:            args.cvId,
      cvUrl:           args.cvUrl,
      deck:            args.deck,
      realName:        args.realName,
      publisher:       args.publisher,
      powers:          args.powers,
      firstAppearance: args.firstAppearance,
      coverUrl:        args.coverUrl,
      wikiUrl:         args.wikiUrl,
      sources:         args.sources,
      cvEnrichedAt:    args.cvEnrichedAt,
      createdAt:       ts,
      updatedAt:       ts,
    })
  },
})

// ── Upsert creator ────────────────────────────────────────────────────────────

export const upsertCreator = internalMutation({
  args: {
    name:             v.string(),
    aliases:          v.optional(v.array(v.string())),
    roles:            v.array(v.string()),
    diversityTags:    v.array(v.string()),
    cvId:             v.optional(v.number()),
    cvUrl:            v.optional(v.string()),
    deck:             v.optional(v.string()),
    nationality:      v.optional(v.string()),
    birthYear:        v.optional(v.number()),
    coverUrl:         v.optional(v.string()),
    wikiUrl:          v.optional(v.string()),
    notableWorkCvIds: v.optional(v.array(v.number())),
    sources:          v.array(v.string()),
    cvEnrichedAt:     v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ts = now()
    let existing = args.cvId != null
      ? await ctx.db.query('catalogCreators').withIndex('by_cvId', q => q.eq('cvId', args.cvId)).first()
      : null
    if (!existing) {
      existing = await ctx.db.query('catalogCreators').withIndex('by_name', q => q.eq('name', args.name)).first()
    }

    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: ts }
      if (args.cvId         != null) patch.cvId            = args.cvId
      if (args.cvUrl)                patch.cvUrl           = args.cvUrl
      if (args.deck)                 patch.deck            = args.deck
      if (args.nationality)          patch.nationality     = args.nationality
      if (args.birthYear    != null) patch.birthYear       = args.birthYear
      if (args.coverUrl)             patch.coverUrl        = args.coverUrl
      if (args.wikiUrl)              patch.wikiUrl         = args.wikiUrl
      if (args.cvEnrichedAt != null) patch.cvEnrichedAt    = args.cvEnrichedAt
      if (args.notableWorkCvIds?.length) patch.notableWorkCvIds = args.notableWorkCvIds
      patch.diversityTags = [...new Set([...existing.diversityTags, ...args.diversityTags])]
      patch.sources       = [...new Set([...existing.sources, ...args.sources])]
      patch.aliases       = [...new Set([...(existing.aliases ?? []), ...(args.aliases ?? [])])]
      patch.roles         = [...new Set([...existing.roles, ...args.roles])]
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert('catalogCreators', {
      name:             args.name,
      aliases:          args.aliases          ?? [],
      roles:            args.roles,
      diversityTags:    args.diversityTags,
      cvId:             args.cvId,
      cvUrl:            args.cvUrl,
      deck:             args.deck,
      nationality:      args.nationality,
      birthYear:        args.birthYear,
      coverUrl:         args.coverUrl,
      wikiUrl:          args.wikiUrl,
      notableWorkCvIds: args.notableWorkCvIds,
      sources:          args.sources,
      cvEnrichedAt:     args.cvEnrichedAt,
      createdAt:        ts,
      updatedAt:        ts,
    })
  },
})

// ── Queries ───────────────────────────────────────────────────────────────────

export const searchCharacters = query({
  args: {
    diversityTags: v.optional(v.array(v.string())),
    enrichedOnly:  v.optional(v.boolean()),
    limit:         v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query('catalogCharacters').order('asc').collect()
    if (args.diversityTags?.length) {
      rows = rows.filter(r => args.diversityTags!.some(t => r.diversityTags.includes(t)))
    }
    if (args.enrichedOnly) {
      rows = rows.filter(r => r.cvEnrichedAt != null)
    }
    return rows.slice(0, args.limit ?? 500)
  },
})

export const getCharacterByCvId = query({
  args: { cvId: v.number() },
  handler: async (ctx, { cvId }) =>
    ctx.db.query('catalogCharacters').withIndex('by_cvId', q => q.eq('cvId', cvId)).first(),
})

export const getCatalogStats = query({
  args: {},
  handler: async (ctx) => {
    const chars    = await ctx.db.query('catalogCharacters').collect()
    const creators = await ctx.db.query('catalogCreators').collect()
    const tagCounts: Record<string, number> = {}
    for (const c of chars) {
      for (const t of c.diversityTags) tagCounts[t] = (tagCounts[t] ?? 0) + 1
    }
    return {
      characters:         chars.length,
      charactersEnriched: chars.filter(c => c.cvEnrichedAt != null).length,
      creators:           creators.length,
      creatorsEnriched:   creators.filter(c => c.cvEnrichedAt != null).length,
      tagCounts,
    }
  },
})

// ── Batch helpers (used by ingestion action) ──────────────────────────────────

export const getUnenrichedCharacters = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('catalogCharacters')
      .withIndex('by_enriched', q => q.eq('cvEnrichedAt', undefined))
      .take(limit ?? 50)
    return rows
  },
})

// ── Export (for Supabase migration / own API) ─────────────────────────────────
// Returns clean JSON — drop _id, keep all portable fields.
// In Supabase: INSERT INTO characters SELECT * FROM jsonb_populate_recordset(...)

export const exportCharacters = query({
  args: { diversityTags: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query('catalogCharacters').collect()
    if (args.diversityTags?.length) {
      rows = rows.filter(r => args.diversityTags!.some(t => r.diversityTags.includes(t)))
    }
    return rows.map(({ _id, _creationTime, ...rest }) => rest)
  },
})

export const exportCreators = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('catalogCreators').collect()
    return rows.map(({ _id, _creationTime, ...rest }) => rest)
  },
})
