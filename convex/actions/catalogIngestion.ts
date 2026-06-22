"use node"

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { searchComicVine, getCharacter } from '../../lib/integrations/comicvine'

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

// ── Action: ingest names from Wikipedia + worldofblackheroes → catalog ────────
// Phase 1: saves names + diversity tags (no CV data yet). Fast, can run for all tags.

export const ingestNamesFromSources = action({
  args: {
    diversityTags: v.array(v.string()),  // which tags to ingest
  },
  handler: async (ctx, args) => {
    const tagMap = new Map<string, Set<string>>()  // name → Set<tag>

    const addNames = (names: string[], tag: string) => {
      for (const raw of names) {
        const clean = cleanName(raw)
        if (clean.length < 3 || clean.length > 60) continue
        if (isNoise(clean)) continue
        if (raw.startsWith('List of') || raw.includes(':')) continue
        if (!tagMap.has(clean)) tagMap.set(clean, new Set())
        tagMap.get(clean)!.add(tag)
      }
    }

    for (const tag of args.diversityTags) {
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
    for (const [name, tagSet] of tagMap.entries()) {
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
  },
})

// ── Action: enrich unenriched characters with Comic Vine data ─────────────────
// Phase 2: takes characters without cvEnrichedAt, fetches CV, updates catalog.
// Run after ingestNamesFromSources. Respects rate limits via batching.

export const enrichCharactersFromCV = action({
  args: {
    limit:     v.optional(v.number()),  // max chars to enrich per run (default 30)
    batchSize: v.optional(v.number()),  // CV calls per batch (default 3)
    delayMs:   v.optional(v.number()),  // ms between batches (default 600)
  },
  handler: async (ctx, args) => {
    const limit     = args.limit     ?? 30
    const batchSize = args.batchSize ?? 3
    const delayMs   = args.delayMs   ?? 600

    // Get unenriched characters
    const unenriched: Array<{ _id: string; name: string; diversityTags: string[] }> =
      await ctx.runQuery(internal.catalog.getUnenrichedCharacters, { limit })

    console.log(`[catalog:enrich] ${unenriched.length} characters to enrich from CV`)

    let enriched = 0, notFound = 0

    for (let i = 0; i < unenriched.length; i += batchSize) {
      const batch = unenriched.slice(i, i + batchSize)
      await Promise.all(batch.map(async char => {
        try {
          // Search CV for this character
          const hits = await searchComicVine(char.name, ['character'], 5)
          const nl   = char.name.toLowerCase()
          const best = hits.find(h => h.name?.toLowerCase() === nl)
            ?? hits.find(h => (h.name?.toLowerCase() ?? '').startsWith(nl))
          if (!best) {
            // Not found — mark as enriched (with null cvId) so we don't retry forever
            await ctx.runMutation(internal.catalog.upsertCharacter, {
              name:          char.name,
              diversityTags: char.diversityTags,
              sources:       [],
              cvEnrichedAt:  Date.now(),
            })
            notFound++
            return
          }

          // Get full character detail
          const detail = await getCharacter(best.id)
          const fa     = detail.first_appeared_in_issue
          const firstAppearance = fa?.volume
            ? `${fa.volume.name} #${fa.issue_number ?? ''}`
            : (fa?.name ?? undefined)

          await ctx.runMutation(internal.catalog.upsertCharacter, {
            name:            char.name,
            aliases:         best.name !== char.name ? [best.name] : [],
            diversityTags:   char.diversityTags,
            cvId:            best.id,
            cvUrl:           best.site_detail_url,
            deck:            detail.deck,
            realName:        detail.real_name,
            publisher:       detail.publisher?.name,
            powers:          detail.powers?.slice(0, 8).map(p => p.name),
            firstAppearance,
            coverUrl:        detail.image?.medium_url,
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
  },
})

// ── Action: full pipeline (ingest + enrich) ───────────────────────────────────
// Convenience wrapper: run both phases for the given tags.

export const runFullIngestion = action({
  args: {
    diversityTags: v.array(v.string()),
    enrichLimit:   v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log(`[catalog:full] starting ingestion for tags: ${args.diversityTags.join(', ')}`)

    const ingestResult = await ctx.runAction(internal.actions.catalogIngestion.ingestNamesFromSources, {
      diversityTags: args.diversityTags,
    })
    console.log(`[catalog:full] ingestion done: ${ingestResult.total} unique names`)

    const enrichResult = await ctx.runAction(internal.actions.catalogIngestion.enrichCharactersFromCV, {
      limit: args.enrichLimit ?? 30,
    })
    console.log(`[catalog:full] enrichment done: ${enrichResult.enriched} enriched, ${enrichResult.notFound} not found`)

    return { ingest: ingestResult, enrich: enrichResult }
  },
})
