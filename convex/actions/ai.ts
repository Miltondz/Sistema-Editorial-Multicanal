"use node";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { complete, parseJsonSafe, SYSTEM_PROMPT_BASE } from '../../lib/integrations/openrouter'
import { computeCanonicalHash } from '../../lib/utils/hash'
import { enrichFromComicVine, getVolume, cvRoleToCreatorRole } from '../../lib/integrations/comicvine'

const channelV = v.union(v.literal('tumblr'), v.literal('x'))

const contentTypeV = v.union(
  v.literal('comic'), v.literal('libro'), v.literal('autor'),
  v.literal('cosplay'), v.literal('articulo'), v.literal('poster'),
  v.literal('pelicula'), v.literal('personaje'), v.literal('coleccion')
)

// ── researchContent ──────────────────────────────────────────────────────────

const RESEARCH_PERPLEXITY_MODEL = 'perplexity/sonar' as const
const RESEARCH_FALLBACK_MODEL   = 'openai/gpt-4o-search-preview' as const
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const RESEARCH_SYSTEM_PROMPT = `You are a comics research engine with active web search access for SuperheroesInColor.com.

Your job: given a title, URL, or description, search the web and return a complete editorial catalog entry as strict JSON.

SEARCH SOURCES — check these in order:
- leagueofcomicgeeks.com — issue metadata, creators, release dates
- marvel.fandom.com / dc.fandom.com — character info, first appearances, creators
- comicvine.gamespot.com — comprehensive issue/series/creator database
- comics.org (Grand Comics Database) — publication records, creator credits
- Official publisher sites: marvel.com, dc.com, imagecomics.com, darkhorse.com, boom-studios.com
- Amazon, comixology, tfaw.com — buy links, ISBN, release info
- lambiek.net — international creator bios
- Wikipedia — general background on series, adaptations, awards

RULES:
- Search actively — do not rely only on training data
- Use the exact published title, issue number, and year from official sources
- For creators: name writer AND interior artist specifically; include colorist if notable
- For identity tags: name specific identities (Black, Latina, queer, trans) — never use "diverse" or "minority"
- Return ONLY valid JSON. No markdown, no prose, no explanations outside the JSON.
`.trim()

function buildResearchPrompt(input: string, contentType?: string): string {
  const typeHint = contentType
    ? `Content type is: ${contentType}.`
    : 'Infer the content type from the input (comic, libro, autor, cosplay, articulo, poster, pelicula, personaje, coleccion).'

  return `Research and build a complete catalog entry for this content:

INPUT: "${input}"
${typeHint}

TITLE FORMAT RULES:
- Comic/manga: "Series Title Vol.N #Issue (Year)" — e.g., "Hardware: Season One #4 (2022)"
- Series only (no specific issue): "Title (Year)" — e.g., "Black Panther (2016)"
- Book/novel: "Title (Year)" — e.g., "Shook! A Black Horror Anthology (2024)"
- Film/TV: "Title (Year)" — e.g., "The Eternaut (2025)"
- Cosplay: "Character Name #Cosplay by Cosplayer Name"
- Use the EXACT title as published — verify against publisher site or League of Comic Geeks.

Return ONLY this JSON object (no markdown, no extra text):
{
  "title": "<exact formatted title>",
  "contentType": "<comic|libro|autor|cosplay|articulo|poster|pelicula|personaje|coleccion>",
  "summary": "<2–3 sentences: story premise and who is represented — race, ethnicity, gender, nationality of characters/creators. Be specific. Never use 'diverse'.>",
  "franchise": "<parent universe or franchise, e.g. 'DC Universe', 'Marvel 616', or empty string>",
  "publisher": "<publisher or studio name, e.g. 'DC Comics', 'Marvel', 'Image Comics', or empty string>",
  "characters": ["<main character name>"],
  "creators": [
    { "role": "<writer|artist|cover_artist|colorist|photographer|other>", "name": "<full name>" }
  ],
  "representationTags": ["<identity tags — e.g.: Black, Latina, Indigenous, queer, trans, Asian-American, Afro-Latino, bisexual, disabled. Max 8. Only confirmed identities.>"],
  "themeTags": ["<thematic tags — e.g.: identity, legacy, family, resistance, afrofuturism, mythology, coming-of-age. Max 6.>"],
  "buyLink": "<official purchase URL — Amazon, Comixology, publisher store. Empty string if not found.>",
  "evergreenClass": "<high|medium|low — high: classic/iconic works; medium: seasonal/cyclical; low: tied to a news moment>",
  "editorialPriority": 3,
  "confidence": <0.0–1.0 — 0.9+ if verified from official source; 0.6 if inferred from reliable reference; 0.3 if mostly guessing>,
  "sourcesUsed": ["<URL 1 you retrieved>", "<URL 2 you retrieved>"]
}`.trim()
}

async function callResearchModel(
  model: string,
  input: string,
  contentType: string | undefined,
  label: string
): Promise<{ parsed: any; sourcesUsed: string[] } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
      'X-Title': 'SuperheroesInColor CMS',
    },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
        { role: 'user',   content: buildResearchPrompt(input, contentType) },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter [${label}] ${response.status}: ${err}`)
  }

  const data = await response.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''
  console.log(`[researchContent:${label}] finish_reason:`, data.choices?.[0]?.finish_reason)
  console.log(`[researchContent:${label}] raw length:`, raw.length)

  if (!raw.trim()) return null

  // Strip markdown fences + extract JSON object
  let jsonStr = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const objStart = jsonStr.indexOf('{')
  const objEnd   = jsonStr.lastIndexOf('}')
  if (objStart !== -1 && objEnd !== -1) jsonStr = jsonStr.slice(objStart, objEnd + 1)

  let parsed: any
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error(`[researchContent:${label}] JSON parse failed:`, jsonStr.slice(0, 500))
    return null
  }

  const sourcesUsed: string[] = Array.isArray(parsed.sourcesUsed)
    ? parsed.sourcesUsed.filter((s: unknown) => typeof s === 'string')
    : []

  return { parsed, sourcesUsed }
}

export const researchContent = action({
  args: {
    input: v.string(),
    contentType: v.optional(contentTypeV),
  },
  handler: async (ctx, args): Promise<{
    proposedItem: Record<string, unknown>
    confidence: number
    possibleDuplicates: Array<{ id: string; title: string; similarity: number }>
    sourcesUsed: string[]
  }> => {
    // Try Perplexity sonar first (web search), fall back to gpt-4o-search
    let result = await callResearchModel(RESEARCH_PERPLEXITY_MODEL, args.input, args.contentType, 'perplexity')
    if (!result) {
      console.log('[researchContent] perplexity empty — gpt-4o-search fallback')
      result = await callResearchModel(RESEARCH_FALLBACK_MODEL, args.input, args.contentType, 'gpt4o-search')
    }
    if (!result) throw new Error('Ambos modelos retornaron vacío')

    const { parsed, sourcesUsed } = result
    const { confidence, sourcesUsed: _s, ...proposedItem } = parsed

    // CV enrichment — only for relevant content types, best-effort, never throws
    const CV_TYPES = new Set(['comic', 'personaje', 'autor', 'libro'])
    try {
      if (proposedItem.title && args.contentType && CV_TYPES.has(args.contentType)) {
        const cv = await enrichFromComicVine(
          proposedItem.title as string,
          proposedItem.publisher as string | undefined,
          args.contentType,
        )
        if (cv) {
          proposedItem.cvId  = cv.cvId
          proposedItem.cvUrl = cv.cvUrl
          if (!proposedItem.coverImageUrl && cv.coverImageUrl) {
            proposedItem.coverImageUrl = cv.coverImageUrl
          }
          // Use CV creators only when AI didn't return any
          if (!(proposedItem.creators as any[])?.length && cv.creators?.length) {
            proposedItem.creators = cv.creators
          }
          sourcesUsed.push('comicvine.gamespot.com')
        }
      }
    } catch (cvErr) {
      console.log('[researchContent:cv]', cvErr instanceof Error ? cvErr.message : String(cvErr))
    }

    const possibleDuplicates: Array<{ id: string; title: string; similarity: number }> = []
    if (proposedItem.title) {
      const hash = await computeCanonicalHash({ title: proposedItem.title })
      const existing = await ctx.runQuery(internal.contentItems.findByHashInternal, {
        canonicalHash: hash,
      }) as any | null
      if (existing) {
        possibleDuplicates.push({ id: existing._id, title: existing.title, similarity: 1.0 })
      }
    }

    return {
      proposedItem: proposedItem as Record<string, unknown>,
      confidence: typeof confidence === 'number' ? confidence : 0,
      possibleDuplicates,
      sourcesUsed,
    }
  },
})

// ── generateVariant ──────────────────────────────────────────────────────────

export const generateVariant = action({
  args: {
    contentItemId: v.id('contentItems'),
    channel: channelV,
  },
  handler: async (ctx, args): Promise<{
    headline: string
    bodyText: string
    ctaText: string
    modelUsed: string
  }> => {
    const item = await ctx.runQuery(internal.contentItems.getByIdInternal, {
      id: args.contentItemId,
    }) as any | null
    if (!item) throw new Error('Item not found')

    // Pull CV data: creators + description/deck for source material
    let cvCreators: Array<{ name: string; role: string }> = []
    let cvDescription = ''
    if (item.cvId && item.contentType === 'comic') {
      try {
        const vol = await getVolume(item.cvId as number)
        if (!item.creators?.length && vol.person_credits?.length) {
          cvCreators = vol.person_credits.map((pc: any) => ({
            name: pc.name,
            role: cvRoleToCreatorRole(pc.role),
          }))
        }
        // Use CV deck/description as source when item has no description
        const raw = vol.description || vol.deck || ''
        if (raw) {
          // Strip HTML tags for clean plain text
          cvDescription = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600)
        }
      } catch {}
    }

    const creatorsSource: Array<{ name: string; role: string }> = item.creators?.length
      ? item.creators
      : cvCreators

    // Fetch Wikipedia summaries for each creator in parallel (verified bios only)
    const wikiSummaries: Record<string, string> = {}
    if (creatorsSource.length) {
      await Promise.all(
        creatorsSource
          .filter(c => c.role === 'writer' || c.role === 'artist' || c.role === 'cover_artist')
          .slice(0, 4)
          .map(async c => {
            try {
              const res = await fetch(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(c.name)}`,
                { headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)' } }
              )
              if (res.ok) {
                const data = await res.json() as { extract?: string; type?: string }
                if (data.type !== 'disambiguation' && data.extract) {
                  wikiSummaries[c.name] = data.extract.split('. ').slice(0, 2).join('. ') + '.'
                }
              }
            } catch {}
          })
      )
    }

    const creatorsText = creatorsSource.length
      ? creatorsSource.map((c: any) => {
          const bio = wikiSummaries[c.name]
          return bio ? `${c.name} (${c.role}): ${bio}` : `${c.name} (${c.role})`
        }).join('\n')
        + (cvCreators.length && !item.creators?.length ? '\n[source: Comic Vine]' : '')
      : 'none — omit creator paragraph'

    const reprTags = item.representationTags?.join(', ') || 'not specified'
    const themeTags = item.themeTags?.join(', ') || ''
    const itemDesc = item.longDescription ?? item.summary ?? ''
    const description = itemDesc || cvDescription
    const descSource = !itemDesc && cvDescription ? ' [source: Comic Vine]' : ''
    const franchise = item.franchise ? `Franchise/Universe: ${item.franchise}` : ''
    const publisher = item.publisher ? `Publisher: ${item.publisher}` : ''
    const link = item.buyLink ?? ''

    let userMessage: string

    const yearHint = item.sourceDate ? String(new Date(item.sourceDate).getFullYear()) : ''

    if (args.channel === 'tumblr') {
      userMessage = `Write a Tumblr post for SuperheroesInColor.com. Audience: passionate comics fans who know the medium.

CONTENT DETAILS:
Title: ${item.title}
Type: ${item.contentType}
Year: ${yearHint || 'unknown'}
${franchise}
${publisher}
Description${descSource}: ${description || 'none provided — use title, tags, and characters only; do NOT invent plot details'}
Creators listed: ${creatorsText}
Representation: ${reprTags}
Themes: ${themeTags}
Buy link: ${link || 'none'}

═══ HEADLINE (plain text, no HTML) ═══
Format by type:
- Comic/manga: "Series Title Vol.N #Issue (Year) // Publisher" — e.g., "Hardware: Season One #4 (2022) // DC Comics"
- Book/novel: "Title (Year)" — e.g., "Shook! A Black Horror Anthology (2024)"
- Film/TV: "Title (Year)" — e.g., "The Eternaut (2025)"
- Character/actor: "Character / Show or Comic (Year)"
- Cosplay: "Character Name #Cosplay by Cosplayer Name"

═══ BODY TEXT (HTML — STRICT RULES) ═══
Structure: MAX 3 <p> blocks total. No exceptions.
  1. <p><i>One-sentence hook in italics — must be a specific plot beat, creative choice, or concrete fact from the Description. NOT a restatement of the title. NOT a generic "this issue explores X".</i></p>
  2. ONLY include if the Description field contains specific plot details, concrete events, or named supporting characters to reference. If Description is empty, vague, or only restates the title/character name, SKIP this paragraph entirely. When included: 1–2 sentences using only facts stated in the Description. DO NOT mention creators here — they belong only in paragraph 3. DO NOT summarize who the main character is — the reader already knows from the title.
  3. <p>Creator paragraph: use ONLY the "Creators listed" data below. Names, roles, and any bio text are pre-verified. Use <b>Name</b> on first mention. If buy link provided, end with <a href="${link || '#'}">here</a>.</p>
  If "Creators listed" says "none — omit creator paragraph", skip paragraph 3 entirely.

SPECIFICITY RULE: Every sentence must contain at least one concrete noun (character name, place, event, issue number, award, publisher imprint). A sentence that could apply to any other comic about the same character is worthless — delete it.

CREATOR RULES — STRICT:
  - ONLY use creator names and bio text from "Creators listed" below. DO NOT add, infer, or invent any creator name, role, award, other work, or biographical fact from your training knowledge.
  - Bio text in "Creators listed" is from Wikipedia — quote or paraphrase only that text. No additions.
  - If a creator has no bio text provided, mention name + role only. Nothing else.
  - NEVER research or guess creator credits. If not in "Creators listed", it does not exist for this post.

HTML rules:
- <b> for creator names on first mention
- <i> for referenced work titles
- <a href="url"> for buy links only
- NO <h2>, NO <img>, NO footer links, NO hashtags in body
- Tone: curatorial, warm, knowledgeable — NOT activist-lecture, NOT preachy

BANNED PHRASES (do not use, in any form):
must-read, a must, instant classic, essential reading, you need to read, perfect for fans of, don't miss, highly recommended, stunning, groundbreaking, amazing, incredible (without specific evidence), powerful story (without explaining why), diverse, diversity, minority, explores themes, delves into themes, grapples with, navigates, ongoing journey, showcasing themes, examines themes, what it means to be, the Black superhero experience, the Black experience, creators are unknown, creators are not listed

DO NOT use more than 3 <p> blocks. 1–2 paragraphs with real specifics beats 3 with filler.
NEVER write a paragraph to fill space. If you have nothing specific to say, write nothing.

═══ CTATEXT (Tumblr tags) ═══
Comma-separated tag names (NO # prefix). Include: character names, creator surnames, publisher, identity terms, title keywords, franchise, awards if applicable. 8–15 tags, most specific first.
Example: "Hardware, Brandon Thomas, Denys Cowan, black superheroes, milestone media, dc comics, dakotaverse"

Return ONLY this JSON (no markdown, no extra text):
{
  "headline": "...",
  "bodyText": "<p><i>...</i></p><p>...</p>",
  "ctaText": "tag1, tag2, tag3"
}`
    } else {
      // X / Twitter — mirrors Tumblr headline format but compressed
      userMessage = `Write a post for X (Twitter) for SuperheroesInColor. Audience: comics fans on a scroll.

CONTENT DETAILS:
Title: ${item.title}
Type: ${item.contentType}
Year: ${yearHint || 'unknown'}
${franchise}
${publisher}
Description${descSource}: ${description || 'none'}
Creators: ${creatorsText}
Representation: ${reprTags}

RULES:
headline — same title format as Tumblr:
  Comic: "Series Title #Issue (Year)"  e.g. "Hardware: Season One #4 (2022)"
  Book: "Title (Year)"
  Film/TV: "Title (Year)"

bodyText — 1 sentence ONLY, max 150 chars, plain text:
  - Lead with the story hook, creative angle, or what makes this stand out (premise, genre, award, art style)
  - If "Creators:" above has names, you may include "written by [Name]" or "art by [Name]" — use ONLY names listed there, no bios
  - Do NOT name or label any character's or creator's race, ethnicity, gender, or identity — let the story speak
  - Do NOT use: diverse, diversity, minority, must-read, amazing, incredible, stunning, creators unknown
  - No hashtags, no links, no HTML

ctaText — ALWAYS return the exact string: "linktr.ee/HeroesInColor"
  (Do not use the buy link. Always use linktr.ee/HeroesInColor.)

Return ONLY this JSON (no markdown, no extra text):
{
  "headline": "Title (Year) — plain text",
  "bodyText": "1 sentence, max 150 chars, plain text",
  "ctaText": "linktr.ee/HeroesInColor"
}`
    }

    let rawText: string
    try {
      rawText = await complete(SYSTEM_PROMPT_BASE, userMessage, args.channel === 'tumblr' ? 1800 : 800)
    } catch (err) {
      throw new Error(`Error calling OpenRouter: ${err instanceof Error ? err.message : String(err)}`)
    }

    let parsed: any
    try {
      parsed = parseJsonSafe<any>(rawText)
    } catch {
      throw new Error(`AI returned non-JSON response: ${rawText.slice(0, 200)}`)
    }

    const headline = String(parsed.headline ?? '')
    let bodyText   = String(parsed.bodyText ?? '')
    let ctaText    = String(parsed.ctaText  ?? '')

    if (args.channel === 'tumblr') {
      // Enforce max 3 <p> blocks — model may ignore the prompt cap
      const pBlocks = bodyText.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []
      if (pBlocks.length > 3) {
        bodyText = pBlocks.slice(0, 3).join('\n')
      }
    }

    if (args.channel === 'x') {
      // Hard-set regardless of what model returned
      ctaText = 'linktr.ee/HeroesInColor'
      // Strip any stray HTML from X bodyText
      bodyText = bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      // Enforce 150 char cap on bodyText
      if (bodyText.length > 150) {
        bodyText = bodyText.slice(0, 147) + '...'
      }
    }

    await ctx.runMutation(internal.contentVariants.applyGeneration, {
      contentItemId: args.contentItemId,
      channel: args.channel,
      headline,
      bodyText,
      ctaText,
    })

    return {
      headline, bodyText, ctaText,
      modelUsed: process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash-lite',
    }
  },
})

// ── extractFromHistoric ───────────────────────────────────────────────────────

export const extractFromHistoric = action({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args): Promise<{
    title: string
    contentType: string
    summary: string
    franchise: string
    publisher: string
    characters: string[]
    creators: Array<{ role: string; name: string }>
    representationTags: string[]
    themeTags: string[]
    buyLink: string
    confidence: number
  }> => {
    const item = await ctx.runQuery(internal.contentItems.getByIdInternal, {
      id: args.contentItemId,
    }) as any | null
    if (!item) throw new Error('Item not found')
    if (item.contentOrigin !== 'imported') throw new Error('extractFromHistoric only available for imported items')

    const rawText = [item.longDescription, item.summary].filter(Boolean).join('\n\n')
    if (!rawText.trim()) throw new Error('Item has no source text to extract from')

    const userMessage = `Extract structured catalog metadata from this historical blog post text.
The blog is SuperheroesInColor — it covers racial, ethnic, and cultural diversity in comics and pop culture.

SOURCE TEXT:
"""
${rawText.slice(0, 6000)}
"""

RULES:
- Extract only what is actually present in the text. Do not invent.
- title: clean formatted title. Comics: "Series #Issue (Year)". Books/films: "Title (Year)". Cosplay: "Character #Cosplay by Name".
- contentType: one of comic / libro / autor / cosplay / articulo / poster / pelicula / personaje / coleccion
- summary: 2-3 clean editorial sentences (English). Name actual identities — do not use the word "diverse".
- franchise: parent universe or series (e.g. "X-Men", "Black Panther"). Empty string if none.
- publisher: publisher name (Marvel, DC, Image, etc.). Empty string if unknown.
- characters: array of character names explicitly mentioned.
- creators: array of {role, name}. role = one of writer / artist / cover_artist / colorist / photographer / other.
- representationTags: specific identity tags (Black, Latina, queer, trans, Indigenous, etc.). Max 8. Lowercase.
- themeTags: thematic tags (identity, legacy, afrofuturism, etc.). Max 6. Lowercase.
- buyLink: any purchase/store URL found in the text. Empty string if none.
- confidence: 0.0–1.0. How confident you are in the extraction given the available text.

Return ONLY valid JSON, no markdown:
{
  "title": "",
  "contentType": "",
  "summary": "",
  "franchise": "",
  "publisher": "",
  "characters": [],
  "creators": [],
  "representationTags": [],
  "themeTags": [],
  "buyLink": "",
  "confidence": 0.0
}`

    let rawResponse: string
    try {
      rawResponse = await complete(SYSTEM_PROMPT_BASE, userMessage, 1200)
    } catch (err) {
      throw new Error(`OpenRouter error: ${err instanceof Error ? err.message : String(err)}`)
    }

    let parsed: any
    try {
      parsed = parseJsonSafe<any>(rawResponse)
    } catch {
      throw new Error(`AI returned non-JSON: ${rawResponse.slice(0, 200)}`)
    }

    return {
      title:              String(parsed.title              ?? ''),
      contentType:        String(parsed.contentType        ?? ''),
      summary:            String(parsed.summary            ?? ''),
      franchise:          String(parsed.franchise          ?? ''),
      publisher:          String(parsed.publisher          ?? ''),
      characters:         Array.isArray(parsed.characters)         ? parsed.characters         : [],
      creators:           Array.isArray(parsed.creators)           ? parsed.creators           : [],
      representationTags: Array.isArray(parsed.representationTags) ? parsed.representationTags : [],
      themeTags:          Array.isArray(parsed.themeTags)          ? parsed.themeTags          : [],
      buyLink:            String(parsed.buyLink            ?? ''),
      confidence:         typeof parsed.confidence === 'number'    ? parsed.confidence         : 0,
    }
  },
})

// ── suggestTags ──────────────────────────────────────────────────────────────

export const suggestTags = action({
  args: { text: v.string() },
  handler: async (_ctx, args): Promise<{
    representationTags: string[]
    themeTags: string[]
  }> => {
    const userMessage = `Analyze the following text and suggest catalog tags for SuperheroesInColor.

TEXT: "${args.text}"

TAGGING RULES:
- representationTags: specific identities represented in the content. Use precise terms: racial/ethnic identity (Black, Afro-Latino, Indigenous, East Asian, South Asian, Middle Eastern, Latinx, etc.), gender identity (woman, non-binary, trans woman, trans man, etc.), sexual orientation (gay, lesbian, bisexual, queer, etc.), disability, nationality when relevant. DO NOT use "diverse", "minority", or generic terms. Only tag what is clearly present or strongly implied in the text.
- themeTags: narrative and editorial themes relevant to the catalog. Examples: afrofuturism, mythology, legacy, identity, resistance, coming-of-age, family, community, diaspora, colonialism, empowerment, intersectionality, visibility, representation in media.
- Max 8 representationTags, max 6 themeTags.
- Lowercase, hyphenated for multi-word tags (e.g., "south-asian", "coming-of-age").
- If uncertain about an identity, omit it rather than guess.

Return ONLY this JSON (no markdown, no extra text):
{
  "representationTags": [],
  "themeTags": []
}`

    let rawText: string
    try {
      rawText = await complete(SYSTEM_PROMPT_BASE, userMessage, 600)
    } catch (err) {
      throw new Error(`Error calling OpenRouter: ${err instanceof Error ? err.message : String(err)}`)
    }

    let parsed: any
    try {
      parsed = parseJsonSafe<any>(rawText)
    } catch {
      return { representationTags: [], themeTags: [] }
    }

    return {
      representationTags: Array.isArray(parsed.representationTags) ? parsed.representationTags : [],
      themeTags: Array.isArray(parsed.themeTags) ? parsed.themeTags : [],
    }
  },
})
