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
      userMessage = `Write a Tumblr post for SuperheroesInColor.com. Match the exact format used on the blog.

CONTENT DETAILS:
Title: ${item.title}
Type: ${item.contentType}
Year: ${yearHint || 'unknown'}
${franchise}
${publisher}
Description: ${description}
Creators: ${creatorsText}
Representation: ${reprTags}
Themes: ${themeTags}
Buy link: ${link || 'none'}

═══ OUTPUT FORMAT ═══

headline (plain text, no HTML):
Format by type:
- Comic/manga: "Series Title Vol.N #Issue (Year) // Publisher" — e.g., "Hardware: Season One #4 (2022) // DC Comics"
- Book/novel: "Title (Year)" — e.g., "Shook! A Black Horror Anthology (2024)"
- Film/TV: "Title (Year)" — e.g., "The Eternaut (2025)"
- Character/actor: "Character / Show or Comic (Year)" — e.g., "White Tiger / Daredevil: Born Again (2025)"
- Cosplay: "Character Name #Cosplay by Cosplayer Name"

bodyText (HTML — NO <h2>, NO footer links — those are added automatically):
Structure:
1. <p><i>One-sentence hook or logline in italics</i></p>
2. 2–3 <p> paragraphs: story/content description, creator backgrounds, why it matters to the community
3. If buy link exists: <p>Get it <a href="${link || '#'}">here</a></p> (for books) or <p>Get the comic <a href="${link || '#'}">here</a></p> (for comics)
4. If creators have notable awards/credits, mention them in a <p> paragraph
HTML rules:
- Use <b> for creator names on first mention
- Use <i> for titles of referenced works
- Use <a href="url">text</a> for buy links only
- NO <h2>, NO <h3>, NO <img>, NO footer links, NO hashtags in body
- Tone: enthusiastic, curatorial — like a knowledgeable friend recommending something they love
- Do NOT use "diverse", "diversity", or "minority" — name the actual identities
- 3–5 paragraphs total, punchy not academic

ctaText (comma-separated tags — NO # prefix):
Include: character names, creator last names, publisher/studio, identity terms, title keywords, franchise, any notable awards
8–15 tags, most specific first. Example: "Hardware, Brandon Thomas, Denys Cowan, black superheroes, milestone media, dc comics, dakotaverse"

Return ONLY this JSON (no markdown, no extra text):
{
  "headline": "...",
  "bodyText": "<p><i>...</i></p><p>...</p>",
  "ctaText": "tag1, tag2, tag3"
}`
    } else {
      userMessage = `Write a post for X (Twitter) for SuperheroesInColor promoting the following content.

CONTENT DETAILS:
Title: ${item.title}
Type: ${item.contentType}
Year: ${yearHint || 'unknown'}
${franchise}
${publisher}
Creators: ${creatorsText}
Representation: ${reprTags}
Buy link: ${link || 'none'}

RULES:
- bodyText max 200 characters — plain text only, no HTML, no hashtags in body
- ctaText = the buy/info link (plain URL) if available, otherwise 1-sentence CTA under 50 chars
- bodyText + ctaText combined must be under 275 characters
- Lead with the most specific representation angle: "Black queer protagonist", "written by a Latinx woman" — never "diverse"
- Do NOT use "diverse", "diversity", "minority", or activist framing
- Tone: direct, punchy, celebratory — a trusted recommendation in a scroll

Return ONLY this JSON (no markdown, no extra text):
{
  "headline": "First line hook, max 60 characters, plain text",
  "bodyText": "Post body, max 200 characters, plain text, no hashtags",
  "ctaText": "${link ? link : 'Short CTA, no link'}"
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
    const bodyText = String(parsed.bodyText ?? '')
    const ctaText  = String(parsed.ctaText  ?? '')

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
