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
    const context = args.description ? `Additional context: ${args.description}` : ''

    const systemPrompt = `You are the senior editorial writer for SuperheroesInColor, a platform dedicated to diversity and inclusion in comics. You write in English only. Your editorial style is:
- Grounded in real historical or cultural context (specific years, names, facts)
- Educational and reflective, not promotional
- Connects the special date to specific diverse comic book characters and their themes (systemic inequality, cultural identity, community leadership, scientific innovation, civil rights, representation)
- NEVER promotes future posts, activities, or "stay tuned" content
- NEVER says "follow us", "share this", "coming soon", or references anything outside the post itself
- Each post is fully self-contained — it tells a complete story on its own
- Tone: informed, enthusiastic, respectful, inspiring`

    const userMessage = `Special date: "${args.title}"
${context}

Generate 3 fully written editorial posts for Tumblr/social media commemorating this date.
Each post must follow this 4-paragraph structure:
1. Historical/factual context — who, what, when, where, why this date matters
2. Present-day significance — how this connects to ongoing social issues or progress
3. Specific comic characters — name 3-5 real diverse characters whose stories directly relate to this theme, naming the specific issues they address (e.g. systemic inequality, cultural identity, etc.)
4. Inspiring close — connects the characters' journeys to real-world meaning; forward-looking but grounded in what already exists

Each body should be approximately 300-400 words. Do NOT include any call to action, future promotion, or self-referential language.

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "ideas": [
    {
      "title": "Compelling post title (English, 8-14 words)",
      "body": "Full 4-paragraph editorial post in plain text (no HTML). ~300-400 words.",
      "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"]
    },
    { "title": "...", "body": "...", "hashtags": ["..."] },
    { "title": "...", "body": "...", "hashtags": ["..."] }
  ]
}`

    const raw = await complete(systemPrompt, userMessage, 2400)

    const parsed = parseJsonSafe<{ ideas: Array<{ title: string; body: string; hashtags: string[] }> }>(raw)

    const ideas = parsed?.ideas ?? [
      { title: `Celebrating: ${args.title}`, body: 'A special date in comics history worth remembering.', hashtags: ['#SuperheroesInColor', '#Comics', '#Diversity'] },
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
    const systemPrompt = `You are the senior editorial writer for SuperheroesInColor. Convert the provided editorial content into a formatted Tumblr post.
Rules:
- Write in English only
- Self-contained — no "follow us", "stay tuned", "coming soon", "share this", or any future promotion
- Use <p> tags for paragraphs, <b> for bold emphasis on key names or terms
- Keep all 4 paragraphs: historical context → present-day significance → specific comic characters → inspiring close
- Do NOT invent facts; use only what is provided in the source text`

    const userPrompt = `Special date: "${args.specialDateTitle}"
Title: "${args.ideaTitle}"

Source editorial text to convert to HTML:
${args.ideaBody}

Format this as a Tumblr post. Wrap each paragraph in <p></p> tags. Bold (<b></b>) key character names, dates, and important terms.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "headline": "Post headline (8-14 words, same meaning as title)",
  "bodyHTML": "<p>Paragraph 1...</p><p>Paragraph 2...</p><p>Paragraph 3...</p><p>Paragraph 4...</p>",
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
