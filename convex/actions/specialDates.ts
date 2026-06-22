"use node";

import { action } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { v } from 'convex/values'
import { complete, parseJsonSafe } from '../../lib/integrations/openrouter'
import { searchSpecialDates } from '../../lib/specialDates'
import { findCharacter, findPerson } from '../../lib/integrations/comicvine'

export const generateIdeas = action({
  args: {
    id:          v.id('specialDates'),
    title:       v.string(),
    description: v.optional(v.string()),
    entityName:  v.optional(v.string()),  // character or person name for CV lookup
    entityType:  v.optional(v.string()),  // 'character' | 'person'
  },
  handler: async (ctx, args): Promise<{ ideas: Array<{ title: string; body: string; hashtags: string[]; imagePrompt: string }> }> => {
    const context = args.description ? `Additional context: ${args.description}` : ''

    // CV enrichment: fetch structured data for the subject entity
    let cvContext = ''
    if (args.entityName) {
      try {
        if (args.entityType === 'person') {
          const person = await findPerson(args.entityName)
          if (person) {
            const parts: string[] = [`Comic Vine data for ${person.name}:`]
            if (person.deck) parts.push(person.deck)
            if (person.country) parts.push(`Country: ${person.country}`)
            if (person.created_characters?.length) {
              parts.push(`Characters created: ${person.created_characters.slice(0, 10).map(c => c.name).join(', ')}`)
            }
            cvContext = parts.join('\n')
          }
        } else {
          // Default: character lookup
          const char = await findCharacter(args.entityName)
          if (char) {
            const parts: string[] = [`Comic Vine data for ${char.name}:`]
            if (char.deck) parts.push(char.deck)
            if (char.real_name) parts.push(`Real name: ${char.real_name}`)
            if (char.publisher?.name) parts.push(`Publisher: ${char.publisher.name}`)
            if (char.count_of_issue_appearances) parts.push(`Appears in: ${char.count_of_issue_appearances} issues`)
            if (char.powers?.length) {
              parts.push(`Powers: ${char.powers.slice(0, 8).map(p => p.name).join(', ')}`)
            }
            const fa = char.first_appeared_in_issue
            if (fa) parts.push(`First appearance: ${fa.name ?? fa.api_detail_url ?? 'unknown'}`)
            cvContext = parts.join('\n')
          }
        }
      } catch (cvErr) {
        console.log('[generateIdeas:cv]', cvErr instanceof Error ? cvErr.message : String(cvErr))
      }
    }

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
${cvContext ? `\nVerified reference data (use these specific facts in your posts):\n${cvContext}\n` : ''}
Generate 3 fully written editorial posts for Tumblr/social media commemorating this date.
Each post must follow this 4-paragraph structure:
1. Historical/factual context — who, what, when, where, why this date matters
2. Present-day significance — how this connects to ongoing social issues or progress
3. Specific comic characters — name 3-5 real diverse characters whose stories directly relate to this theme, naming the specific issues they address (e.g. systemic inequality, cultural identity, etc.)
4. Inspiring close — connects the characters' journeys to real-world meaning; forward-looking but grounded in what already exists

Each body should be approximately 300-400 words. Separate each paragraph with a blank line (\\n\\n). Do NOT include any call to action, future promotion, or self-referential language.

Also generate a unique image generation prompt for each idea. The image prompt must:
- Be specific to THAT idea's angle and theme (not generic)
- Describe a vivid, symbolic visual: a scene, character moment, or powerful composition
- Reference real characters or visual elements from that post
- Style: "digital illustration, comic art style, vibrant colors, [specific scene/composition]"
- 1-2 sentences max

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "ideas": [
    {
      "title": "Compelling post title (English, 8-14 words)",
      "body": "Full 4-paragraph editorial post in plain text (no HTML). ~300-400 words. Paragraphs separated by \\n\\n.",
      "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"],
      "imagePrompt": "Specific image generation prompt for this idea's angle."
    },
    { "title": "...", "body": "...", "hashtags": ["..."], "imagePrompt": "..." },
    { "title": "...", "body": "...", "hashtags": ["..."], "imagePrompt": "..." }
  ]
}`

    const raw = await complete(systemPrompt, userMessage, 2400)

    const parsed = parseJsonSafe<{ ideas: Array<{ title: string; body: string; hashtags: string[]; imagePrompt: string }> }>(raw)

    const ideas = parsed?.ideas ?? [
      { title: `Celebrating: ${args.title}`, body: 'A special date in comics history worth remembering.', hashtags: ['#SuperheroesInColor', '#Comics', '#Diversity'], imagePrompt: '' },
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
