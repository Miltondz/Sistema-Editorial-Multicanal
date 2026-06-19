import type { SpecialDate } from './specialDates.types'

const PERPLEXITY_MODEL = 'perplexity/sonar' as const
const FALLBACK_MODEL   = 'openai/gpt-4o-search-preview' as const
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const SYSTEM_PROMPT = `
You are an expert in comics history, pop culture, and diversity with active web search access.
Your specialty is identifying historical dates and anniversaries related to racial, gender,
sexual, disability, and cultural diversity in comics and pop culture.

Search actively in:
- marvel.fandom.com — character birthdays, first appearances, bios
- dc.fandom.com — same for DC universe
- en.wikipedia.org and es.wikipedia.org — creator bios, historical events
- comicvine.gamespot.com — publication dates, character data
- comics.org (Grand Comics Database) — publication records
- lambiek.net (Comiclopedia) — international creator bios
- commons.wikimedia.org — freely licensed images
- static.wikia.nocookie.net — fandom wiki images

For images, prefer direct CDN URLs from Wikimedia Commons or Fandom wikis.
These are stable, public, and usable without authentication.

All text fields must be in English.
Respond ONLY with a valid raw JSON array. No explanations, no markdown, no code blocks.
`.trim()

export function buildUserPrompt(month: number, day?: number): string {
  const target = day
    ? `month ${month}, day ${day} (${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')})`
    : `all days in month ${month} (return up to 20 results spread across the month)`

  return `
Search for special dates in comics and pop culture for ${target}.

WHAT TO LOOK FOR:
1. Character birthdays — canonical birth dates from Marvel Wiki, DC Wiki, or Comic Vine
   (many characters have official birthdays listed: Storm = June 18, Spider-Man = August 27, etc.)
2. Creator birthdays — writers, artists, colorists, letterers, editors
3. Creator deaths — notable figures in comics history
4. First appearances — first comic issue featuring a character (use publication date)
5. Series anniversaries — landmark issues or debut issues of diversity-focused series
6. Awards — Eisner, Harvey, Ringo, GLAAD Media Awards given to underrepresented creators
7. Industry milestones — first Black/Latina/LGBTQ+ character or creator to achieve X
8. Organization foundings — Milestone Media, Fantagraphics, etc.
9. Cultural events — conventions, movements, campaigns relevant to comics diversity

DIVERSITY FOCUS (critical — prioritize these):
- Black and Afro-descendant characters and creators
- Latino and Hispanic characters and creators
- Asian and Pacific Islander characters and creators
- Indigenous and Native American characters and creators
- LGBTQ+ characters and creators
- People with disabilities
- Women in historically male-dominated roles
- Creators from outside the US and UK

FOR EACH RESULT provide this exact JSON object:
{
  "date_mmdd": "MM-DD",
  "year": <number or null>,
  "title": "<concise English title, e.g. 'Storm\\'s Birthday (Ororo Munroe)'>",
  "title_short": "<short English version for notifications, e.g. 'Storm\\'s Birthday'>",
  "description": "<2-3 English sentences: what it is, historical context, why it matters for diversity>",
  "fun_fact": "<one interesting English sentence or null>",
  "category": "<character_birthday|creator_birthday|creator_death|first_appearance|series_anniversary|award|industry_milestone|organization_founded|cultural_event>",
  "diversity_tags": ["<from: black|latinx|asian|indigenous|middle_eastern|lgbtq|transgender|disability|women|nonbinary|multiracial|jewish|muslim|international>"],
  "entity": {
    "name": "<primary name>",
    "alias": "<real name or alternate name, or null>",
    "type": "<character|person>",
    "universe": "<Marvel|DC|Image|Dark Horse|Independent|null>",
    "image_search_hint": "<2-4 English search terms for finding an image>"
  },
  "generated_content": {
    "teaser": "<1-2 English sentences for the Today is a Special Day banner. Be specific and celebratory.>",
    "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3"]
  },
  "banner_image": {
    "url": "<direct https:// URL to image file from Wikimedia Commons or Fandom CDN, or null>",
    "source": "<Wikimedia Commons|Marvel Wiki|DC Wiki|Comic Vine|other|null>",
    "license": "<CC BY-SA|CC0|Public Domain|Fair Use|Unknown|null>",
    "alt_text": "<English descriptive alt text for accessibility>",
    "fallback_search_query": "<English query to use if the URL fails>"
  },
  "sources": [
    {
      "url": "<exact https:// URL you retrieved and confirmed>",
      "site_name": "<Marvel Wiki|DC Wiki|Wikipedia|Comic Vine|Grand Comics Database|Lambiek|other>",
      "title": "<page or article title>",
      "verified": <true if you actually retrieved this URL, false if inferred>
    }
  ],
  "confidence": "<high if date confirmed in official wiki or database|medium if from general reference|low if inferred>",
  "suggested_post_tags": ["<English tag1>", "<English tag2>"],
  "related_search_terms": ["<English term1>", "<English term2>", "<English term3>"]
}

Return between 8 and 20 results. Prioritize confidence: "high".
Include at least one result per category if possible.
Return ONLY the raw JSON array, starting with [ and ending with ].
`.trim()
}

export function parseResults(raw: string, day?: number): SpecialDate[] {
  try {
    const cleaned = extractJSON(raw)
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) {
      console.error('[specialDates] parsed value is not array, type:', typeof parsed)
      return []
    }
    const results = parsed
      .map(validateAndClean)
      .filter((item): item is SpecialDate => item !== null)
    if (day !== undefined) {
      const dayStr = String(day).padStart(2, '0')
      return results.filter(r => r.date_mmdd.endsWith(`-${dayStr}`))
    }
    return results
  } catch (err) {
    console.error('[specialDates] JSON parse error:', err)
    return []
  }
}

function extractJSON(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return match[1].trim()
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1)
  return raw.trim()
}

const VALID_CATEGORIES = new Set([
  'character_birthday', 'creator_birthday', 'creator_death', 'first_appearance',
  'series_anniversary', 'award', 'industry_milestone', 'organization_founded', 'cultural_event',
])

const VALID_DIVERSITY_TAGS = new Set([
  'black', 'latinx', 'asian', 'indigenous', 'middle_eastern', 'lgbtq', 'transgender',
  'disability', 'women', 'nonbinary', 'multiracial', 'jewish', 'muslim', 'international',
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateAndClean(item: any): SpecialDate | null {
  if (!item.date_mmdd || !item.title || !item.category || !item.entity) return null
  if (!/^\d{2}-\d{2}$/.test(item.date_mmdd)) return null

  const category = VALID_CATEGORIES.has(item.category) ? item.category : 'cultural_event'
  const diversityTags = Array.isArray(item.diversity_tags)
    ? item.diversity_tags.filter((t: unknown) => typeof t === 'string' && VALID_DIVERSITY_TAGS.has(t))
    : []

  const bannerUrl = typeof item.banner_image?.url === 'string' && item.banner_image.url.startsWith('https://')
    ? item.banner_image.url
    : null

  const teaser = item.generated_content?.teaser || `${item.entity?.name ?? item.title} is featured today on SuperheroesInColor.`

  const sources = Array.isArray(item.sources)
    ? item.sources.map((s: Record<string, unknown>) => ({
        ...s,
        verified: s.verified === true && typeof s.url === 'string' && (s.url as string).startsWith('https://'),
      }))
    : []

  return {
    date_mmdd: item.date_mmdd,
    year: typeof item.year === 'number' ? item.year : null,
    title: String(item.title),
    title_short: String(item.title_short ?? item.title),
    description: String(item.description ?? ''),
    fun_fact: typeof item.fun_fact === 'string' ? item.fun_fact : null,
    category,
    diversity_tags: diversityTags,
    entity: {
      name: String(item.entity?.name ?? ''),
      alias: item.entity?.alias ?? null,
      type: item.entity?.type === 'person' ? 'person' : 'character',
      universe: item.entity?.universe ?? null,
      image_search_hint: String(item.entity?.image_search_hint ?? ''),
    },
    generated_content: {
      teaser,
      hashtags: Array.isArray(item.generated_content?.hashtags) ? item.generated_content.hashtags : [],
    },
    banner_image: {
      url: bannerUrl,
      source: item.banner_image?.source ?? null,
      license: item.banner_image?.license ?? null,
      alt_text: String(item.banner_image?.alt_text ?? item.title),
      fallback_search_query: String(item.banner_image?.fallback_search_query ?? item.entity?.image_search_hint ?? item.title),
    },
    sources,
    confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium',
    suggested_post_tags: Array.isArray(item.suggested_post_tags) ? item.suggested_post_tags : [],
    related_search_terms: Array.isArray(item.related_search_terms) ? item.related_search_terms : [],
  } as SpecialDate
}

async function callModel(model: string, month: number, day: number | undefined, label: string): Promise<SpecialDate[]> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
      'X-Title': 'SuperheroesInColor CMS',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(month, day) },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter [${label}] error ${response.status}: ${error}`)
  }

  const data = await response.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''

  console.log(`[specialDates:${label}] finish_reason:`, data.choices?.[0]?.finish_reason)
  console.log(`[specialDates:${label}] raw length:`, raw.length)
  console.log(`[specialDates:${label}] raw preview:`, raw.slice(0, 500))

  if (!raw) return []

  const results = parseResults(raw, day)
  if (results.length === 0) {
    console.error(`[specialDates:${label}] parseResults empty — raw (first 1000):`, raw.slice(0, 1000))
  }
  return results
}

export async function searchSpecialDates(month: number, day?: number): Promise<SpecialDate[]> {
  const results = await callModel(PERPLEXITY_MODEL, month, day, 'perplexity')
  if (results.length > 0) return results

  console.log('[specialDates] sonar empty — gpt-4o-search fallback')
  return callModel(FALLBACK_MODEL, month, day, 'gpt4o-search')
}
