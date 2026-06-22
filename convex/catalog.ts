import { query, mutation, internalQuery, internalMutation } from './_generated/server'
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
    mantleId:        v.optional(v.string()),
    versionType:     v.optional(v.string()),
    universe:        v.optional(v.string()),
    legacyIndex:     v.optional(v.number()),
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
      const mergedTags    = Array.from(new Set(existing.diversityTags.concat(args.diversityTags)))
      const mergedSources = Array.from(new Set(existing.sources.concat(args.sources)))
      const mergedAliases = Array.from(new Set((existing.aliases ?? []).concat(args.aliases ?? [])))
      await ctx.db.patch(existing._id, {
        updatedAt:    ts,
        diversityTags: mergedTags,
        sources:       mergedSources,
        aliases:       mergedAliases,
        ...(args.cvId         != null ? { cvId:            args.cvId }            : {}),
        ...(args.cvUrl               ? { cvUrl:            args.cvUrl }            : {}),
        ...(args.deck                ? { deck:             args.deck }             : {}),
        ...(args.realName            ? { realName:         args.realName }         : {}),
        ...(args.publisher           ? { publisher:        args.publisher }        : {}),
        ...(args.powers?.length      ? { powers:           args.powers }           : {}),
        ...(args.firstAppearance     ? { firstAppearance:  args.firstAppearance }  : {}),
        ...(args.coverUrl            ? { coverUrl:         args.coverUrl }         : {}),
        ...(args.wikiUrl             ? { wikiUrl:          args.wikiUrl }          : {}),
        ...(args.mantleId            ? { mantleId:         args.mantleId }         : {}),
        ...(args.versionType         ? { versionType:      args.versionType }      : {}),
        ...(args.universe            ? { universe:         args.universe }         : {}),
        ...(args.legacyIndex != null ? { legacyIndex:      args.legacyIndex }      : {}),
        ...(args.cvEnrichedAt != null? { cvEnrichedAt:     args.cvEnrichedAt }     : {}),
      })
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
      mantleId:        args.mantleId,
      versionType:     args.versionType,
      universe:        args.universe,
      legacyIndex:     args.legacyIndex,
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
      const mergedTags    = Array.from(new Set(existing.diversityTags.concat(args.diversityTags)))
      const mergedSources = Array.from(new Set(existing.sources.concat(args.sources)))
      const mergedAliases = Array.from(new Set((existing.aliases ?? []).concat(args.aliases ?? [])))
      const mergedRoles   = Array.from(new Set(existing.roles.concat(args.roles)))
      await ctx.db.patch(existing._id, {
        updatedAt:    ts,
        diversityTags: mergedTags,
        sources:       mergedSources,
        aliases:       mergedAliases,
        roles:         mergedRoles,
        ...(args.cvId              != null ? { cvId:             args.cvId }             : {}),
        ...(args.cvUrl                     ? { cvUrl:            args.cvUrl }            : {}),
        ...(args.deck                      ? { deck:             args.deck }             : {}),
        ...(args.nationality               ? { nationality:      args.nationality }      : {}),
        ...(args.birthYear         != null ? { birthYear:        args.birthYear }        : {}),
        ...(args.coverUrl                  ? { coverUrl:         args.coverUrl }         : {}),
        ...(args.wikiUrl                   ? { wikiUrl:          args.wikiUrl }          : {}),
        ...(args.cvEnrichedAt      != null ? { cvEnrichedAt:     args.cvEnrichedAt }     : {}),
        ...(args.notableWorkCvIds?.length  ? { notableWorkCvIds: args.notableWorkCvIds } : {}),
      })
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
    needsReview:   v.optional(v.boolean()),
    limit:         v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query('catalogCharacters').order('asc').collect()
    if (args.diversityTags?.length) {
      rows = rows.filter(r => args.diversityTags!.some(t => r.diversityTags.includes(t)))
    }
    if (args.needsReview) {
      rows = rows.filter(r => r.needsReview === true)
    }
    if (args.enrichedOnly) {
      rows = rows.filter(r => r.cvEnrichedAt != null)
    }
    const sliced = rows.slice(0, args.limit ?? 500)
    return Promise.all(sliced.map(async r => ({
      ...r,
      storageImageUrl: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
    })))
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
      characters:            chars.length,
      charactersEnriched:    chars.filter(c => c.cvEnrichedAt != null).length,
      charactersNeedsReview: chars.filter(c => c.needsReview === true).length,
      creators:              creators.length,
      creatorsEnriched:      creators.filter(c => c.cvEnrichedAt != null).length,
      creatorsNeedsReview:   creators.filter(c => c.needsReview === true).length,
      tagCounts,
    }
  },
})

// ── Batch helpers (used by ingestion action) ──────────────────────────────────

export const getUnenrichedCreators = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('catalogCreators')
      .withIndex('by_enriched', q => q.eq('cvEnrichedAt', undefined))
      .take(limit ?? 50)
    return rows
  },
})

export const getUnenrichedCharacters = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('catalogCharacters')
      .withIndex('by_enriched', q => q.eq('cvEnrichedAt', undefined))
      .take(limit ?? 50)
    return rows
  },
})

export const getCharactersWithoutWikiUrl = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db.query('catalogCharacters').collect()
    return all.filter(r => !r.wikiUrl).slice(0, limit ?? 200)
  },
})

export const getCreatorsWithoutWikiUrl = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db.query('catalogCreators').collect()
    return all.filter(r => !r.wikiUrl).slice(0, limit ?? 200)
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

// ── Queries de detalle (por _id) ──────────────────────────────────────────────

export const getCharacterById = query({
  args: { id: v.id('catalogCharacters') },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id)
    if (!r) return null
    return { ...r, storageImageUrl: r.storageId ? await ctx.storage.getUrl(r.storageId) : null }
  },
})

export const getCharactersByMantle = query({
  args: { mantleId: v.string() },
  handler: async (ctx, { mantleId }) => {
    const rows = await ctx.db.query('catalogCharacters')
      .withIndex('by_mantle', q => q.eq('mantleId', mantleId))
      .collect()
    return Promise.all(rows.map(async r => ({
      ...r,
      storageImageUrl: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
    })))
  },
})

export const patchCharacterTags = internalMutation({
  args: { name: v.string(), diversityTags: v.array(v.string()) },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query('catalogCharacters')
      .withIndex('by_name', q => q.eq('name', args.name))
      .first()
    if (!existing) return false
    await ctx.db.patch(existing._id, { diversityTags: args.diversityTags, updatedAt: now() })
    return true
  },
})

export const patchCharacterMantle = internalMutation({
  args: {
    name:        v.string(),
    mantleId:    v.string(),
    versionType: v.string(),
    universe:    v.optional(v.string()),
    legacyIndex: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query('catalogCharacters')
      .withIndex('by_name', q => q.eq('name', args.name))
      .first()
    if (!existing) return false
    await ctx.db.patch(existing._id, {
      mantleId:    args.mantleId,
      versionType: args.versionType,
      ...(args.universe        ? { universe:    args.universe }    : {}),
      ...(args.legacyIndex != null ? { legacyIndex: args.legacyIndex } : {}),
      updatedAt: now(),
    })
    return true
  },
})

export const getCreatorById = query({
  args: { id: v.id('catalogCreators') },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id)
    if (!r) return null
    return { ...r, storageImageUrl: r.storageId ? await ctx.storage.getUrl(r.storageId) : null }
  },
})

export const searchCreators = query({
  args: {
    diversityTags: v.optional(v.array(v.string())),
    enrichedOnly:  v.optional(v.boolean()),
    needsReview:   v.optional(v.boolean()),
    limit:         v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query('catalogCreators').order('asc').collect()
    if (args.diversityTags?.length) {
      rows = rows.filter(r => args.diversityTags!.some(t => r.diversityTags.includes(t)))
    }
    if (args.needsReview) {
      rows = rows.filter(r => r.needsReview === true)
    }
    if (args.enrichedOnly) {
      rows = rows.filter(r => r.cvEnrichedAt != null)
    }
    const sliced = rows.slice(0, args.limit ?? 500)
    return Promise.all(sliced.map(async r => ({
      ...r,
      storageImageUrl: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
    })))
  },
})

// ── Storage helpers ───────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
})

export const setCharacterImage = mutation({
  args: { id: v.id('catalogCharacters'), storageId: v.id('_storage') },
  handler: async (ctx, { id, storageId }) =>
    ctx.db.patch(id, { storageId, updatedAt: now() }),
})

export const clearCharacterImage = mutation({
  args: { id: v.id('catalogCharacters') },
  handler: async (ctx, { id }) =>
    ctx.db.patch(id, { storageId: undefined, updatedAt: now() }),
})

export const setCreatorImage = mutation({
  args: { id: v.id('catalogCreators'), storageId: v.id('_storage') },
  handler: async (ctx, { id, storageId }) =>
    ctx.db.patch(id, { storageId, updatedAt: now() }),
})

export const clearCreatorImage = mutation({
  args: { id: v.id('catalogCreators') },
  handler: async (ctx, { id }) =>
    ctx.db.patch(id, { storageId: undefined, updatedAt: now() }),
})

// ── CRUD público — Characters ─────────────────────────────────────────────────

export const createCharacter = mutation({
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
    mantleId:        v.optional(v.string()),
    versionType:     v.optional(v.string()),
    universe:        v.optional(v.string()),
    legacyIndex:     v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('catalogCharacters')
      .withIndex('by_name', q => q.eq('name', args.name))
      .first()
    if (existing) throw new Error(`"${args.name}" ya existe en el catálogo`)
    const ts = now()
    return ctx.db.insert('catalogCharacters', {
      ...args,
      aliases:   args.aliases ?? [],
      sources:   ['manual'],
      createdAt: ts,
      updatedAt: ts,
    })
  },
})

export const editCharacter = mutation({
  args: {
    id:              v.id('catalogCharacters'),
    name:            v.optional(v.string()),
    aliases:         v.optional(v.array(v.string())),
    diversityTags:   v.optional(v.array(v.string())),
    cvId:            v.optional(v.number()),
    cvUrl:           v.optional(v.string()),
    deck:            v.optional(v.string()),
    realName:        v.optional(v.string()),
    publisher:       v.optional(v.string()),
    powers:          v.optional(v.array(v.string())),
    firstAppearance: v.optional(v.string()),
    coverUrl:        v.optional(v.string()),
    wikiUrl:         v.optional(v.string()),
    mantleId:        v.optional(v.string()),
    versionType:     v.optional(v.string()),
    universe:        v.optional(v.string()),
    legacyIndex:     v.optional(v.number()),
  },
  handler: async (ctx, { id, ...fields }) => {
    await ctx.db.patch(id, { ...fields, updatedAt: now() })
  },
})

export const deleteCharacter = mutation({
  args: { id: v.id('catalogCharacters') },
  handler: async (ctx, { id }) => ctx.db.delete(id),
})

// ── CRUD público — Creators ───────────────────────────────────────────────────

export const createCreator = mutation({
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('catalogCreators')
      .withIndex('by_name', q => q.eq('name', args.name))
      .first()
    if (existing) throw new Error(`"${args.name}" ya existe en el catálogo`)
    const ts = now()
    return ctx.db.insert('catalogCreators', {
      ...args,
      aliases:  args.aliases ?? [],
      sources:  ['manual'],
      createdAt: ts,
      updatedAt: ts,
    })
  },
})

export const editCreator = mutation({
  args: {
    id:           v.id('catalogCreators'),
    name:         v.optional(v.string()),
    aliases:      v.optional(v.array(v.string())),
    roles:        v.optional(v.array(v.string())),
    diversityTags:v.optional(v.array(v.string())),
    cvId:         v.optional(v.number()),
    cvUrl:        v.optional(v.string()),
    deck:         v.optional(v.string()),
    nationality:  v.optional(v.string()),
    birthYear:    v.optional(v.number()),
    coverUrl:     v.optional(v.string()),
    wikiUrl:      v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    await ctx.db.patch(id, { ...fields, updatedAt: now() })
  },
})

export const deleteCreator = mutation({
  args: { id: v.id('catalogCreators') },
  handler: async (ctx, { id }) => ctx.db.delete(id),
})

// ── needsReview helpers ───────────────────────────────────────────────────────

export const markCharacterReviewed = mutation({
  args: { id: v.id('catalogCharacters') },
  handler: async (ctx, { id }) => ctx.db.patch(id, { needsReview: false, updatedAt: now() }),
})

export const markCreatorReviewed = mutation({
  args: { id: v.id('catalogCreators') },
  handler: async (ctx, { id }) => ctx.db.patch(id, { needsReview: false, updatedAt: now() }),
})

export const batchMarkNeedsReview = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ marked: number }> => {
    const chars = await ctx.db.query('catalogCharacters').collect()
    let marked = 0
    for (const char of chars) {
      const isManual   = char.sources.includes('manual')
      const hasContext = char.deck || char.realName || char.universe
      const alreadySet = char.needsReview === true
      if (char.diversityTags.length > 0 && !hasContext && !isManual && !alreadySet) {
        await ctx.db.patch(char._id, { needsReview: true, updatedAt: now() })
        marked++
      }
    }
    return { marked }
  },
})
