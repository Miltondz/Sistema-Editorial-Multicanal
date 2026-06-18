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

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "title": "exact title of the work or person",
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
  "buyLink": "official purchase or info URL if known, otherwise empty string",
  "evergreenClass": "high if the content remains relevant indefinitely (classic works, iconic characters), medium if seasonally or cyclically relevant, low if tied to a specific news moment",
  "editorialPriority": 3,
  "confidence": 0.0
}

confidence: float 0.0–1.0 reflecting how certain you are about the details. Use 0.9+ only if you are very familiar with the title. Use 0.5 if you are inferring from partial info.`

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

    if (args.channel === 'tumblr') {
      userMessage = `Write a Tumblr post for SuperheroesInColor promoting the following content. The audience is passionate comics fans who care deeply about representation.

CONTENT DETAILS:
Title: ${item.title}
Type: ${item.contentType}
${franchise}
${publisher}
Description: ${description}
Creators: ${creatorsText}
Representation: ${reprTags}
Themes: ${themeTags}
Link: ${link}

WRITING GUIDELINES:
- Tone: enthusiastic, curatorial, warm — like a knowledgeable friend recommending something they love
- Lead with WHY this matters: what specific identities are centered, what perspective the creators bring
- Name the creators' backgrounds when known (e.g., "written by Afro-Colombian writer…") — specificity honors their work
- Do NOT use the word "diverse" or "diversity" — be specific about the actual identities
- Do NOT use "minority" — say "underrepresented", "marginalized", or name the identity directly
- Do NOT be preachy or frame it as activism — celebrate the art and the storytelling
- If characters have notable representation, describe them specifically
- Keep it celebratory, not corrective

Return ONLY this JSON (no markdown, no extra text):
{
  "headline": "Attention-grabbing headline, max 100 characters, no clickbait",
  "bodyText": "Editorial post body, 200–350 words. 3–4 paragraphs. First paragraph hooks with the core representation angle. Second/third paragraphs describe the story, art, or subject. Final paragraph is personal recommendation or why now.",
  "ctaText": "Short call-to-action, 1–2 sentences${link ? '. Include the link: ' + link : ''}"
}`
    } else {
      userMessage = `Write a post for X (Twitter) for SuperheroesInColor promoting the following content.

CONTENT DETAILS:
Title: ${item.title}
Type: ${item.contentType}
${franchise}
Creators: ${creatorsText}
Representation: ${reprTags}
Link: ${link}

WRITING GUIDELINES:
- Tone: direct, punchy, curatorial — like a trusted recommendation in a feed
- Lead with the most compelling representation angle in the first line
- Be specific about identities: name the actual representation (e.g., "Black queer protagonist", "written by a Latinx woman"), not "diverse"
- Do NOT use "diverse", "diversity", "minority", or preachy framing
- No hashtag spam — max 2–3 relevant hashtags if they genuinely add value
- The post must fit X's character limits (bodyText + ctaText combined must be under 275 characters to leave room for the link)

Return ONLY this JSON (no markdown, no extra text):
{
  "headline": "First line / hook, max 60 characters",
  "bodyText": "Post body, max 200 characters. Punchy, specific, celebratory.",
  "ctaText": "${link ? 'Short CTA with the link: ' + link : 'Short CTA, no link available'}"
}`
    }

    let rawText: string
    try {
      rawText = await complete(SYSTEM_PROMPT_BASE, userMessage, 1200)
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
