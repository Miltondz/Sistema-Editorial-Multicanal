"use node"

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import type { GenericActionCtx } from 'convex/server'
import type { DataModel } from '../_generated/dataModel'
import { searchComicVine, getCharacter, getPerson } from '../../lib/integrations/comicvine'

// ── Source scrapers (reuse logic from comicsResearch) ─────────────────────────

async function fetchWorldOfBlackHeroes(): Promise<string[]> {
  const res = await fetch('https://worldofblackheroes.com/black-superheroes/', {
    headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)', Accept: 'text/html' },
  })
  if (!res.ok) return []
  const html = await res.text()
  const re = /class='wp-caption-text gallery-caption'[^>]*>\s*([^<\n]+?)\s*<\/figcaption>/gi
  const seen = new Set<string>()
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let name = decodeHtmlEntities(m[1].trim())
    name = name.replace(/\/.*$/, '').replace(/[-\s]+$/, '').trim()
    if (name.length > 2 && name.length < 60 && !seen.has(name)) { seen.add(name); out.push(name) }
  }
  return out
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
}

const WIKI_LIST_PAGES: Record<string, string[]> = {
  black:     ['List_of_black_superheroes'],
  latino:    ['List_of_Latino_superheroes', 'List_of_Hispanic_superheroes'],
  asian:     ['List_of_Asian_superheroes'],
  indigenous:['List_of_Indigenous_North_American_superheroes'],
  arab:      [],
}

const WIKI_CATEGORY_FALLBACK: Record<string, string[]> = {
  arab: ['Category:Arab_superheroes'],
}

async function fetchWikiListPage(page: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page)}&prop=links&pllimit=500&plnamespace=0&format=json`
  const res = await fetch(url, { headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0' } })
  if (!res.ok) return []
  const json = await res.json()
  const pages = json.query?.pages ?? {}
  const links: string[] = []
  for (const p of Object.values(pages) as Array<{ links?: Array<{ title: string }> }>) {
    for (const l of p.links ?? []) links.push(l.title)
  }
  return links
}

async function fetchWikiCategory(cat: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmlimit=500&cmnamespace=0&format=json`
  const res = await fetch(url, { headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0' } })
  if (!res.ok) return []
  const json = await res.json()
  return (json.query?.categorymembers ?? []).map((m: { title: string }) => m.title)
}

const NOISE_PATTERNS = [
  /characters in/i, /superheroes?/i, /superheroines?/i, /comics?$/i,
  /^list of/i, /^category:/i, /^african$/i, /^template:/i,
]
const GENERIC_SURNAMES = /^(Smith|Jones|Brown|Black|White|Green|King|Strong|Powers|Hunter|Steel|Red|Blue)$/i

function cleanName(raw: string): string {
  let s = decodeHtmlEntities(raw.trim())
  s = s.replace(/\s*\([^)]+\)\s*$/, '').trim()  // strip (Marvel Comics) etc.
  s = s.replace(/[/,].*$/, '').trim()             // take before slash/comma
  s = s.replace(/[-\s]+$/, '').trim()             // strip trailing hyphens
  return s
}
function isNoise(name: string): boolean {
  if (NOISE_PATTERNS.some(p => p.test(name))) return true
  if (GENERIC_SURNAMES.test(name)) return true
  return false
}

// ── Shared logic (helpers called by exported actions AND runFullIngestion) ─────
// Per Convex guidelines: don't use ctx.runAction to call same-runtime actions.
// Extract shared logic into plain async functions instead.

type ActionCtx = GenericActionCtx<DataModel>

async function _doIngest(ctx: ActionCtx, diversityTags: string[]): Promise<{ total: number }> {
  const tagMap = new Map<string, Set<string>>()

  const addNames = (names: string[], tag: string) => {
    for (const raw of names) {
      const clean = cleanName(raw)
      if (clean.length < 3 || clean.length > 60) continue
      if (isNoise(clean)) continue
      if (raw.startsWith('List of') || raw.includes(':')) continue
      if (!tagMap.has(clean)) tagMap.set(clean, new Set<string>())
      tagMap.get(clean)!.add(tag)
    }
  }

  for (const tag of diversityTags) {
    if (tag === 'black') {
      const heroes = await fetchWorldOfBlackHeroes()
      console.log(`[catalog:ingest] worldofblackheroes → ${heroes.length} names`)
      addNames(heroes, tag)
    }
    for (const page of WIKI_LIST_PAGES[tag] ?? []) {
      const titles = await fetchWikiListPage(page)
      console.log(`[catalog:ingest] wiki:${page} → ${titles.length} links`)
      addNames(titles, tag)
    }
    for (const cat of WIKI_CATEGORY_FALLBACK[tag] ?? []) {
      const titles = await fetchWikiCategory(cat)
      console.log(`[catalog:ingest] wiki-cat:${cat} → ${titles.length} members`)
      addNames(titles, tag)
    }
  }

  console.log(`[catalog:ingest] ${tagMap.size} unique characters to upsert`)
  let upserted = 0
  for (const entry of Array.from(tagMap.entries())) {
    const [name, tagSet] = entry
    await ctx.runMutation(internal.catalog.upsertCharacter, {
      name,
      aliases:       [],
      diversityTags: Array.from(tagSet),
      sources:       ['wikipedia'],
    })
    upserted++
  }
  console.log(`[catalog:ingest] done: ${upserted} upserted`)
  return { total: tagMap.size }
}

async function _doEnrich(
  ctx: ActionCtx,
  limit: number,
  batchSize: number,
  delayMs: number,
): Promise<{ enriched: number; notFound: number; total: number }> {
  const unenriched: Array<{ _id: string; name: string; diversityTags: string[] }> =
    await ctx.runQuery(internal.catalog.getUnenrichedCharacters, { limit })

  console.log(`[catalog:enrich] ${unenriched.length} characters to enrich from CV`)
  let enriched = 0, notFound = 0

  for (let i = 0; i < unenriched.length; i += batchSize) {
    const batch = unenriched.slice(i, i + batchSize)
    await Promise.all(batch.map(async char => {
      try {
        const hits = await searchComicVine(char.name, ['character'], 5)
        const nl   = char.name.toLowerCase()
        const best = hits.find(h => h.name?.toLowerCase() === nl)
          ?? hits.find(h => (h.name?.toLowerCase() ?? '').startsWith(nl))
        if (!best) {
          await ctx.runMutation(internal.catalog.upsertCharacter, {
            name:          char.name,
            diversityTags: char.diversityTags,
            sources:       [],
            cvEnrichedAt:  Date.now(),
          })
          notFound++
          return
        }
        const detail = await getCharacter(best.id)
        const fa     = detail.first_appeared_in_issue
        const firstAppearance = fa?.volume
          ? `${fa.volume.name} #${fa.issue_number ?? ''}`
          : (fa?.name ?? undefined)
        // CV returns null for unset optional strings — coerce to undefined for Convex validator
        await ctx.runMutation(internal.catalog.upsertCharacter, {
          name:            char.name,
          aliases:         best.name !== char.name ? [best.name] : [],
          diversityTags:   char.diversityTags,
          cvId:            best.id,
          cvUrl:           best.site_detail_url    || undefined,
          deck:            detail.deck             || undefined,
          realName:        detail.real_name        || undefined,
          publisher:       detail.publisher?.name  || undefined,
          powers:          detail.powers?.length   ? detail.powers.slice(0, 8).map(p => p.name) : undefined,
          firstAppearance: firstAppearance         || undefined,
          coverUrl:        detail.image?.medium_url || undefined,
          sources:         ['comicvine'],
          cvEnrichedAt:    Date.now(),
        })
        enriched++
        console.log(`[catalog:enrich] "${char.name}" → CV id=${best.id}`)
      } catch (e) {
        console.log(`[catalog:enrich] error "${char.name}": ${e instanceof Error ? e.message : String(e)}`)
      }
    }))
    if (i + batchSize < unenriched.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  console.log(`[catalog:enrich] done: ${enriched} enriched, ${notFound} not found in CV`)
  return { enriched, notFound, total: unenriched.length }
}

// ── Creator ingestion helpers ─────────────────────────────────────────────────

// Curated seed list of well-known diverse comics creators
// CV will enrich with: deck, nationality, birthYear, coverUrl, notableWorkCvIds
type CreatorSeed = { roles: string[]; tags: string[] }
const CURATED_CREATORS: Record<string, CreatorSeed> = {
  // Black creators
  'Christopher Priest':        { roles: ['writer'],          tags: ['black'] },
  'Dwayne McDuffie':           { roles: ['writer'],          tags: ['black'] },
  'Reginald Hudlin':           { roles: ['writer'],          tags: ['black'] },
  'David F. Walker':           { roles: ['writer'],          tags: ['black'] },
  'Geoffrey Thorne':           { roles: ['writer'],          tags: ['black'] },
  'Vita Ayala':                { roles: ['writer'],          tags: ['black'] },
  'DG Chichester':             { roles: ['writer'],          tags: ['black'] },
  'Eric Wallace':              { roles: ['writer'],          tags: ['black'] },
  'Denys Cowan':               { roles: ['artist'],          tags: ['black'] },
  'John Jennings':             { roles: ['artist'],          tags: ['black'] },
  'Kyle Baker':                { roles: ['writer', 'artist'],tags: ['black'] },
  'Afua Richardson':           { roles: ['artist'],          tags: ['black'] },
  'Sanford Greene':            { roles: ['artist'],          tags: ['black'] },
  'Khary Randolph':            { roles: ['artist'],          tags: ['black'] },
  'Tanya Ford':                { roles: ['writer'],          tags: ['black'] },
  'Eve Ewing':                 { roles: ['writer'],          tags: ['black'] },
  'Pornsak Pichetshote':       { roles: ['writer'],          tags: ['black'] },
  'Brandon Easton':            { roles: ['writer'],          tags: ['black'] },
  'Yomi Ayeni':                { roles: ['writer'],          tags: ['black'] },
  'Anthony Piper':             { roles: ['writer', 'artist'],tags: ['black'] },
  'Ron Wilson':                { roles: ['artist'],          tags: ['black'] },
  'Arvell Jones':              { roles: ['artist'],          tags: ['black'] },
  'Wayne Faucher':             { roles: ['artist'],          tags: ['black'] },
  'Jamal Igle':                { roles: ['artist'],          tags: ['black'] },
  'Ernie Colón':               { roles: ['artist'],          tags: ['black'] },
  'Marc Sumerak':              { roles: ['writer'],          tags: ['black'] },
  // Latino creators
  'George Pérez':              { roles: ['artist'],          tags: ['latino'] },
  'Joe Quesada':               { roles: ['artist', 'writer'],tags: ['latino'] },
  'Jimmy Palmiotti':           { roles: ['writer'],          tags: ['latino'] },
  'Humberto Ramos':            { roles: ['artist'],          tags: ['latino'] },
  'Olivier Coipel':            { roles: ['artist'],          tags: ['latino'] },
  'Carlos Pacheco':            { roles: ['artist'],          tags: ['latino'] },
  'Francis Manapul':           { roles: ['artist', 'writer'],tags: ['latino'] },
  'Fernando Pasarín':          { roles: ['artist'],          tags: ['latino'] },
  'Leinil Francis Yu':         { roles: ['artist'],          tags: ['latino'] },
  'Jesús Merino':              { roles: ['artist'],          tags: ['latino'] },
  'Javier Rodríguez':          { roles: ['artist', 'colorist'], tags: ['latino'] },
  'Rafael Albuquerque':        { roles: ['artist'],          tags: ['latino'] },
  'Eduardo Risso':             { roles: ['artist'],          tags: ['latino'] },
  'Alvaro Martínez Bueno':     { roles: ['artist'],          tags: ['latino'] },
  'G. Willow Wilson':          { roles: ['writer'],          tags: ['arab'] },
  // Asian creators
  'Jim Lee':                   { roles: ['artist'],          tags: ['asian'] },
  'Jeff Yang':                 { roles: ['writer'],          tags: ['asian'] },
  'Gene Luen Yang':            { roles: ['writer', 'artist'],tags: ['asian'] },
  'Derek Kirk Kim':            { roles: ['writer', 'artist'],tags: ['asian'] },
  'Dustin Nguyen':             { roles: ['artist'],          tags: ['asian'] },
  'Bernard Chang':             { roles: ['artist'],          tags: ['asian'] },
  'Phil Jimenez':              { roles: ['artist'],          tags: ['asian'] },
  'Kevin Wada':                { roles: ['artist'],          tags: ['asian'] },
  'Gail Simone':               { roles: ['writer'],          tags: ['asian'] },
  'Takeshi Miyazawa':          { roles: ['artist'],          tags: ['asian'] },
  'Whilce Portacio':           { roles: ['artist'],          tags: ['asian'] },
  'Jeph Loeb':                 { roles: ['writer'],          tags: ['asian'] },
  // Indigenous creators
  'Lee Francis IV':            { roles: ['writer'],          tags: ['indigenous'] },
  'Arigon Starr':              { roles: ['writer', 'artist'],tags: ['indigenous'] },
  'Theo Tso':                  { roles: ['writer', 'artist'],tags: ['indigenous'] },
}

async function _doIngestCreators(ctx: ActionCtx, diversityTags: string[]): Promise<{ total: number }> {
  const tagSet = new Set(diversityTags)
  let upserted = 0

  for (const [name, seed] of Object.entries(CURATED_CREATORS)) {
    const matchedTags = seed.tags.filter(t => tagSet.size === 0 || tagSet.has(t))
    if (matchedTags.length === 0) continue
    await ctx.runMutation(internal.catalog.upsertCreator, {
      name,
      roles:         seed.roles,
      diversityTags: matchedTags,
      sources:       ['curated'],
    })
    upserted++
  }

  console.log(`[catalog:creators:ingest] ${upserted} creators upserted from curated list`)
  return { total: upserted }
}

async function _doEnrichCreators(
  ctx: ActionCtx,
  limit: number,
  batchSize: number,
  delayMs: number,
): Promise<{ enriched: number; notFound: number; total: number }> {
  const unenriched: Array<{ _id: string; name: string; diversityTags: string[]; roles: string[] }> =
    await ctx.runQuery(internal.catalog.getUnenrichedCreators, { limit })

  console.log(`[catalog:creators:enrich] ${unenriched.length} creators to enrich from CV`)
  let enriched = 0, notFound = 0

  for (let i = 0; i < unenriched.length; i += batchSize) {
    const batch = unenriched.slice(i, i + batchSize)
    await Promise.all(batch.map(async creator => {
      try {
        const hits = await searchComicVine(creator.name, ['person'], 5)
        const nl   = creator.name.toLowerCase()
        const best = hits.find(h => h.name?.toLowerCase() === nl)
          ?? hits.find(h => (h.name?.toLowerCase() ?? '').startsWith(nl))
        if (!best) {
          await ctx.runMutation(internal.catalog.upsertCreator, {
            name:          creator.name,
            roles:         creator.roles,
            diversityTags: creator.diversityTags,
            sources:       [],
            cvEnrichedAt:  Date.now(),
          })
          notFound++
          return
        }
        const detail = await getPerson(best.id)
        const birthYear = detail.birth ? new Date(detail.birth).getFullYear() : undefined
        await ctx.runMutation(internal.catalog.upsertCreator, {
          name:          creator.name,
          roles:         creator.roles,
          diversityTags: creator.diversityTags,
          cvId:          best.id,
          cvUrl:         best.site_detail_url            || undefined,
          deck:          detail.deck                     || undefined,
          nationality:   detail.country                  || undefined,
          birthYear:     isNaN(birthYear!) ? undefined : birthYear,
          coverUrl:      detail.image?.medium_url        || undefined,
          sources:       ['comicvine'],
          cvEnrichedAt:  Date.now(),
        })
        enriched++
        console.log(`[catalog:creators:enrich] "${creator.name}" → CV id=${best.id}`)
      } catch (e) {
        console.log(`[catalog:creators:enrich] error "${creator.name}": ${e instanceof Error ? e.message : String(e)}`)
      }
    }))
    if (i + batchSize < unenriched.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  console.log(`[catalog:creators:enrich] done: ${enriched} enriched, ${notFound} not found`)
  return { enriched, notFound, total: unenriched.length }
}

// ── Action: ingest names from Wikipedia + worldofblackheroes → catalog ────────

export const ingestNamesFromSources = action({
  args: { diversityTags: v.array(v.string()) },
  handler: async (ctx, args) => _doIngest(ctx, args.diversityTags),
})

// ── Action: enrich unenriched characters with Comic Vine data ─────────────────

export const enrichCharactersFromCV = action({
  args: {
    limit:     v.optional(v.number()),
    batchSize: v.optional(v.number()),
    delayMs:   v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    _doEnrich(ctx, args.limit ?? 30, args.batchSize ?? 3, args.delayMs ?? 600),
})

// ── Actions: creator pipeline ─────────────────────────────────────────────────

export const ingestCreatorsFromSources = action({
  args: { diversityTags: v.array(v.string()) },
  handler: async (ctx, args) => _doIngestCreators(ctx, args.diversityTags),
})

export const enrichCreatorsFromCV = action({
  args: {
    limit:     v.optional(v.number()),
    batchSize: v.optional(v.number()),
    delayMs:   v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    _doEnrichCreators(ctx, args.limit ?? 30, args.batchSize ?? 3, args.delayMs ?? 600),
})

// ── Action: full pipeline (ingest + enrich) ───────────────────────────────────

export const runFullIngestion = action({
  args: {
    diversityTags: v.array(v.string()),
    enrichLimit:   v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log(`[catalog:full] starting ingestion for tags: ${args.diversityTags.join(', ')}`)
    const ingestResult = await _doIngest(ctx, args.diversityTags)
    console.log(`[catalog:full] ingestion done: ${ingestResult.total} unique names`)
    const enrichResult = await _doEnrich(ctx, args.enrichLimit ?? 30, 3, 600)
    console.log(`[catalog:full] enrichment done: ${enrichResult.enriched} enriched, ${enrichResult.notFound} not found`)
    return { ingest: ingestResult, enrich: enrichResult }
  },
})
