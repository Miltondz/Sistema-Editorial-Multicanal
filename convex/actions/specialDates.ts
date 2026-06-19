"use node";

import { action } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { v } from 'convex/values'
import { complete, parseJsonSafe } from '../../lib/integrations/openrouter'
import { searchSpecialDates } from '../../lib/specialDates'

export const generateIdeas = action({
  args: {
    id: v.id('specialDates'),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ideas: Array<{ title: string; body: string; hashtags: string[] }> }> => {
    const context = args.description ? `Contexto adicional: ${args.description}` : ''

    const userMessage = `Eres editor de contenido de SuperheroesInColor, especializado en comics con diversidad e inclusión.

Para la fecha especial: "${args.title}"
${context}

Genera 3 ideas de publicaciones para redes sociales (Tumblr y X/Twitter).
Cada idea debe celebrar o conmemorar esta fecha con contenido editorial relevante.

Responde SOLO con un objeto JSON válido, sin markdown:
{
  "ideas": [
    { "title": "título corto impactante", "body": "texto de la publicación (2-3 oraciones)", "hashtags": ["#tag1", "#tag2"] },
    { "title": "...", "body": "...", "hashtags": ["..."] },
    { "title": "...", "body": "...", "hashtags": ["..."] }
  ]
}`

    const raw = await complete(
      'Eres un editor de contenido especializado en cómics de superhéroes con diversidad.',
      userMessage,
      800
    )

    const parsed = parseJsonSafe<{ ideas: Array<{ title: string; body: string; hashtags: string[] }> }>(raw)

    const ideas = parsed?.ideas ?? [
      { title: `Recordando: ${args.title}`, body: 'Una fecha especial en la historia del cómic.', hashtags: ['#SuperheroesInColor', '#Comics'] },
    ]

    await ctx.runMutation(internal.specialDates.saveIdeas, {
      id: args.id,
      aiIdeas: JSON.stringify({ ideas }),
    })

    return { ideas }
  },
})

export const developIdea = action({
  args: {
    specialDateTitle: v.string(),
    ideaTitle: v.string(),
    ideaBody: v.string(),
    ideaHashtags: v.array(v.string()),
    diversityTags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ contentItemId: string }> => {
    const systemPrompt = 'You are the editorial content writer for SuperheroesInColor, a platform celebrating diversity and inclusion in comics. Write engaging, enthusiastic, and educational content in English.'

    const userPrompt = `Special Date being commemorated: "${args.specialDateTitle}"
Idea to develop: "${args.ideaTitle}"
Context: ${args.ideaBody}

Write a full Tumblr editorial post in English for this special date.
The post should celebrate diversity in comics, be enthusiastic and educational, and feel like authentic editorial content.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "headline": "Compelling headline (8-15 words)",
  "bodyHTML": "<p>First paragraph (60-80 words) — introduce the date/character/creator. Use <b>bold</b> for emphasis.</p><p>Second paragraph (60-80 words) — why this matters for diversity in comics. Include specific details.</p><p>Third paragraph (40-60 words) — call to read/discover, enthusiastic close.</p>",
  "tags": "tag1, tag2, tag3, tag4, tag5"
}`

    const raw = await complete(systemPrompt, userPrompt, 800)
    const parsed = parseJsonSafe<{ headline: string; bodyHTML: string; tags: string }>(raw)

    const headline = parsed?.headline ?? args.ideaTitle
    const bodyHTML  = parsed?.bodyHTML  ?? `<p>${args.ideaBody}</p>`
    const tags      = parsed?.tags      ?? args.ideaHashtags.join(', ')

    const repTags = (args.diversityTags ?? []).filter(Boolean)
    const themeTags = args.ideaHashtags.map(h => h.replace(/^#/, '').trim()).filter(Boolean)

    const contentItemId = await ctx.runMutation(api.contentItems.create, {
      contentType:        'articulo',
      title:              headline,
      summary:            args.ideaBody,
      representationTags: repTags,
      themeTags,
      contentOrigin:      'assisted',
    }) as string

    await ctx.runMutation(api.contentVariants.create, {
      contentItemId: contentItemId as any,
      channel:       'tumblr',
      headline,
      bodyText:      bodyHTML,
      ctaText:       tags,
    })

    return { contentItemId }
  },
})

export const searchAndImport = action({
  args: {
    month: v.number(),
    day:   v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ found: number; inserted: number; skipped: number }> => {
    const results = await searchSpecialDates(args.month, args.day)

    if (results.length === 0) return { found: 0, inserted: 0, skipped: 0 }

    const items = results.map(sd => ({
      date:          sd.date_mmdd,
      dateType:      'anniversary' as const,
      title:         sd.title,
      titleShort:    sd.title_short,
      description:   sd.description || undefined,
      yearOriginal:  sd.year ?? undefined,
      category:      sd.category,
      confidence:    sd.confidence,
      tags:          sd.suggested_post_tags ?? [],
      diversityTags: sd.diversity_tags ?? [],
      relevanceScore: sd.confidence === 'high' ? 9 : sd.confidence === 'medium' ? 7 : 5,
      teaserText:    sd.generated_content?.teaser || undefined,
      bannerImageUrl: sd.banner_image?.url || undefined,
      bannerImageAlt: sd.banner_image?.alt_text || undefined,
      richDataJson:  sd,
    }))

    const counts = await ctx.runMutation(internal.specialDates.importBatch, { items })

    return { found: results.length, ...counts }
  },
})
