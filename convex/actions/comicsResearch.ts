"use node";

import { action } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { v } from 'convex/values'
import { searchComics } from '../../lib/comicsResearch'
import type { SearchParams, Confidence } from '../../lib/comicsResearch.types'
import { searchComicVine, findCharacter } from '../../lib/integrations/comicvine'

// ── Character-first search: Wikipedia Category API → CV volumes ───────────

// Curated prominent diverse characters — searched FIRST to maximize CV hit rate
// before falling through to the full Wikipedia/worldofblackheroes list
const PROMINENT_DIVERSE: Record<string, string[]> = {
  black: [
    'Black Panther', 'Miles Morales', 'Storm', 'Blade', 'Luke Cage', 'War Machine',
    'Monica Rambeau', 'Falcon', 'Ironheart', 'John Stewart', 'Cyborg', 'Static',
    'Blue Marvel', 'Bishop', 'Batwing', 'Vixen', 'Amanda Waller', 'Malcolm Dragon',
    'Tyroc', 'Night Thrasher', 'Cloak', 'Silhouette', 'Shadowhawk', 'Hardware',
    'Icon', 'Rocket', 'Naomi', 'Black Lightning', 'Thunder', 'Lightning',
  ],
  latino: [
    'America Chavez', 'Jaime Reyes', 'White Tiger', 'Ghost Rider', 'Spider-Girl',
    'Anya Corazon', 'Robbie Reyes', 'El Diablo', 'Tarantula', 'Armadillo',
    'Hector Ayala', 'Silverclaw', 'Rictor', 'Sunspot', 'La Borinqueña',
  ],
  asian: [
    'Shang-Chi', 'Silk', 'Amadeus Cho', 'Psylocke', 'Jubilee', 'Sunfire',
    'Armor', 'Surge', 'Mystique', 'Lady Deathstrike', 'Warbird', 'Cassandra Nova',
    'Ms. Marvel', 'Kamala Khan', 'Cindy Moon',
  ],
  indigenous: [
    'Echo', 'Dani Moonstar', 'Warpath', 'Red Wolf', 'Forge', 'Thunderbird',
    'Mirage', 'Chief', 'Apache Chief', 'Super-Chief',
  ],
  arab: [
    'Simon Baz', 'Sooraya Qadir', 'Faiza Hussain', 'Nightrunner',
    'Monet St. Croix', 'Dust', 'Triage',
  ],
}

// Wikipedia list articles confirmed to exist (tested 2026-06-21)
// arab has no dedicated list page — fall back to category
const WIKI_LIST_PAGES: Record<string, string[]> = {
  black:      ['List_of_black_superheroes'],
  latino:     ['List_of_Latino_superheroes', 'List_of_Hispanic_superheroes'],
  asian:      ['List_of_Asian_superheroes'],
  indigenous: ['List_of_Native_American_superheroes'],
  arab:       [],  // no list page — will use category fallback
}

const WIKI_CATEGORY_FALLBACK: Record<string, string[]> = {
  arab: ['Muslim_superheroes', 'African-American_superheroes'],
}

async function fetchWikiListPage(pageTitle: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=links&pllimit=500&plnamespace=0&format=json`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)' },
  })
  if (!res.ok) return []
  const data = await res.json() as { query?: { pages?: Record<string, { missing?: boolean; links?: Array<{ title: string }> }> } }
  const page = Object.values(data?.query?.pages ?? {})[0]
  if (!page || page.missing !== undefined) return []
  return (page.links ?? []).map(l => l.title)
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘').replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
}

// Scrapes gallery captions from worldofblackheroes.com — curated list of 500+ black heroes
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
    name = name.replace(/\/.*$/, '').trim()    // "Shadowman / michael-leroi" → "Shadowman"
    name = name.replace(/[-\s]+$/, '').trim()  // strip trailing hyphens
    if (name.length > 2 && name.length < 60 && !seen.has(name)) { seen.add(name); out.push(name) }
  }
  return out
}

async function fetchWikiCategory(category: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(category)}&cmlimit=200&cmnamespace=0&format=json`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)' },
  })
  if (!res.ok) return []
  const data = await res.json() as { query?: { categorymembers?: Array<{ title: string }> } }
  return (data?.query?.categorymembers ?? []).map(m => m.title)
}

function cleanCharacterName(title: string): string {
  // "Storm (Marvel Comics)" → "Storm", "Blade (character)" → "Blade"
  return title.replace(/\s*\([^)]*\)/g, '').trim()
}

export const searchByDiverseCharacters = action({
  args: {
    diversityTags: v.array(v.string()),
    dateFrom:      v.optional(v.string()), // YYYY-MM-DD; if omitted, no lower bound
    dateTo:        v.optional(v.string()), // YYYY-MM-DD; if omitted, no upper bound
    maxResults:    v.number(),
  },
  handler: async (ctx, args): Promise<Array<{
    character: string
    tags: string[]
    volumes: Array<{
      id: number; name: string; year?: string; publisher?: string
      coverUrl?: string; siteUrl?: string; issueCount?: number
    }>
  }>> => {
    type DetailCache = Record<string, { deck?: string; realName?: string; powers?: string[]; firstAppearance?: string }>

    // Step 1: collect character names — catalog first, fall back to live scraping
    const catalogChars = await ctx.runQuery(api.catalog.searchCharacters, {
      diversityTags: args.diversityTags,
      enrichedOnly:  true,
      limit:         500,
    })

    const tagMap      = new Map<string, string[]>() // cleanName → tags
    const detailCache: DetailCache = {}             // catalog pre-fetched data (skips CV char search + findCharacter)

    const NOISE_PATTERNS = [
      /characters in/i, /superheroes?/i, /superheroines?/i, /comics?$/i,
      /^list of/i, /^category:/i, /^african$/i, /^template:/i,
    ]
    function isNoiseName(name: string) {
      return NOISE_PATTERNS.some(p => p.test(name))
    }

    function cleanSourceName(raw: string): string {
      let s = decodeHtmlEntities(raw.trim())
      s = cleanCharacterName(s)            // strip disambiguation (Marvel Comics) etc.
      s = s.replace(/[\/,].*$/, '').trim() // take only part before slash or comma
      s = s.replace(/[-\s]+$/, '')         // strip trailing hyphens/spaces
      return s
    }

    function addNames(titles: string[], tag: string) {
      for (const title of titles) {
        if (title.startsWith('List of') || title.includes(':')) continue
        const clean = cleanSourceName(title)
        if (clean.length < 3 || clean.length > 50) continue
        if (isNoiseName(clean)) continue
        if (/^(Smith|Jones|Brown|Black|White|Green|King|Strong|Powers|Hunter|Steel|Red|Blue)$/i.test(clean)) continue
        if (!tagMap.has(clean)) tagMap.set(clean, [])
        if (!tagMap.get(clean)!.includes(tag)) tagMap.get(clean)!.push(tag)
      }
    }

    if (catalogChars.length >= 20) {
      // Catalog path: skip all scraping + CV character search
      console.log(`[charSearch] catalog: ${catalogChars.length} enriched chars — skipping scraping`)
      for (const c of catalogChars) {
        tagMap.set(c.name, c.diversityTags)
        detailCache[c.name] = {
          deck:            c.deck,
          realName:        c.realName,
          powers:          c.powers,
          firstAppearance: c.firstAppearance,
        }
      }
    } else {
      // Scraping path: catalog insufficient — fetch from Wikipedia + worldofblackheroes.com
      console.log(`[charSearch] catalog insufficient (${catalogChars.length}), scraping sources`)

      async function collectCharactersForTag(tag: string) {
        if (tag === 'black') {
          const names = await fetchWorldOfBlackHeroes()
          console.log(`[src:black] worldofblackheroes.com → ${names.length} heroes`)
          addNames(names, tag)
        }
        for (const page of WIKI_LIST_PAGES[tag] ?? []) {
          const titles = await fetchWikiListPage(page)
          console.log(`[wiki:${tag}] List:${page} → ${titles.length} links`)
          addNames(titles, tag)
        }
        for (const cat of WIKI_CATEGORY_FALLBACK[tag] ?? []) {
          const titles = await fetchWikiCategory(cat)
          console.log(`[wiki:${tag}] Category:${cat} → ${titles.length} members`)
          addNames(titles, tag)
        }
      }
      await Promise.all(args.diversityTags.map(collectCharactersForTag))
    }

    console.log(`[charSearch] ${tagMap.size} unique characters from ${catalogChars.length >= 20 ? 'catalog' : 'Wikipedia'}`)

    // Parse year bounds from dateFrom/dateTo
    const yearFrom = args.dateFrom ? parseInt(args.dateFrom.slice(0, 4)) : undefined
    const yearTo   = args.dateTo   ? parseInt(args.dateTo.slice(0, 4))   : undefined

    // Step 2: search CV volumes for every character — shuffle to avoid alphabetical bias,
    // but keep full list; stop early once we have maxResults hits
    type CharResult = {
      character: string; tags: string[]
      deck?: string; realName?: string; firstAppearance?: string; powers?: string[]
      volumes: Array<{ id: number; name: string; year?: string; publisher?: string; coverUrl?: string; siteUrl?: string; issueCount?: number }>
    }
    const results: CharResult[] = []

    // Build search queue: prominent known characters first, then shuffle the rest.
    // Prominent chars have much higher CV hit rates and avoid burning rate limits on obscure names.
    const prominentSet = new Set<string>()
    for (const tag of args.diversityTags) {
      for (const name of PROMINENT_DIVERSE[tag] ?? []) prominentSet.add(name)
    }
    const remainingNames = Array.from(tagMap.keys()).filter(n => !prominentSet.has(n))
    // Shuffle remainder so we don't always get A-names from worldofblackheroes
    for (let i = remainingNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingNames[i], remainingNames[j]] = [remainingNames[j], remainingNames[i]]
    }
    // Cap at 80: prominent first, then random sample from full list
    const searchQueue = [...Array.from(prominentSet), ...remainingNames].slice(0, 80)

    console.log(`[charSearch] ${searchQueue.length} in queue (${prominentSet.size} prominent first, stop at ${args.maxResults})`)

    // Strategy: search CV for CHARACTER → get char ID → fetch volumes by character ID
    // Batch size 3 + 600ms delay to stay under CV rate limit (~200 req/hour)
    const BATCH = 3
    for (let i = 0; i < searchQueue.length; i += BATCH) {
      if (results.length >= args.maxResults) break
      const batch = searchQueue.slice(i, i + BATCH)
      const batchOut = await Promise.all(batch.map(async name => {
        try {
          // Step A: search for volumes named after this character
          const volHits = await searchComicVine(name, ['volume'], 8)
          if (!volHits.length) return null
          const filtered = volHits.filter(vol => {
            const year = vol.start_year ? parseInt(vol.start_year) : null
            if (!year) return !yearFrom && !yearTo
            const from = yearFrom ?? 1965
            if (year < from - 1) return false
            if (yearTo && year > yearTo + 1) return false
            return true
          })
          if (!filtered.length) return null
          filtered.sort((a, b) => parseInt(b.start_year ?? '0') - parseInt(a.start_year ?? '0'))
          const topVolumes = filtered.slice(0, 6)

          // Step B: get character deck/realName — use catalog cache if available, else CV search
          const cached = detailCache[name]
          let deck: string | undefined     = cached?.deck
          let realName: string | undefined = cached?.realName
          if (!cached) {
            const charHits = await searchComicVine(name, ['character'], 3)
            const nl = name.toLowerCase()
            const bestChar = charHits.find(h => h.name?.toLowerCase() === nl) ?? charHits[0]
            if (bestChar) {
              console.log(`[cv:char] "${name}" → CV "${bestChar.name}" id=${bestChar.id}`)
              deck     = bestChar.deck
              realName = bestChar.real_name
            }
          }

          return {
            character: name,
            tags:      tagMap.get(name) ?? [],
            deck,
            realName,
            volumes: topVolumes.map(vol => ({
              id:         vol.id,
              name:       vol.name,
              year:       vol.start_year,
              publisher:  vol.publisher?.name,
              coverUrl:   vol.image?.medium_url,
              siteUrl:    vol.site_detail_url,
              issueCount: vol.count_of_issues,
            })),
          } satisfies CharResult
        } catch (e) {
          console.log(`[cv:err] "${batch.join(',')}" → ${e instanceof Error ? e.message : String(e)}`)
          return null
        }
      }))
      for (const r of batchOut) if (r) results.push(r)
      if (i + BATCH < searchQueue.length && results.length < args.maxResults) {
        await new Promise(r => setTimeout(r, 600))
      }
    }

    console.log(`[charSearch] ${results.length} characters with CV volumes — enriching with powers/first appearance`)

    // Step 3: enrich with powers/firstAppearance — skip if already in catalog cache
    await Promise.all(results.map(async r => {
      const cached = detailCache[r.character]
      if (cached) {
        if (cached.powers?.length)    r.powers         = cached.powers
        if (cached.firstAppearance)   r.firstAppearance = cached.firstAppearance
        return
      }
      try {
        const detail = await findCharacter(r.character)
        if (!detail) return
        if (detail.powers?.length) r.powers = detail.powers.slice(0, 6).map((p: { name: string }) => p.name)
        const fa = detail.first_appeared_in_issue
        if (fa?.name) r.firstAppearance = fa.name
      } catch { /* enrichment optional */ }
    }))

    console.log(`[charSearch] enrichment done`)
    return results
  },
})

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
    diversityTags:      v.optional(v.array(v.string())), // used to fetch character context from Wikipedia
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
      // Fetch character context from Wikipedia if diversity tags provided
      let characterContext: string[] | undefined
      if (args.diversityTags?.length) {
        const charMap = new Map<string, boolean>()
        await Promise.all(args.diversityTags.map(async tag => {
          function addCtx(titles: string[]) {
            for (const t of titles) {
              if (t.startsWith('List of') || t.includes(':')) continue
              const clean = cleanCharacterName(t)
              if (clean.length >= 3 && clean.length <= 50) charMap.set(clean, true)
            }
          }
          if (tag === 'black') addCtx(await fetchWorldOfBlackHeroes())
          for (const page of WIKI_LIST_PAGES[tag] ?? []) addCtx(await fetchWikiListPage(page))
          for (const cat  of WIKI_CATEGORY_FALLBACK[tag] ?? []) addCtx(await fetchWikiCategory(cat))
        }))
        if (charMap.size > 0) characterContext = Array.from(charMap.keys()).slice(0, 40)
        console.log(`[runSearch] character context: ${characterContext?.length ?? 0} names from Wikipedia`)
      }

      const params: SearchParams = {
        dateMode:           args.dateMode,
        dateFrom:           args.dateFrom,
        dateTo:             args.dateTo,
        maxResults:         args.maxResults,
        publishers:         args.publishers,
        minConfidence:      args.minConfidence as Confidence | undefined,
        requireImages:      args.requireImages,
        maxImagesPerResult: args.maxImagesPerResult,
        characterContext,
      }

      const response = await searchComics(params)

      // CV batch enrichment — top 5 results, best-effort (volumes only — issues lack creator credits)
      const enrichedResults = await Promise.all(
        response.results.slice(0, 5).map(async r => {
          try {
            // Strip #N, (YYYY) from AI-returned titles before searching CV
            const cleanTitle = r.title
              ?.replace(/\s*#\d+(\.\d+)?/g, '')
              .replace(/\s*\(\d{4}\)/g, '')
              .trim() ?? ''
            const query = `${cleanTitle} ${r.publisher ?? ''}`.trim()
            const cvMatches = await searchComicVine(query, ['volume'], 5)
            if (!cvMatches.length) return r
            // Prefer exact name match, then highest issue count
            const exact = cvMatches.find(m => m.name?.toLowerCase() === cleanTitle.toLowerCase())
            const sorted = [...cvMatches].sort((a, b) => (b.count_of_issues ?? 0) - (a.count_of_issues ?? 0))
            const best = exact ?? sorted[0]
            return {
              ...r,
              cvId:       best.id,
              cvUrl:      best.site_detail_url,
              cvCoverUrl: best.image?.original_url ?? best.image?.medium_url,
            }
          } catch {
            return r
          }
        })
      )
      const allResults = [
        ...enrichedResults,
        ...response.results.slice(5),
      ]

      const items = allResults
        .filter(r => r.title && r.release_date)  // skip malformed rows missing required fields
        .map(r => ({
          title:       r.title,
          issue:       r.issue       ?? '',
          publisher:   r.publisher   ?? '',
          releaseDate: r.release_date,
          confidence:  r.confidence  ?? 'low',
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
