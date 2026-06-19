"use node";

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
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
