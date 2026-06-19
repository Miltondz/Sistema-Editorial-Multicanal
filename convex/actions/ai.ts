"use node";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { complete, parseJsonSafe, SYSTEM_PROMPT_BASE } from '../../lib/integrations/openrouter'
import { computeCanonicalHash } from '../../lib/utils/hash'

const channelV = v.union(v.literal('tumblr'), v.literal('x'))

const contentTypeV = v.union(
  v.literal('comic'), v.literal('libro'), v.literal('autor'),
  v.literal('cosplay'), v.literal('articulo'), v.literal('poster'),
  v.literal('pelicula'), v.literal('personaje'), v.literal('coleccion')
)

// ── researchContent ──────────────────────────────────────────────────────────

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
    const typeHint = args.contentType ? `The content type is: ${args.contentType}.` : 'Infer the content type from the input.'

    const userMessage = `Create an editorial catalog entry for SuperheroesInColor based on the following input:

INPUT: "${args.input}"

${typeHint}

TITLE FORMAT RULES:
- Comics/manga: "Title Vol.N #Issue (Year)" — e.g., "Hardware: Season One #4 (2022)" or "Miles Morales: Spider-Man #1 (2019)"
- If only series title known (no issue): "Title (Year)" — e.g., "Black Panther (2016)"
- Books/novels: "Title (Year)" — include series name in parentheses if part of a series: "2043... (A Merman I Should Turn to Be) (Black Stars)"
- Film/TV: "Title (Year)" — e.g., "The Eternaut (2025)"
- Cosplay: "Character Name #Cosplay by Cosplayer Name"
- Use the EXACT title as published. Check against League of Comic Geeks (leagueofcomicgeeks.com), Marvel Database (marvel.fandom.com), DC Database (dc.fandom.com), or publisher sites for accuracy.

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "title": "formatted title following the rules above",
  "contentType": "one of: comic, libro, autor, cosplay, articulo, poster, pelicula, personaje, coleccion",
  "summary": "2-3 sentence editorial summary. Be specific about who is represented (race, ethnicity, gender, nationality of characters/creators when known). Do not use the word 'diverse' — name the actual identity.",
  "franchise": "parent franchise or universe if applicable, otherwise empty string",
  "publisher": "publisher or studio name, otherwise empty string",
  "characters": ["array of main character names featured"],
  "creators": [
    { "role": "one of: writer, artist, cover_artist, colorist, photographer, other", "name": "full name" }
  ],
  "representationTags": ["specific identity tags — e.g. Black, Latina, Indigenous, queer, trans, Asian-American, Afro-Latino. Max 8. Only include what is known or clearly evident."],
  "themeTags": ["thematic tags — e.g. identity, legacy, family, resistance, afrofuturism, mythology, coming-of-age. Max 6."],
  "buyLink": "official purchase or info URL if known (Amazon, comixology, publisher store), otherwise empty string",
  "evergreenClass": "high if the content remains relevant indefinitely (classic works, iconic characters), medium if seasonally or cyclically relevant, low if tied to a specific news moment",
  "editorialPriority": 3,
  "confidence": 0.0
}

confidence: float 0.0–1.0. Use 0.9+ only if you are certain about the details (familiar title, verified creators). Use 0.5 if inferring from partial info. Use 0.3 if mostly guessing.`

    let rawText: string
    try {
      rawText = await complete(SYSTEM_PROMPT_BASE, userMessage, 2000)
    } catch (err) {
      throw new Error(`Error calling OpenRouter: ${err instanceof Error ? err.message : String(err)}`)
    }

    let parsed: any
    try {
      parsed = parseJsonSafe<any>(rawText)
    } catch {
      throw new Error(`AI returned non-JSON response: ${rawText.slice(0, 200)}`)
    }

    const { confidence, ...proposedItem } = parsed

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
      sourcesUsed: [],
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

    const creatorsText = item.creators?.length
      ? item.creators.map((c: any) => `${c.name} (${c.role})`).join(', ')
      : 'unknown'

    const reprTags = item.representationTags?.join(', ') || 'not specified'
    const themeTags = item.themeTags?.join(', ') || ''
    const description = item.longDescription ?? item.summary ?? ''
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
Description: ${description}
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
  1. <p><i>One-sentence logline or hook in italics — specific, no vague superlatives</i></p>
  2. <p>1–2 sentences: story/premise OR specific representation angle — concrete, names identities directly</p>
  3. <p>Creator paragraph: name the writer and artist by <b>Name</b>, their nationality or background if known, 1–2 notable other works or awards. If buy link: end this paragraph or add a buy line: <p>Get it <a href="${link || '#'}">here</a></p></p>
  If no buy link, paragraph 3 is still the creator paragraph.

CREATOR RESEARCH — use your training knowledge:
  - If "Creators listed" above contains names, expand on those specific people: their nationality, background, notable other works, awards (Eisner, Harvey, Ringo, Hugo, GLYPH, etc.) if you know them.
  - If creators are unknown from the input, attempt to identify the writer/artist for this specific title from your knowledge — name them only if you are CONFIDENT. If uncertain, omit rather than guess.
  - DO NOT invent credits, awards, or biographical facts you are not confident about.

HTML rules:
- <b> for creator names on first mention
- <i> for referenced work titles
- <a href="url"> for buy links only
- NO <h2>, NO <img>, NO footer links, NO hashtags in body
- Tone: curatorial, warm, knowledgeable — NOT activist-lecture, NOT preachy

BANNED PHRASES (do not use, in any form):
must-read, a must, instant classic, essential reading, you need to read, perfect for fans of, don't miss, highly recommended, stunning, groundbreaking, amazing, incredible (without specific evidence), powerful story (without explaining why), diverse, diversity, minority

DO NOT use more than 3 <p> blocks. Trim ruthlessly — 1–2 tight paragraphs with real info beats 3 with filler.

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
Creators: ${creatorsText}
Representation: ${reprTags}

RULES:
headline — same title format as Tumblr:
  Comic: "Series Title #Issue (Year)"  e.g. "Hardware: Season One #4 (2022)"
  Book: "Title (Year)"
  Film/TV: "Title (Year)"

bodyText — 1 sentence ONLY, max 150 chars, plain text:
  - Most specific representation angle first: "Black queer protagonist", "written by a Puerto Rican author"
  - Do NOT use: diverse, diversity, minority, must-read, amazing, incredible, stunning
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
