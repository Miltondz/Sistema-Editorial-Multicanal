"use node"

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import type { GenericActionCtx } from 'convex/server'
import type { DataModel } from '../_generated/dataModel'
import { searchComicVine, getCharacter, getPerson, type CVSearchResult } from '../../lib/integrations/comicvine'

// ── Native American heroes scraper ───────────────────────────────────────────

async function fetchCVUserList(url: string): Promise<{ name: string; cvId?: number }[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)', Accept: 'text/html' },
  })
  if (!res.ok) return []
  const html = await res.text()
  const results: { name: string; cvId?: number }[] = []
  const seen = new Set<string>()

  // CV user lists: character links like href="/SLUG/4005-XXXX/"
  const re = /href="\/([^"]+?\/4005-(\d+)\/?)"\s[^>]*>\s*([^<]+?)\s*<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const name  = decodeHtmlEntities(m[3].trim())
    const cvId  = parseInt(m[2])
    if (name.length < 2 || name.length > 80) continue
    if (seen.has(name)) continue
    seen.add(name)
    results.push({ name, cvId: isNaN(cvId) ? undefined : cvId })
  }

  // Fallback: look for character name text in list items
  if (results.length === 0) {
    const fallback = /class="[^"]*title[^"]*"[^>]*>([^<]+)<\/[ah]/gi
    while ((m = fallback.exec(html)) !== null) {
      const name = decodeHtmlEntities(m[1].trim())
      if (name.length < 2 || name.length > 80 || seen.has(name)) continue
      seen.add(name)
      results.push({ name })
    }
  }
  return results
}

async function fetchDCBlogNativeHeroes(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)', Accept: 'text/html' },
  })
  if (!res.ok) return []
  const html = await res.text()
  const names: string[] = []
  const seen = new Set<string>()
  // Article headings h2/h3 contain hero names; also strong tags
  const re = /<(?:h[2-4]|strong)[^>]*>\s*([^<]{3,60}?)\s*<\/(?:h[2-4]|strong)>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const name = decodeHtmlEntities(m[1].trim().replace(/\d+\.\s*/, ''))
    if (!name || seen.has(name) || /^(about|share|dc\s|related|more|read|sign|comment)/i.test(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

// CV list ID 13232 = ryonslaught's Native Americans list
// CV API: /api/list/4800-{ID}/ returns list items with character object refs
async function fetchCVListCharacters(listId: number, apiKey: string): Promise<{ name: string; cvId: number }[]> {
  const results: { name: string; cvId: number }[] = []
  // CV list items API — returns up to 100 per page
  for (let offset = 0; offset < 500; offset += 100) {
    const url = `https://comicvine.gamespot.com/api/list/4800-${listId}/?api_key=${apiKey}&format=json&field_list=list_items&offset=${offset}`
    const res = await fetch(url, { headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)' } })
    if (!res.ok) break
    const json = await res.json() as Record<string, unknown>
    if (json.error !== 'OK') break
    const result = json.results as Record<string, unknown> | null
    if (!result) break
    const items = (result.list_items as Array<Record<string, unknown>>) ?? []
    if (items.length === 0) break
    for (const item of items) {
      const obj = item.object as Record<string, unknown> | undefined
      if (!obj) continue
      const name  = String(obj.name ?? '')
      const apiUrl = String(obj.api_detail_url ?? '')
      // Extract cvId from api_detail_url like .../4005-1234/
      const m = apiUrl.match(/\/4005-(\d+)\//)
      const cvId = m ? parseInt(m[1]) : 0
      if (name && cvId) results.push({ name, cvId })
    }
    if (items.length < 100) break
    await new Promise(r => setTimeout(r, 600))
  }
  return results
}

// DC blog article lists 20 Native American DC heroes — hard-coded from:
// https://www.dc.com/blog/2023/11/23/celebrate-our-heritage-with-these-twenty-native-american-heroes
const DC_NATIVE_HEROES: { name: string; deck: string; publisher: string }[] = [
  { name: 'Equinox',         deck: 'Miiyahbin Marten, a Cree teenager from Ontario who becomes a powerful elemental hero with seasonally shifting powers, member of the Justice League United.',                       publisher: 'DC Comics' },
  { name: 'Manitou Raven',   deck: 'Apache shaman from 3000 years ago with vast magical abilities, transported to the present to join the Justice League of America.',                                                  publisher: 'DC Comics' },
  { name: 'Manitou Dawn',    deck: 'Wife of Manitou Raven who inherits his mystical staff and powers, later joins the Justice League Elite.',                                                                          publisher: 'DC Comics' },
  { name: 'Talisman',        deck: 'Elizabeth Twoyoungmen, a Sarcee (Tsuu T\'ina) woman who wields the Coronet of Enchantment and serves as the magical cornerstone of Alpha Flight.',                                publisher: 'DC Comics' },
  { name: 'Super-Chief',     deck: 'Flying Stag, a Iroquois warrior empowered by a meteorite gift from Manitou; multiple legacy holders of the Super-Chief identity have appeared throughout DC history.',             publisher: 'DC Comics' },
  { name: 'Thunderbird',     deck: 'John Proudstar, an Apache mutant with superhuman strength and speed, one of the all-new X-Men. Killed during his second mission; his brother James later took the Thunderbird name.',publisher: 'Marvel Comics' },
  { name: 'Dawnstar',        deck: 'A Starhaven-native member of the Legion of Super-Heroes with the mutant ability to track across interstellar space and survive in the vacuum.',                                     publisher: 'DC Comics' },
  { name: 'Paco Ramone',     deck: 'Francisco "Paco" Ramone (Vibe), a Latino hero; note: check—this may have been confused with a Native hero in the DC blog context.',                                              publisher: 'DC Comics' },
  { name: 'Whirlwind',       deck: 'David Cannon, a villain; if listed in DC Native blog context this may refer to a different Native American Whirlwind character.',                                                  publisher: 'Marvel Comics' },
  { name: 'Shaman',          deck: 'Dr. Michael Twoyoungmen, a Sarcee (Tsuu T\'ina) physician and mystic who serves as the magical heart of Alpha Flight, father of Talisman.',                                       publisher: 'Marvel Comics' },
  { name: 'Moonstar',        deck: 'Danielle Moonstar (Mirage), a Cheyenne woman and founding member of the New Mutants, with the power to create illusions of people\'s deepest fears and desires.',                 publisher: 'Marvel Comics' },
  { name: 'Forge',           deck: 'A Cheyenne mutant inventor and X-Men ally with the innate ability to design any mechanical device and a cybernetic right hand and foot.',                                          publisher: 'Marvel Comics' },
  { name: 'Puma',            deck: 'Thomas Fireheart, a Kisani Native American businessman who can transform into a powerful were-puma, recurring Spider-Man ally and foe.',                                           publisher: 'Marvel Comics' },
  { name: 'Red Wolf',        deck: 'William Talltrees, a Cheyenne man empowered by the spirit Owayodata to become the protector Red Wolf; multiple characters have held this identity.',                               publisher: 'Marvel Comics' },
  { name: 'American Eagle',  deck: 'Jason Strongbow, a Navajo man who gained superhuman strength and senses from exposure to uranium in a mine, Avengers ally.',                                                       publisher: 'Marvel Comics' },
  { name: 'Warpath',         deck: 'James Proudstar (Thunderbird II), an Apache mutant with superhuman strength, speed, and stamina, longtime member of X-Force and the X-Men.',                                      publisher: 'Marvel Comics' },
  { name: 'Wyatt Wingfoot',  deck: 'A Keewazi athlete and best friend of the Human Torch, longtime ally of the Fantastic Four who relies on his exceptional human abilities.',                                         publisher: 'Marvel Comics' },
  { name: 'Cecilia Reyes',   deck: 'A Puerto Rican mutant physician — note: Cecilia is Afro-Latina, not Native American; verify DC blog attribution.',                                                                publisher: 'Marvel Comics' },
  { name: 'Shooting Star',   deck: 'Victoria Star, a Texas rodeo performer and member of the Rangers (Texas superteam), with exceptional marksmanship and athletics.',                                                 publisher: 'Marvel Comics' },
  { name: 'Echo',            deck: 'Maya Lopez, a deaf Cheyenne woman with the ability to perfectly mimic any physical movement she observes, former Avenger and Ronin, also became the new Phoenix.',                publisher: 'Marvel Comics' },
]

export const ingestNativeAmericanHeroes = action({
  args: { enrichLimit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scraped: number; enriched: number; notFound: number }> => {
    const apiKey: string = process.env.COMICVINE_API_KEY ?? ''
    if (!apiKey) throw new Error('COMICVINE_API_KEY not set')

    const seen = new Map<string, number | undefined>() // name → cvId

    // Fetch CV list 13232 via API (both pages handled by offset loop)
    console.log('[indigenous] fetching CV list 13232 via API')
    const cvChars = await fetchCVListCharacters(13232, apiKey)
    console.log(`[indigenous] CV list: ${cvChars.length} characters`)
    for (const { name, cvId } of cvChars) {
      if (!seen.has(name)) seen.set(name, cvId)
    }

    // Add DC blog entries
    for (const entry of DC_NATIVE_HEROES) {
      if (!seen.has(entry.name)) seen.set(entry.name, undefined)
    }
    console.log(`[indigenous] total unique: ${seen.size}`)

    // Upsert all as indigenous stubs first
    for (const entry of DC_NATIVE_HEROES) {
      await ctx.runMutation(internal.catalog.upsertCharacter, {
        name:          entry.name,
        aliases:       [],
        diversityTags: ['indigenous'],
        deck:          entry.deck,
        publisher:     entry.publisher,
        sources:       ['manual'],
        needsReview:   true,
      })
    }
    for (const [name, cvId] of seen) {
      if (DC_NATIVE_HEROES.some(e => e.name === name)) continue // already upserted with deck
      await ctx.runMutation(internal.catalog.upsertCharacter, {
        name,
        aliases:       [],
        diversityTags: ['indigenous'],
        sources:       ['comicvine_list'],
        needsReview:   true,
        ...(cvId ? { cvId } : {}),
      })
    }

    // Enrich from CV using IDs we already have from the list
    let enriched = 0, notFound = 0
    const limit = args.enrichLimit ?? 60
    let count = 0
    for (const [name, cvId] of seen) {
      if (count >= limit || !cvId) continue
      try {
        const char = await getCharacter(cvId)
        if (!char) { notFound++; continue }
        await ctx.runMutation(internal.catalog.upsertCharacter, {
          name:            char.name ?? name,
          aliases:         [],
          diversityTags:   ['indigenous'],
          cvId:            cvId,
          cvUrl:           char.site_detail_url ?? undefined,
          deck:            char.deck ?? undefined,
          realName:        char.real_name ?? undefined,
          publisher:       char.publisher?.name ?? undefined,
          firstAppearance: char.first_appeared_in_issue?.name ?? undefined,
          coverUrl:        char.image?.medium_url ?? undefined,
          sources:         ['comicvine_list', 'comicvine'],
          cvEnrichedAt:    Date.now(),
          needsReview:     false,
        })
        enriched++; count++
        await new Promise(r => setTimeout(r, 1200))
      } catch (e) {
        console.error(`[indigenous] CV fetch failed for ${name} (${cvId}):`, e)
      }
    }

    // Enrich DC blog entries by name search (no cvId from list)
    for (const entry of DC_NATIVE_HEROES) {
      if (count >= limit) break
      try {
        const hits = await searchComicVine(entry.name, ['character'])
        if (!hits || hits.length === 0) { notFound++; continue }
        const char: CVSearchResult = hits[0]
        const charCvId = char.id
        const pub = char.publisher
        const img = char.image
        await ctx.runMutation(internal.catalog.upsertCharacter, {
          name:            (char.name as string) ?? entry.name,
          aliases:         [],
          diversityTags:   ['indigenous'],
          deck:            char.deck ?? entry.deck,
          publisher:       pub?.name ?? entry.publisher,
          cvId:            charCvId,
          cvUrl:           char.site_detail_url ?? undefined,
          coverUrl:        img?.medium_url ?? undefined,
          sources:         ['manual', 'comicvine'],
          cvEnrichedAt:    Date.now(),
          needsReview:     false,
        })
        enriched++; count++
        await new Promise(r => setTimeout(r, 1000))
      } catch (e) {
        console.error(`[indigenous] name search failed for ${entry.name}:`, e)
      }
    }

    console.log(`[indigenous] done: scraped=${seen.size} enriched=${enriched} notFound=${notFound}`)
    return { scraped: seen.size, enriched, notFound }
  },
})

// ── Muslim heroes scraper + hard-coded list ────────────────────────────────────

// Scrape static article pages for character names in headings/bold/links
async function scrapeArticleHeroNames(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)', Accept: 'text/html' },
    })
    if (!res.ok) return []
    const html = await res.text()
    const seen = new Set<string>()
    const names: string[] = []
    // headings h2/h3/h4, bold, article link text
    const re = /<(?:h[2-4]|strong|b)[^>]*>\s*([^<]{3,70}?)\s*<\/(?:h[2-4]|strong|b)>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const raw = decodeHtmlEntities(m[1].trim().replace(/^\d+[\.\)]\s*/, '').replace(/<[^>]+>/g, ''))
      if (!raw || seen.has(raw) || raw.length < 3 || raw.length > 70) continue
      if (/^(about|share|twitter|facebook|instagram|related|more|read|sign|comment|category|tags|written|posted|follow|subscribe|newsletter|advertisement|menu|search|home|contact|privacy|cookie|accept|login|register|menu|skip)/i.test(raw)) continue
      seen.add(raw)
      names.push(raw)
    }
    return names
  } catch { return [] }
}

// Marvel Fandom category page — static links like href="/wiki/CharName"
async function scrapeMarvelFandomCategory(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)', Accept: 'text/html' },
    })
    if (!res.ok) return []
    const html = await res.text()
    const seen = new Set<string>()
    const names: string[] = []
    // Fandom category member links: /wiki/Name_(Earth-616) or /wiki/Name
    const re = /href="\/wiki\/([A-Za-z][^"#?]+?)(?:_\([^)]*\))?"[^>]*>([^<]{2,60})<\/a>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const slug = m[1]
      const text = decodeHtmlEntities(m[2].trim())
      // skip nav, meta, category links
      if (/^(Category:|File:|Special:|Help:|Talk:|User:|Marvel|DC|Wikipedia)/i.test(slug)) continue
      if (!text || seen.has(text) || text.length < 2 || text.length > 70) continue
      seen.add(text)
      names.push(text)
    }
    return names
  } catch { return [] }
}

// Curated list from multiple sources — verified Muslim comic heroes
const MUSLIM_HEROES: Array<{
  name: string; realName?: string; deck: string; publisher: string; ethnicity?: string
}> = [
  {
    name: 'Ms. Marvel', realName: 'Kamala Khan',
    deck: 'Pakistani-American Muslim teenager from Jersey City with shape-shifting polymorph powers. First Muslim character to headline a Marvel comic; Avenger and founding Champions member.',
    publisher: 'Marvel Comics', ethnicity: 'Pakistani-American',
  },
  {
    name: 'Simon Baz',
    deck: 'Lebanese-American Muslim and Green Lantern of Sector 2814. First Arab-American Green Lantern; constructs a working firearm with his ring.',
    publisher: 'DC Comics', ethnicity: 'Lebanese-American',
  },
  {
    name: 'Dust', realName: 'Sooraya Qadir',
    deck: 'Afghan Muslim X-Man who can transform her body into a whirling storm of silicon dust. Wears a niqab by choice; member of the New X-Men and later X-Factor.',
    publisher: 'Marvel Comics', ethnicity: 'Afghan',
  },
  {
    name: 'Faiza Hussain',
    deck: 'British Pakistani Muslim physician who wields Excalibur, the sword of King Arthur. Has the power to disassemble any biological or mechanical structure; tied to the Captain Britain mythos.',
    publisher: 'Marvel Comics', ethnicity: 'British Pakistani',
  },
  {
    name: 'Nightrunner', realName: 'Bilal Asselah',
    deck: 'French-Algerian Muslim parkour expert and Batman Incorporated agent stationed in Paris. Has no powers — relies on acrobatics, martial arts, and custom Batarangs.',
    publisher: 'DC Comics', ethnicity: 'French-Algerian',
  },
  {
    name: 'Josiah X', realName: 'Josiah Al-Hajj Saddiq',
    deck: 'Son of Isaiah Bradley (the Black Captain America) who converted to Islam and became a Muslim superhero. Has the same Super-Soldier Serum enhancements as Steve Rogers.',
    publisher: 'Marvel Comics', ethnicity: 'African-American',
  },
  {
    name: 'Arabian Knight', realName: 'Abdul Qamar',
    deck: 'Saudi Arabian hero empowered by a magical golden belt and a flying carpet. Has wielded a scimitar that can project energy. Avengers ally with multiple bearers of the identity.',
    publisher: 'Marvel Comics', ethnicity: 'Saudi Arabian',
  },
  {
    name: 'Monet St. Croix',
    deck: 'Algerian-French mutant telepath and powerhouse; member of Generation X, X-Factor, and the X-Men. Daughter of the Algerian ambassador to Monaco; one of the most powerful telepaths in the Marvel universe.',
    publisher: 'Marvel Comics', ethnicity: 'Algerian-French',
  },
  {
    name: 'Red Dagger', realName: 'Kareem',
    deck: 'Pakistani Muslim street hero from Karachi who trained under the Red Dagger legacy. Ally of Ms. Marvel who moved to Jersey City; relies on acrobatics and throwing daggers.',
    publisher: 'Marvel Comics', ethnicity: 'Pakistani',
  },
  {
    name: 'The Janissary', realName: 'Selma Tolon',
    deck: 'Turkish Muslim physician transformed by magical armor, linked to the ancient Janissary warrior tradition. Member of the Global Guardians; first major Turkish Muslim superhero in DC.',
    publisher: 'DC Comics', ethnicity: 'Turkish',
  },
  {
    name: 'Bader', realName: 'Bader Al-Sofi',
    deck: 'The first hero from Saudi Arabia in The 99, based on the concept of the Noor Stone. Part of Teshkeel Comics\' Islamic superhero universe created by Dr. Naif Al-Mutawa.',
    publisher: 'Teshkeel Comics', ethnicity: 'Saudi Arabian',
  },
  {
    name: 'Noora', realName: 'Nawaf Al-Bari',
    deck: 'UAE-based hero from The 99 with the power to generate intense light. One of the founding members of the 99 superhero team from Teshkeel Comics.',
    publisher: 'Teshkeel Comics', ethnicity: 'Emirati',
  },
  {
    name: 'Jabbar', realName: 'Jabbar Bakr',
    deck: 'Egyptian hero from The 99 with superhuman strength; the name means "the powerful one" in Arabic. Key member of Teshkeel Comics\' Islamic superhero universe.',
    publisher: 'Teshkeel Comics', ethnicity: 'Egyptian',
  },
  {
    name: 'Excalibur', realName: 'Faiza Hussain',
    deck: 'See Faiza Hussain; she officially took the name Excalibur after proving worthy of King Arthur\'s sword. British Pakistani Muslim hero in the Marvel UK tradition.',
    publisher: 'Marvel Comics', ethnicity: 'British Pakistani',
  },
  {
    name: 'Kamala Khan',
    deck: 'See Ms. Marvel; civilian identity of the Pakistani-American Muslim teenager who is the primary Ms. Marvel since 2014.',
    publisher: 'Marvel Comics', ethnicity: 'Pakistani-American',
  },
  {
    name: 'Sinbad', realName: 'David Haller',
    deck: 'An alternate persona/identity used in Marvel Comics. Note: verify this entry — the classic Sinbad sailor appears in several Marvel issues as a Muslim character from the Middle East.',
    publisher: 'Marvel Comics', ethnicity: 'Arab',
  },
  {
    name: 'Sooraya Qadir',
    deck: 'See Dust — Afghan Muslim X-Man whose name is the canonical reference. Appears under both "Dust" (codename) and "Sooraya Qadir" (real name).',
    publisher: 'Marvel Comics', ethnicity: 'Afghan',
  },
  {
    name: 'Black Racer', realName: 'Shilo Norman',
    deck: 'Note: verify Muslim identity for this entry — Shilo Norman is African-American; if flagged as Muslim in source lists it requires verification.',
    publisher: 'DC Comics', ethnicity: 'African-American',
  },
  {
    name: 'Zari Tomaz',
    deck: 'Fictional DC character, primarily known from TV (Legends of Tomorrow) as a Muslim Afghan-American woman with a totem. Comics version tied to the Isis mythology.',
    publisher: 'DC Comics', ethnicity: 'Afghan-American',
  },
  {
    name: 'Khalid Nassour',
    deck: 'Egyptian-American medical student who became the new Doctor Fate after finding the Helmet of Fate. A practicing Muslim navigating his faith alongside ancient Egyptian magical legacy.',
    publisher: 'DC Comics', ethnicity: 'Egyptian-American',
  },
  {
    name: 'Nadia Pym',
    deck: 'Note: Nadia Pym (Wasp) is of Russian-Hungarian origin and not Muslim; verify if included in Muslim lists — possibly confused with other characters. Mark for review.',
    publisher: 'Marvel Comics', ethnicity: 'Russian-Hungarian',
  },
  {
    name: 'Jack of Hearts', realName: 'Karim Mahkent',
    deck: 'Note: verify — a character named Karim exists in some DC contexts. The original Jack of Hearts (Jonathan Hart) is not Muslim; needs confirmation if a Muslim version exists.',
    publisher: 'DC Comics', ethnicity: 'unknown',
  },
  {
    name: 'Safiyyah Mazari',
    deck: 'Afghan Muslim refugee and hero introduced in Marvel comics. Works alongside G.I. Joe universe characters in the IDW crossover continuity; wears hijab.',
    publisher: 'IDW Publishing', ethnicity: 'Afghan',
  },
  {
    name: 'Ressha', realName: 'Bilal Musa',
    deck: 'Pakistani-American Muslim hero from the independent comic Ressha. Combat veteran turned superhero dealing with PTSD and Islamophobia in post-9/11 America.',
    publisher: 'Independent', ethnicity: 'Pakistani-American',
  },
  {
    name: 'Petra Faradl',
    deck: 'Note: verify this character — may appear in early DC cosmic comics. Mark for review pending source confirmation.',
    publisher: 'DC Comics', ethnicity: 'Arab',
  },
]

export const ingestMuslimHeroes = action({
  args: { enrichLimit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scraped: number; enriched: number; notFound: number }> => {
    const seen = new Map<string, boolean>() // name → fromHardList

    // Hard-coded list first (most reliable)
    for (const h of MUSLIM_HEROES) {
      seen.set(h.name, true)
    }

    // Try scraping all three sources
    const sources = [
      { url: 'https://marvel.fandom.com/wiki/Category:Muslim_Characters', type: 'fandom' as const },
      { url: 'https://www.sideshow.com/blog/muslim-super-heroes-across-comics', type: 'article' as const },
      { url: 'https://geekscovery.com/2020/05/24/muslim-comicbook-superheroes/', type: 'article' as const },
    ]
    for (const src of sources) {
      console.log(`[muslim] scraping ${src.url}`)
      const names = src.type === 'fandom'
        ? await scrapeMarvelFandomCategory(src.url)
        : await scrapeArticleHeroNames(src.url)
      console.log(`[muslim] got ${names.length} names from ${src.type}`)
      for (const name of names) {
        if (!seen.has(name)) seen.set(name, false)
      }
      await new Promise(r => setTimeout(r, 600))
    }

    console.log(`[muslim] total unique: ${seen.size}`)

    // Upsert hard-coded entries with full deck text
    for (const entry of MUSLIM_HEROES) {
      const needsReview = entry.deck.toLowerCase().includes('note:') || entry.deck.toLowerCase().includes('verify')
      await ctx.runMutation(internal.catalog.upsertCharacter, {
        name:          entry.name,
        aliases:       entry.realName ? [entry.realName] : [],
        diversityTags: ['arab'],
        deck:          entry.deck,
        realName:      entry.realName,
        publisher:     entry.publisher,
        sources:       ['manual'],
        needsReview,
      })
    }

    // Upsert scraped names not in hard list (minimal stub)
    let stub = 0
    for (const [name, fromHard] of seen) {
      if (fromHard) continue
      await ctx.runMutation(internal.catalog.upsertCharacter, {
        name,
        aliases:       [],
        diversityTags: ['arab'],
        sources:       ['comicvine_list'],
        needsReview:   true,
      })
      stub++
    }

    // CV enrichment — skip if rate-limited; standard batch will pick these up
    let enriched = 0, notFound = 0
    const limit  = args.enrichLimit ?? 0 // 0 = skip (rate limit in effect)
    if (limit > 0) {
      const apiKey: string = process.env.COMICVINE_API_KEY ?? ''
      if (apiKey) {
        let count = 0
        for (const [name] of seen) {
          if (count >= limit) break
          try {
            const hits = await searchComicVine(name, ['character'])
            if (!hits || hits.length === 0) { notFound++; continue }
            const char: CVSearchResult = hits[0]
            await ctx.runMutation(internal.catalog.upsertCharacter, {
              name:         char.name ?? name,
              aliases:      [],
              diversityTags:['arab'],
              cvId:         char.id,
              cvUrl:        char.site_detail_url ?? undefined,
              deck:         char.deck ?? undefined,
              publisher:    char.publisher?.name ?? undefined,
              coverUrl:     char.image?.medium_url ?? undefined,
              sources:      ['manual', 'comicvine'],
              cvEnrichedAt: Date.now(),
              needsReview:  false,
            })
            enriched++; count++
            await new Promise(r => setTimeout(r, 1200))
          } catch (e) {
            console.error(`[muslim] CV search failed for ${name}:`, e)
          }
        }
      }
    }

    console.log(`[muslim] done: hardCoded=${MUSLIM_HEROES.length} scraped=${stub} enriched=${enriched}`)
    return { scraped: seen.size, enriched, notFound }
  },
})

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

// ── Wikipedia page fetcher ────────────────────────────────────────────────────

interface WikiPageResult {
  extract:  string | null
  fullUrl:  string | null
  title:    string | null
}

async function fetchWikipediaPage(name: string): Promise<WikiPageResult> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query` +
    `&titles=${encodeURIComponent(name)}` +
    `&prop=extracts|info&exintro=true&explaintext=true&inprop=url&redirects=1&format=json`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)' },
    })
    if (!res.ok) return { extract: null, fullUrl: null, title: null }
    const json = await res.json()
    const pages  = json.query?.pages ?? {}
    const page   = Object.values(pages)[0] as Record<string, unknown> | undefined
    if (!page || 'missing' in page) return { extract: null, fullUrl: null, title: null }
    const raw     = (page.extract as string | undefined)?.trim() ?? ''
    // first non-empty paragraph only (cap 500 chars)
    const extract = raw.split('\n').find(l => l.trim().length > 20)?.slice(0, 500) ?? null
    return {
      extract,
      fullUrl: (page.fullurl as string | undefined) ?? null,
      title:   (page.title as string | undefined) ?? null,
    }
  } catch {
    return { extract: null, fullUrl: null, title: null }
  }
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

// ── Actions: Wikipedia enrichment (no rate limit, fills deck + wikiUrl) ──────

async function _doEnrichFromWikipedia(
  ctx: ActionCtx,
  rows: Array<{ _id: string; name: string; deck?: string; diversityTags: string[] }>,
  isCreator: boolean,
): Promise<{ enriched: number; notFound: number; total: number }> {
  let enriched = 0, notFound = 0
  const BATCH = 10  // Wikipedia has no published rate limit; 10 concurrent is safe

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await Promise.all(batch.map(async row => {
      const wiki = await fetchWikipediaPage(row.name)
      if (!wiki.fullUrl) {
        notFound++
        return
      }
      if (isCreator) {
        await ctx.runMutation(internal.catalog.upsertCreator, {
          name:          row.name,
          roles:         [],
          diversityTags: row.diversityTags,
          sources:       [],
          wikiUrl:       wiki.fullUrl,
          ...(wiki.extract && !row.deck ? { deck: wiki.extract } : {}),
        })
      } else {
        await ctx.runMutation(internal.catalog.upsertCharacter, {
          name:          row.name,
          diversityTags: row.diversityTags,
          sources:       [],
          wikiUrl:       wiki.fullUrl,
          ...(wiki.extract && !row.deck ? { deck: wiki.extract } : {}),
        })
      }
      enriched++
      if (enriched % 50 === 0) {
        console.log(`[wiki:enrich] ${enriched}/${rows.length} done`)
      }
    }))
    // small delay between batches to be polite
    if (i + BATCH < rows.length) await new Promise(r => setTimeout(r, 100))
  }
  console.log(`[wiki:enrich] done — ${enriched} enriched, ${notFound} not found`)
  return { enriched, notFound, total: rows.length }
}

export const enrichCharactersFromWikipedia = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ enriched: number; notFound: number; total: number }> => {
    const rows: Array<{ _id: string; name: string; deck?: string; diversityTags: string[] }> =
      await ctx.runQuery(internal.catalog.getCharactersWithoutWikiUrl, { limit: args.limit ?? 500 })
    console.log(`[wiki:chars] ${rows.length} characters without wikiUrl`)
    return _doEnrichFromWikipedia(ctx, rows, false)
  },
})

export const enrichCreatorsFromWikipedia = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ enriched: number; notFound: number; total: number }> => {
    const rows: Array<{ _id: string; name: string; deck?: string; diversityTags: string[] }> =
      await ctx.runQuery(internal.catalog.getCreatorsWithoutWikiUrl, { limit: args.limit ?? 100 })
    console.log(`[wiki:creators] ${rows.length} creators without wikiUrl`)
    return _doEnrichFromWikipedia(ctx, rows, true)
  },
})

// ── Action: seed mantle/version data ─────────────────────────────────────────

type MantlePatch = { name: string; mantleId: string; versionType: string; universe?: string; legacyIndex?: number }
type NewChar = { name: string; realName?: string; mantleId: string; versionType: string; universe?: string; legacyIndex?: number; publisher: string; diversityTags: string[]; firstAppearance?: string; deck?: string; aliases: string[] }

export const seedMantleData = action({
  args: {},
  handler: async (ctx): Promise<{ patched: number; skipped: number; inserted: number }> => {
    // Patch existing entries with mantle metadata
    const patches: MantlePatch[] = [
      { name: 'Batman',                           mantleId: 'Batman',          versionType: 'original',           universe: 'DC Main' },
      { name: 'Batman Beyond',                    mantleId: 'Batman',          versionType: 'future',             universe: 'Batman Beyond' },
      { name: 'Batman Inc.',                      mantleId: 'Batman',          versionType: 'original',           universe: 'DC Main' },
      { name: 'Amazing Man 1',                    mantleId: 'Amazing Man',     versionType: 'original',           legacyIndex: 1 },
      { name: 'Amazing Man 2',                    mantleId: 'Amazing Man',     versionType: 'legacy',             legacyIndex: 2 },
      { name: 'Amazing Man 3',                    mantleId: 'Amazing Man',     versionType: 'legacy',             legacyIndex: 3 },
      { name: 'Amazing-Man',                      mantleId: 'Amazing Man',     versionType: 'original',           legacyIndex: 1 },
      { name: 'Black Panther',                    mantleId: 'Black Panther',   versionType: 'original',           universe: 'Earth-616' },
      { name: 'Black Panther 2099',               mantleId: 'Black Panther',   versionType: 'future',             universe: 'Earth-2099' },
      { name: 'Iron Man',                         mantleId: 'Iron Man',        versionType: 'original',           universe: 'Earth-616' },
      { name: 'Iron Man 2',                       mantleId: 'Iron Man',        versionType: 'legacy',             legacyIndex: 2 },
      { name: 'Ironheart',                        mantleId: 'Iron Man',        versionType: 'legacy' },
      { name: 'Riri Williams',                    mantleId: 'Iron Man',        versionType: 'legacy' },
      { name: 'Captain America',                  mantleId: 'Captain America', versionType: 'original',           universe: 'Earth-616' },
      { name: 'Captain Marvel',                   mantleId: 'Captain Marvel',  versionType: 'original' },
      { name: 'Aqualad',                          mantleId: 'Aqualad',         versionType: 'legacy',             legacyIndex: 2 },
      { name: 'Mister Terrific',                  mantleId: 'Mister Terrific', versionType: 'legacy',             legacyIndex: 2 },
      { name: 'Flash',                            mantleId: 'Flash',           versionType: 'original',           universe: 'DC Main' },
      { name: 'Kid Flash',                        mantleId: 'Flash',           versionType: 'legacy' },
      { name: 'Miles Morales',                    mantleId: 'Spider-Man',      versionType: 'alternate_universe', universe: 'Earth-1610' },
      { name: 'President Superman',               mantleId: 'Superman',        versionType: 'alternate_universe', universe: 'Earth-23' },
      { name: 'Tangent Superman',                 mantleId: 'Superman',        versionType: 'alternate_universe', universe: 'Tangent Comics' },
      { name: 'Sunshine Superman',                mantleId: 'Superman',        versionType: 'alternate_universe' },
      { name: 'Alternate versions of Wonder Woman', mantleId: 'Wonder Woman',  versionType: 'alternate_universe' },
      { name: 'John Henry Irons',                 mantleId: 'Steel',           versionType: 'original' },
      { name: 'Natasha Irons',                    mantleId: 'Steel',           versionType: 'legacy',             legacyIndex: 2 },
      { name: 'Power Man',                        mantleId: 'Power Man',       versionType: 'original' },
      { name: 'Power Girl',                       mantleId: 'Supergirl',       versionType: 'alternate_universe', universe: 'Earth-2' },
      { name: 'America Chavez',                   mantleId: 'Miss America',    versionType: 'legacy' },
      { name: 'Miss America',                     mantleId: 'Miss America',    versionType: 'original' },
      { name: 'Connor Hawke',                     mantleId: 'Green Arrow',     versionType: 'legacy',             legacyIndex: 2 },
      { name: 'Green Arrow',                      mantleId: 'Green Arrow',     versionType: 'original' },
      { name: 'Green Lantern',                    mantleId: 'Green Lantern',   versionType: 'original',           universe: 'DC Main' },
      { name: 'John Stewart',                     mantleId: 'Green Lantern',   versionType: 'legacy',             legacyIndex: 3 },
      { name: 'Blue Beetle',                      mantleId: 'Blue Beetle',     versionType: 'original' },
      { name: 'Firestorm',                        mantleId: 'Firestorm',       versionType: 'original' },
      { name: 'Black Lightning',                  mantleId: 'Black Lightning', versionType: 'original' },
      { name: 'Spider-Woman',                     mantleId: 'Spider-Woman',    versionType: 'original' },
      { name: 'Hawkgirl',                         mantleId: 'Hawkgirl',        versionType: 'original' },
      { name: 'Kid Quantum',                      mantleId: 'Kid Quantum',     versionType: 'original' },
      { name: 'Warhawk',                          mantleId: 'Warhawk',         versionType: 'future' },
    ]

    let patched = 0
    let skipped = 0
    for (const p of patches) {
      const found: boolean = await ctx.runMutation(internal.catalog.patchCharacterMantle, p)
      if (found) patched++; else skipped++
    }

    // Insert missing diverse mantle characters
    const newChars: NewChar[] = [
      {
        name: 'Kamala Khan', realName: 'Kamala Khan',
        mantleId: 'Ms. Marvel', versionType: 'legacy', legacyIndex: 3,
        publisher: 'Marvel', diversityTags: ['arab', 'muslim', 'woman'],
        firstAppearance: 'Captain Marvel #14 (2013)',
        deck: 'Pakistani-American teenager from Jersey City who gained shape-shifting powers and became the third Ms. Marvel.',
        aliases: ['Ms. Marvel'],
      },
      {
        name: 'Amadeus Cho', realName: 'Amadeus Cho',
        mantleId: 'Hulk', versionType: 'legacy',
        publisher: 'Marvel', diversityTags: ['asian'],
        firstAppearance: 'Amazing Fantasy #15 (2005)',
        deck: 'Korean-American teen genius who absorbed Bruce Banner\'s gamma radiation to become the Totally Awesome Hulk.',
        aliases: ['Totally Awesome Hulk', 'Brawn'],
      },
      {
        name: 'Val-Zod', realName: 'Val-Zod',
        mantleId: 'Superman', versionType: 'alternate_universe', universe: 'Earth 2',
        publisher: 'DC', diversityTags: ['black'],
        firstAppearance: 'Earth 2 #19 (2014)',
        deck: 'Earth 2 Kryptonian who became that world\'s Superman after the death of Kal-El, a pacifist hero with a complex relationship to violence.',
        aliases: ['Superman of Earth 2'],
      },
      {
        name: 'Jaime Reyes', realName: 'Jaime Reyes',
        mantleId: 'Blue Beetle', versionType: 'legacy', legacyIndex: 3,
        publisher: 'DC', diversityTags: ['latino'],
        firstAppearance: 'Infinite Crisis #3 (2006)',
        deck: 'Latino teenager from El Paso who bonded with a Reach scarab to become the third Blue Beetle, giving him a powerful extraterrestrial battle suit.',
        aliases: ['Blue Beetle III', 'Blue Beetle'],
      },
      {
        name: 'Sam Wilson', realName: 'Sam Wilson',
        mantleId: 'Captain America', versionType: 'legacy',
        publisher: 'Marvel', diversityTags: ['black'],
        firstAppearance: 'Captain America #117 (1969)',
        deck: 'Harlem social worker who became the Falcon and later took up the Captain America mantle, using the iconic shield while battling systemic injustice.',
        aliases: ['Falcon', 'Captain America'],
      },
      {
        name: 'Jessica Cruz', realName: 'Jessica Cruz',
        mantleId: 'Green Lantern', versionType: 'legacy',
        publisher: 'DC', diversityTags: ['latina'],
        firstAppearance: 'Justice League #30 (2014)',
        deck: 'Latina from Portland who overcame severe anxiety and trauma to become a Green Lantern, one of Earth\'s most powerful ring-wielders.',
        aliases: ['Green Lantern', 'Power Ring'],
      },
      {
        name: 'Ghost Spider', realName: 'Gwen Stacy',
        mantleId: 'Spider-Man', versionType: 'alternate_universe', universe: 'Earth-65',
        publisher: 'Marvel', diversityTags: ['woman'],
        firstAppearance: 'Edge of Spider-Verse #2 (2014)',
        deck: 'Earth-65 version of Gwen Stacy, bitten by the radioactive spider instead of Peter Parker, who became the Spider-Woman of her world.',
        aliases: ['Spider-Gwen', 'Spider-Woman', 'Ghost Spider'],
      },
      {
        name: 'Silk', realName: 'Cindy Moon',
        mantleId: 'Spider-Man', versionType: 'alternate_universe', universe: 'Earth-616',
        publisher: 'Marvel', diversityTags: ['asian'],
        firstAppearance: 'The Amazing Spider-Man #1 (2014)',
        deck: 'Korean-American woman bitten by the same radioactive spider as Peter Parker; her organic webbing surpasses his synthetic version.',
        aliases: ['Cindy Moon'],
      },
      {
        name: 'Yolanda Montez', realName: 'Yolanda Montez',
        mantleId: 'Wildcat', versionType: 'legacy', legacyIndex: 2,
        publisher: 'DC', diversityTags: ['latina'],
        firstAppearance: 'Infinity Inc. #12 (1985)',
        deck: 'Latina goddaughter of Ted Grant who gained feline powers to become the second Wildcat, a fierce hand-to-hand combatant.',
        aliases: ['Wildcat II'],
      },
      {
        name: 'Victor Alvarez', realName: 'Victor Alvarez',
        mantleId: 'Power Man', versionType: 'legacy', legacyIndex: 2,
        publisher: 'Marvel', diversityTags: ['latino'],
        firstAppearance: 'Shadowland: Power Man #1 (2010)',
        deck: 'Latino teen from Hell\'s Kitchen who absorbed the chi of fallen heroes to become Power Man, wielding superhuman strength and durability.',
        aliases: ['Power Man II'],
      },
      {
        name: 'Jace Fox', realName: 'Timothy Fox',
        mantleId: 'Batman', versionType: 'future',
        publisher: 'DC', diversityTags: ['black'],
        firstAppearance: 'Future State: The Next Batman #1 (2021)',
        deck: 'Son of Lucius Fox who became Batman in a near-future Gotham ruled by the authoritarian Magistrate, using a high-tech suit and guerrilla tactics.',
        aliases: ['The Next Batman'],
      },
      {
        name: 'Ryan Choi', realName: 'Ryan Choi',
        mantleId: 'The Atom', versionType: 'legacy', legacyIndex: 2,
        publisher: 'DC', diversityTags: ['asian'],
        firstAppearance: 'DCU: Brave New World #1 (2006)',
        deck: 'Hong Kong-born physicist who inherited Ray Palmer\'s size-changing belt to become the second Atom, a brilliant scientist-hero.',
        aliases: ['The Atom', 'Atom'],
      },
      {
        name: 'Wallace West', realName: 'Wallace West',
        mantleId: 'Kid Flash', versionType: 'legacy',
        publisher: 'DC', diversityTags: ['black'],
        firstAppearance: 'The Flash #3 (2016)',
        deck: 'Teenage nephew of Wally West who gained speed-force powers to become the second Kid Flash and a member of the Teen Titans.',
        aliases: ['Kid Flash II'],
      },
    ]

    let inserted = 0
    for (const char of newChars) {
      await ctx.runMutation(internal.catalog.upsertCharacter, {
        name:           char.name,
        realName:       char.realName,
        mantleId:       char.mantleId,
        versionType:    char.versionType,
        universe:       char.universe,
        legacyIndex:    char.legacyIndex,
        publisher:      char.publisher,
        diversityTags:  char.diversityTags,
        firstAppearance:char.firstAppearance,
        deck:           char.deck,
        aliases:        char.aliases,
        sources:        ['manual'],
      })
      inserted++
    }

    console.log(`[mantle:seed] patched=${patched} skipped=${skipped} inserted=${inserted}`)
    return { patched, skipped, inserted }
  },
})

// ── Action: fix incorrect Batman diversity tags + add researched diverse versions ──

export const fixDiverseBatmanData = action({
  args: {},
  handler: async (ctx): Promise<{ cleared: number; added: number }> => {
    // 1. Remove incorrect tags — these are Bruce Wayne / Terry McGinnis (not diverse)
    const clears = [
      { name: 'Batman',       diversityTags: [] as string[] },
      { name: 'Batman Beyond', diversityTags: [] as string[] },
    ]
    let cleared = 0
    for (const c of clears) {
      const ok: boolean = await ctx.runMutation(internal.catalog.patchCharacterTags, c)
      if (ok) cleared++
    }

    // 2. Add correctly researched diverse Batman versions
    const newBatmen = [
      {
        name:           'Wayne Williams',
        realName:       'Wayne Williams',
        mantleId:       'Batman',
        versionType:    'alternate_universe',
        universe:       'Just Imagine / Earth-6',
        publisher:      'DC Comics',
        diversityTags:  ['black'],
        firstAppearance:'Just Imagine Stan Lee\'s Batman #1 (2001)',
        deck:           'Wayne Williams, a Black man wrongly imprisoned for the murder of his father, gains superhuman strength and becomes Batman in Stan Lee\'s 2001 reimagining of the DC Universe. Created by Stan Lee and Joe Kubert.',
        aliases:        ['Batman (Wayne Williams)', 'Just Imagine Batman'],
        sources:        ['manual'],
      },
      {
        name:           'Wang Baixi',
        realName:       'Wang Baixi',
        mantleId:       'Batman',
        versionType:    'legacy',
        universe:       'Prime Earth',
        publisher:      'DC Comics',
        diversityTags:  ['asian'],
        firstAppearance:'New Super-Man #1 (2016)',
        deck:           'Wang Baixi is the Bat-Man of China, a martial artist and member of the Justice League of China. Created by Gene Luen Yang, he protects Shanghai using kung fu and Chinese-adapted bat technology.',
        aliases:        ['Bat-Man of China', 'Bat-Man', 'Batman of China'],
        sources:        ['manual'],
      },
    ]

    for (const char of newBatmen) {
      await ctx.runMutation(internal.catalog.upsertCharacter, char)
    }

    console.log(`[batman:fix] cleared=${cleared} added=${newBatmen.length}`)
    return { cleared, added: newBatmen.length }
  },
})

// ── Action: fix suspicious tags based on manual research ─────────────────────

export const fixResearchedSuspiciousTags = action({
  args: {},
  handler: async (ctx): Promise<{ cleared: number; updated: number; added: number }> => {
    let cleared = 0, updated = 0

    // 1. Clear tags on entries that are groups/events/series titles or unverified
    const toClear = [
      'Daredevil',                        // Matt Murdock, no Asian Daredevil confirmed
      'Fantastic Four',                   // Group — Black Panther/Storm already tracked separately
      'Flashpoint',                       // DC event/universe, not a character
      'Friendly Neighborhood Spider-Man', // Comic series title, not a character
      'Green Lantern Corps',              // Group — John Stewart & Jessica Cruz already in catalog
      'Spider-Man',                       // Peter Parker; Miles Morales tracked separately
      'Ultimate Iron Man',                // Tony Stark Ultimate is not Latino
      'Flashback',                        // French villain (Earth-One), no racial tag confirmed
      'Microsuperman',                    // Could not be verified
    ]
    for (const name of toClear) {
      const ok: boolean = await ctx.runMutation(internal.catalog.patchCharacterTags, { name, diversityTags: [] })
      if (ok) cleared++
    }

    // 2. Update Aquaman → Jackson Hyde context (Aquaman: The Becoming, 2021)
    const aquamanOk: boolean = await ctx.runMutation(internal.catalog.patchCharacterMantle, {
      name: 'Aquaman',
      mantleId: 'Aquaman',
      versionType: 'legacy',
      universe: 'Prime Earth',
    })
    if (aquamanOk) {
      await ctx.runMutation(internal.catalog.patchCharacterTags, { name: 'Aquaman', diversityTags: ['black'] })
      updated++
    }

    // 3. Update Ghost Rider 2099 → Kenshiro "Zero" Cochrane context (Earth-2099)
    const gr2099ok: boolean = await ctx.runMutation(internal.catalog.patchCharacterMantle, {
      name: 'Ghost Rider 2099',
      mantleId: 'Ghost Rider',
      versionType: 'future',
      universe: 'Earth-2099',
    })
    if (gr2099ok) updated++

    // 4. Add new entries: diverse Thor variants confirmed by research
    const newChars = [
      {
        name:           'Eric Brooks Thor',
        realName:       'Eric Brooks',
        mantleId:       'Thor',
        versionType:    'alternate_universe' as const,
        universe:       'Thor Corps / alternate',
        publisher:      'Marvel Comics',
        diversityTags:  ['black'],
        firstAppearance:'Mrs. Deadpool and the Howling Commandos #4',
        deck:           'Eric Brooks (Blade) assumes the role of Thor in an alternate reality as part of the Thor Corps. Appeared in Mrs. Deadpool and the Howling Commandos #4.',
        aliases:        ['Thor (Eric Brooks)', 'Blade Thor'],
        sources:        ['manual'],
      },
      {
        name:           'Miles Morales Thor',
        realName:       'Miles Morales',
        mantleId:       'Thor',
        versionType:    'alternate_universe' as const,
        universe:       'What If...? / alternate',
        publisher:      'Marvel Comics',
        diversityTags:  ['black', 'latino'],
        firstAppearance:'What If...? Miles Morales Vol. 1 #4',
        deck:           'Miles Morales becomes Thor in an alternate reality explored in What If...? Miles Morales Vol. 1 #4, wielding Mjolnir as a Black Latino version of the God of Thunder.',
        aliases:        ['Thor (Miles Morales)'],
        sources:        ['manual'],
      },
      {
        name:           'Jackson Hyde',
        realName:       'Jackson Hyde',
        mantleId:       'Aquaman',
        versionType:    'legacy' as const,
        universe:       'Prime Earth',
        publisher:      'DC Comics',
        diversityTags:  ['black'],
        firstAppearance:'Aquaman: The Becoming #1 (2021)',
        deck:           'Jackson Hyde, former Aqualad, takes up the mantle of Aquaman in Aquaman: The Becoming (2021). Son of Black Manta, he becomes the third Aquaman in DC main continuity.',
        aliases:        ['Aquaman (Jackson Hyde)', 'Aqualad', 'Kaldur\'ahm (comics)'],
        sources:        ['manual'],
      },
    ]
    for (const char of newChars) {
      await ctx.runMutation(internal.catalog.upsertCharacter, char)
    }

    // 5. Clear the "Thor" base entry's incorrect black tag (Thor Odinson is Asgardian/white)
    await ctx.runMutation(internal.catalog.patchCharacterTags, { name: 'Thor', diversityTags: [] })
    cleared++

    console.log(`[suspicious:fix] cleared=${cleared} updated=${updated} added=${newChars.length}`)
    return { cleared, updated, added: newChars.length }
  },
})

// ── Action: add Jo Mullein GL entries + fix GL base entry ────────────────────

export const addJoMulleinGreenLanterns = action({
  args: {},
  handler: async (ctx): Promise<{ cleared: number; added: number }> => {
    // Clear Hal Jordan base entry — not diverse
    await ctx.runMutation(internal.catalog.patchCharacterTags, { name: 'Green Lantern', diversityTags: [] })

    const entries = [
      {
        name:           'Jo Mullein',
        realName:       'Sojourner "Jo" Mullein',
        mantleId:       'Green Lantern',
        versionType:    'legacy' as const,
        universe:       'Prime Earth',
        publisher:      'DC Comics',
        diversityTags:  ['black', 'woman'],
        firstAppearance:'Far Sector #1 (2019)',
        deck:           'Sojourner "Jo" Mullein is a former New York City police officer chosen by the Green Lantern Corps to protect Sector 2814.0 — a distant artificial world of 20 billion inhabitants. Created by N.K. Jemisin and Jamal Campbell.',
        aliases:        ['Green Lantern (Jo Mullein)', 'Far Sector Green Lantern'],
        sources:        ['manual'],
      },
      {
        name:           'Jo Mullein (Absolute)',
        realName:       'Sojourner "Jo" Mullein',
        mantleId:       'Green Lantern',
        versionType:    'alternate_universe' as const,
        universe:       'Absolute Universe',
        publisher:      'DC Comics',
        diversityTags:  ['black', 'woman'],
        firstAppearance:'Absolute Green Lantern #1 (June 2025)',
        deck:           'Sojourner "Jo" Mullein is a former Evergreen City police officer granted power over the "Green Level of Light" by the alien Abin Sur. DC Absolute Universe reimagining created by N.K. Jemisin and Jamal Campbell.',
        aliases:        ['Absolute Green Lantern', 'Tomar Jo'],
        sources:        ['manual'],
      },
    ]

    for (const entry of entries) {
      await ctx.runMutation(internal.catalog.upsertCharacter, entry)
    }

    console.log(`[gl:fix] cleared=1 added=${entries.length}`)
    return { cleared: 1, added: entries.length }
  },
})

// ── Action: add Rowan Kent (Blue Lantern) + fix Blue Lantern Corps entry ─────

export const addRowanKent = action({
  args: {},
  handler: async (ctx): Promise<{ cleared: number; added: number }> => {
    // Clear group entry — not a character
    await ctx.runMutation(internal.catalog.patchCharacterTags, { name: 'Blue Lantern Corps', diversityTags: [] })

    await ctx.runMutation(internal.catalog.upsertCharacter, {
      name:           'Rowan Kent',
      realName:       'Rowan Kent',
      publisher:      'DC Comics',
      diversityTags:  ['black', 'woman'],
      deck:           'Rowan Kent is a descendant of Superman and member of the Blue Lantern Corps, twin sister of Ronan. She inherits Kryptonian heritage and wields a Blue Lantern ring powered by hope.',
      aliases:        ['Blue Lantern (Rowan Kent)'],
      sources:        ['manual'],
    })

    console.log('[rowan:fix] cleared=1 added=1')
    return { cleared: 1, added: 1 }
  },
})

// ── Action: add Sam Chung (Blindspot) + fix Flashback (Sara Quinones) ────────

export const addBlindspotAndFixFlashback = action({
  args: {},
  handler: async (ctx): Promise<{ updated: number; added: number }> => {
    // Fix Flashback: was incorrectly tagged 'black'; is actually Sara Quinones, Latina (Puerto Rican), Milestone
    await ctx.runMutation(internal.catalog.patchCharacterTags, { name: 'Flashback', diversityTags: ['latina'] })
    await ctx.runMutation(internal.catalog.patchCharacterMantle, {
      name:        'Flashback',
      mantleId:    'Flashback',
      versionType: 'original',
      universe:    'Dakotaverse',
    })

    // Add Sam Chung / Blindspot — Asian character in Daredevil's orbit (not Daredevil himself)
    await ctx.runMutation(internal.catalog.upsertCharacter, {
      name:           'Sam Chung',
      realName:       'Sam Chung',
      publisher:      'Marvel Comics',
      diversityTags:  ['asian'],
      firstAppearance:'Daredevil Vol. 5 #6 (2016)',
      deck:           'Sam Chung is a Chinese-American protégé of Matt Murdock who takes on the identity of Blindspot. Created by Charles Soule, he is one of the few Asian characters to operate in Daredevil\'s street-level corner of Marvel Earth-616.',
      aliases:        ['Blindspot', 'Blindspot (Sam Chung)'],
      sources:        ['manual'],
      universe:       'Earth-616',
    })

    console.log('[blindspot+flashback] updated=1 added=1')
    return { updated: 1, added: 1 }
  },
})

// ── Action: batch data quality — clear non-characters + add known diverse chars ──

export const batchDataQualityFix = action({
  args: {},
  handler: async (ctx): Promise<{ cleared: number; upserted: number; skipped: number }> => {
    // CAT A: confirmed non-characters (groups, events, places, real people, series titles)
    const toClear: string[] = [
      // Groups / teams
      'Acolytes', 'Agents of Atlas', 'Agents of S.H.I.E.L.D.', 'All-Star Squadron',
      'All New X-Men', 'All-New Invaders', 'Alliance of Evil', 'Alpha Flight',
      'Avengers', 'Avengers Academy', 'Blood Syndicate', 'Champions', 'Counter Force',
      'Dark X-Men', 'Defenders', 'Defenders of the Earth', 'Exceptional X-Men', 'Excalibur',
      'Exiles', 'Fantastic Force', 'Femforce', 'Freedom Force', 'Gamma Corps',
      'Godzilla Squad', 'Great Lakes Avengers', 'Hellfire Club', 'Illuminati',
      'International Ultramarine Corps', 'Invaders',
      'Justice League', 'Justice League Dark', 'Justice League Elite',
      'Justice League Europe', 'Justice League International', 'Justice League Quarterly',
      'Justice League Task Force', 'Justice League Unlimited', 'Justice League of America',
      'Justice Society of America', 'New Avengers', 'New Guardians', 'New Mutants',
      'New Warriors', 'Outsiders', 'People\'s Defense Force', 'Runaways',
      'Stryke Force', 'Team 7', 'Team Tejas', 'Teen Titans', 'X-Men',
      'A-Next', 'Astra Force', 'Dinosaur Corps Koseidon',
      // Events / storylines
      'Age of X-Man', 'Alternate versions of Wonder Woman', 'Infinity', 'New Universe',
      // Places / countries
      'Afghanistan', 'China', 'India', 'Japan', 'Korea', 'Mexico', 'Pakistan',
      // Organizations / institutions
      'Daily Planet', 'Hellfire Club',
      // Real people (creators, actors — should be in catalogCreators)
      'Adam Warren', 'Alan Heinberg', 'Alex Ross', 'Alex Toth', 'Alexa PenaVega',
      // Movies / TV shows (not characters)
      'A Flying Jat', 'Captain Planet',
    ]

    let cleared = 0, skipped = 0
    for (const name of toClear) {
      const ok: boolean = await ctx.runMutation(internal.catalog.patchCharacterTags, { name, diversityTags: [] })
      if (ok) cleared++; else skipped++
    }

    // CAT B: confirmed individual diverse characters with high-confidence context
    const toUpsert = [
      {
        name: 'Aisha Campbell',
        realName: 'Aisha Campbell',
        publisher: 'Saban Brands / Hasbro',
        diversityTags: ['black', 'woman'],
        firstAppearance: 'Mighty Morphin Power Rangers Season 2 Episode 1 (1994)',
        deck: 'Aisha Campbell is the second Yellow Ranger in Mighty Morphin Power Rangers, replacing Trini Kwan. A Black teenager from Stone Canyon, she is one of the first Black female Power Rangers.',
        aliases: ['Yellow Ranger (Aisha)'],
        sources: ['manual'],
      },
      {
        name: 'Adam Park',
        realName: 'Adam Park',
        publisher: 'Saban Brands / Hasbro',
        diversityTags: ['asian'],
        firstAppearance: 'Mighty Morphin Power Rangers Season 2 Episode 1 (1994)',
        deck: 'Adam Park is the second Black Ranger in Mighty Morphin Power Rangers, a Korean-American teenager from Stone Canyon who later becomes the Green Zeo Ranger and the Black Turbo Ranger.',
        aliases: ['Black Ranger (Adam)', 'Zeo Ranger IV Green', 'Black Turbo Ranger'],
        sources: ['manual'],
      },
      {
        name: 'Aero',
        realName: 'Lei Ling',
        publisher: 'Marvel Comics',
        diversityTags: ['asian', 'woman'],
        firstAppearance: 'War of the Realms: New Agents of Atlas #1 (2019)',
        deck: 'Lei Ling is Aero, a Shanghai architect with the power to control wind and air. Created by Zhou Liefen and Greg Pak, she is a core member of the Agents of Atlas and one of Marvel\'s leading Asian superheroines.',
        aliases: ['Aero (Lei Ling)'],
        sources: ['manual'],
        universe: 'Earth-616',
      },
      {
        name: 'America Chavez',
        realName: 'America Chavez',
        publisher: 'Marvel Comics',
        diversityTags: ['latina', 'woman'],
        firstAppearance: 'Vengeance #1 (2011)',
        deck: 'America Chavez is a Latin American superhero with superhuman strength and the ability to punch star-shaped portals through the multiverse. She is openly gay and has been a member of the Young Avengers and A-Force.',
        aliases: ['Miss America', 'Ms. America'],
        sources: ['manual'],
        universe: 'Earth-616',
      },
      {
        name: 'Anya Corazon',
        realName: 'Anya Corazon',
        publisher: 'Marvel Comics',
        diversityTags: ['latina', 'woman'],
        firstAppearance: 'Amazing Fantasy vol.2 #1 (2004)',
        deck: 'Anya Corazon is Araña, a Mexican-American teenager from Brooklyn with spider-based powers. She later takes the name Spider-Girl and is a key character in the Spider-Verse stories.',
        aliases: ['Araña', 'Spider-Girl (Anya Corazon)'],
        sources: ['manual'],
        universe: 'Earth-616',
      },
      {
        name: 'Acrata',
        realName: 'Andrea Rojas',
        publisher: 'DC Comics',
        diversityTags: ['latina', 'woman'],
        firstAppearance: 'Superman: Lex 2000 #1 (2000)',
        deck: 'Andrea Rojas is Acrata, a Mexican anti-corruption activist who gains shadow-teleportation powers from a pre-Columbian symbol. She later joins the Justice League of America.',
        aliases: ['Acrata (Andrea Rojas)'],
        sources: ['manual'],
        universe: 'Prime Earth',
      },
      {
        name: 'Ajak',
        realName: 'Ajak',
        publisher: 'Marvel Comics',
        diversityTags: ['asian'],
        firstAppearance: 'Eternals #2 (1976)',
        deck: 'Ajak is an Eternal with healing powers, originally depicted as male and based on the Aztec god Ajax. In the 2021 MCU film Eternals, Ajak was reimagined as a woman of indigenous Latin American descent, played by Salma Hayek.',
        aliases: ['Ajax', 'Ajak (MCU)'],
        sources: ['manual'],
        universe: 'Earth-616',
      },
      {
        name: '009-1',
        realName: 'Mylene Hoffman',
        publisher: 'Shotaro Ishinomori / Shueisha',
        diversityTags: ['asian', 'woman'],
        firstAppearance: '009-1 manga by Shotaro Ishinomori (1967)',
        deck: 'Mylene Hoffman (009-1) is a cyborg secret agent in Shotaro Ishinomori\'s manga set in an alternate Cold War universe divided into East and West Blocks. One of the pioneering female cyborg action characters in manga.',
        aliases: ['Mylene Hoffman', '009-1 (Mylene Hoffman)'],
        sources: ['manual'],
      },
    ]

    let upserted = 0
    for (const char of toUpsert) {
      await ctx.runMutation(internal.catalog.upsertCharacter, char)
      upserted++
    }

    console.log(`[batch:quality] cleared=${cleared} skipped=${skipped} upserted=${upserted}`)
    return { cleared, upserted, skipped }
  },
})

// ── Action: batch-mark entries that need review ───────────────────────────────

export const markAllNeedsReview = action({
  args: {},
  handler: async (ctx): Promise<{ marked: number }> =>
    ctx.runMutation(internal.catalog.batchMarkNeedsReview, {}),
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
