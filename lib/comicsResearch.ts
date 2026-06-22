import { jsonrepair } from 'jsonrepair'
import type { SearchParams, ComicsResearchResponse, Confidence } from './comicsResearch.types'

const PERPLEXITY_MODEL = 'perplexity/sonar' as const
const FALLBACK_MODEL   = 'openai/gpt-4o-search-preview' as const
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const SYSTEM_PROMPT = `Answer exclusively with JSON that matches the schema. No prose.

You are a comics discovery and verification engine.

Your job is to find comic issues published or listed within a requested date range, then return ONLY strict JSON that my app can parse.

Primary goal:
Identify comics that match diversity criteria, giving strongest weight in this order:
1. protagonists or main cast who are non-white
2. interior artists who are non-white
3. writers who are non-white
4. cover artists who are non-white
5. LGBTQ+ protagonists or main cast
6. other underrepresented groups, including but not limited to Latino, Afro-Latino, Black American, Arab, Asian, Indigenous, etc.

Search scope:
Use multiple sources when possible.

Discovery sources:
- https://leagueofcomicgeeks.com/comics/new-comics
- https://www.comicreleases.com
- https://www.lunardistribution.com
- https://previewsworld.com
- official publisher release/catalog pages when useful

Validation sources:
- League of Comic Geeks issue pages
- official publisher pages
- DC official, Marvel official
- DC Database / DC Wiki
- Marvel Database / Marvel Wiki
- Wikipedia
- official creator pages or reliable public bios
- other public sources only if they add clear evidence

Important behavior rules:
- Return ONLY valid JSON.
- Do not output markdown.
- Do not output explanations.
- Do not output comments.
- Do not include text before or after the JSON.
- Do not invent identities, backgrounds, or cover appearances.
- If something is not clearly validated, mark it as "inferred" or "unverified".
- Prefer fewer high-quality results over many weak ones.
- Every important claim must have verification links.
- Separate source evidence for:
  - issue metadata
  - character diversity
  - creator diversity
  - image/cover verification
- If a result has insufficient evidence, either exclude it or lower confidence.
- If a cover appears to show a diverse character but you cannot validate it textually, keep the image but mark related diversity claims as inferred.
- If exact release date is unavailable but the issue clearly falls inside the requested weekly/monthly window, include it and mark date_evidence.status as "estimated".

Date handling:
Input parameters will be provided as:
- date_mode
- date_from
- date_to
- max_results

Interpret them as follows:
- If date_mode = "absolute", use date_from/date_to literally.
- If date_mode = "relative_resolved", date_from/date_to are already resolved dates and should be used literally.
- Include only issues that reasonably fall inside the range.

Image rules:
- Try to include up to 3 images per result.
- Prioritize:
  1. main cover image
  2. variant cover image
  3. another variant or publisher image
- If direct image URLs cannot be verified, return the variant page URLs in verification_links.variant_pages.
- Never invent image URLs.
- If only one image is verified, return one.
- Always include the source page for every image.
- If no images are available, return an empty array.

Ranking rules:
Sort results by:
1. confirmed diverse protagonists or main cast
2. confirmed non-white interior artists or writers
3. confirmed non-white cover artists
4. confirmed LGBTQ+ representation
5. inferred but still useful matches

Normalization rules:
- Never omit keys defined in the schema.
- Use [] for arrays with no values.
- Use "" for unknown strings unless null is explicitly required by the schema.
- Use "unverified" when no strong evidence exists.
- Use "low" confidence for weak evidence.
- Keep summaries short, factual, and based on source text.

Output schema:
{
  "query": {
    "date_mode": "",
    "date_from": "",
    "date_to": "",
    "max_results": 0
  },
  "sources_used": [
    {
      "name": "",
      "url": "",
      "purpose": "discovery|metadata|validation|image_verification"
    }
  ],
  "count": 0,
  "results": [
    {
      "title": "",
      "issue": "",
      "full_title": "",
      "year": 0,
      "publisher": "",
      "release_date": "",
      "date_evidence": {
        "status": "confirmed|estimated|unverified",
        "note": "",
        "source_urls": []
      },
      "summary": "",
      "images": [
        {
          "url": "",
          "type": "main_cover|variant_cover|issue_image|publisher_image",
          "source": "",
          "source_page": "",
          "image_evidence_status": "confirmed|inferred|unverified",
          "notes": ""
        }
      ],
      "creators": {
        "writers": [
          {
            "name": "",
            "diversity_tags": [],
            "validation_status": "confirmed|inferred|unverified",
            "evidence": "",
            "source_urls": []
          }
        ],
        "artists": [
          {
            "name": "",
            "role": "interior|artist|penciller|inker|colorist",
            "diversity_tags": [],
            "validation_status": "confirmed|inferred|unverified",
            "evidence": "",
            "source_urls": []
          }
        ],
        "cover_artists": [
          {
            "name": "",
            "diversity_tags": [],
            "validation_status": "confirmed|inferred|unverified",
            "evidence": "",
            "source_urls": []
          }
        ]
      },
      "characters": [
        {
          "name": "",
          "category": "protagonist|main_cast|supporting|cover_character|cameo",
          "diversity_tags": [],
          "validation_status": "confirmed|inferred|unverified",
          "evidence": "",
          "source_urls": []
        }
      ],
      "inclusion_reasons": [
        {
          "type": "protagonist_diversity|character_diversity|writer_diversity|artist_diversity|cover_diversity|lgbtq_representation",
          "priority": 1,
          "description": "",
          "source_urls": []
        }
      ],
      "verification_links": {
        "primary_issue_page": "",
        "secondary_sources": [],
        "variant_pages": [],
        "character_validation": [],
        "creator_validation": [],
        "image_validation": []
      },
      "confidence": "high|medium|low",
      "notes": ""
    }
  ]
}

Confidence rules:
- high = issue metadata and diversity claims are supported by clear, consistent sources
- medium = some claims are well supported, others are partial
- low = weak, incomplete, or mostly inferred evidence

If no qualifying issues are found, return:
{
  "query": {
    "date_mode": "",
    "date_from": "",
    "date_to": "",
    "max_results": 0
  },
  "sources_used": [],
  "count": 0,
  "results": []
}`.trim()

const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

export function buildUserPrompt(params: SearchParams): string {
  const publisherLine = params.publishers?.length
    ? `Publishers to include: ${params.publishers.join(', ')}.`
    : 'Include all publishers.'

  const confidenceLine = params.minConfidence
    ? `Minimum confidence required: ${params.minConfidence}.`
    : ''

  const imagesLine = params.requireImages
    ? 'Only include results that have at least one verified image URL.'
    : ''

  const maxImagesLine = `Return at most ${params.maxImagesPerResult ?? 3} images per result.`

  const characterLines = params.characterContext?.length
    ? [
        'DIVERSITY FOCUS: Prioritize comics where the protagonist or main cast is Black, Latino, Asian, Indigenous, Arab, or from other racial/ethnic minorities.',
        'Do NOT default to LGBTQ+ representation — only include LGBTQ content when no racial/ethnic diversity options are available for this date range.',
        `Example diverse characters that may have relevant comics: ${params.characterContext.slice(0, 15).join(', ')}, and similar characters.`,
        'These are EXAMPLES of the diversity type to seek — find ANY comics featuring racial/ethnic diverse characters in this period, not only these specific names.',
      ].join('\n')
    : 'DIVERSITY FOCUS: Prioritize racial/ethnic diversity (Black, Latino, Asian, Indigenous, Arab) over LGBTQ+ representation.'

  return [
    'Find comics with diversity representation matching these parameters:',
    `date_mode: "${params.dateMode}"`,
    `date_from: "${params.dateFrom}"`,
    `date_to: "${params.dateTo}"`,
    `max_results: ${params.maxResults}`,
    publisherLine,
    confidenceLine,
    imagesLine,
    maxImagesLine,
    '',
    characterLines,
    '',
    'Return JSON matching the schema exactly. No other text.',
  ].filter(Boolean).join('\n')
}

function applyFilters(parsed: ComicsResearchResponse, params: SearchParams): ComicsResearchResponse {
  let results = parsed.results

  if (params.minConfidence) {
    const minRank = CONFIDENCE_RANK[params.minConfidence] ?? 1
    results = results.filter(r => (CONFIDENCE_RANK[r.confidence] ?? 1) >= minRank)
  }

  if (params.requireImages) {
    results = results.filter(r => Array.isArray(r.images) && r.images.length > 0)
  }

  results = results.slice(0, params.maxResults)
  return { ...parsed, results, count: results.length }
}

// Repair missing commas in LLM-generated JSON.
// JSON values end with: " (string), } (object), ] (array), 0-9 (number), e (true/false), l (null)
// Next token can be " (key/string), { (object), [ (array)
function repairMissingCommas(s: string): string {
  return s
    .replace(/(["}\]0-9el])([ \t]*\r?\n[ \t]*)(["{\[])/g, '$1,$2$3')  // add missing commas
    .replace(/,(\s*[}\]])/g, '$1')                                       // remove trailing commas
}

export function parseSearchResponse(raw: string, params: SearchParams): ComicsResearchResponse {
  const empty: ComicsResearchResponse = {
    query: { date_mode: params.dateMode, date_from: params.dateFrom, date_to: params.dateTo, max_results: params.maxResults },
    sources_used: [],
    count: 0,
    results: [],
  }

  // Strip markdown fences and Perplexity citation footnotes
  let cleaned = raw
    .replace(/```(?:json)?/g, '')
    .replace(/\[\d+\](\s*\n)?/g, '')
    .trim()

  // Strategy 1: outermost JSON object
  const objStart = cleaned.indexOf('{')
  const objEnd   = cleaned.lastIndexOf('}')
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as ComicsResearchResponse
      if (Array.isArray(parsed.results) && parsed.results.length > 0) {
        return applyFilters(parsed, params)
      }
      // Valid JSON but empty results — return it rather than falling through
      if (Array.isArray(parsed.results)) return applyFilters(parsed, params)
    } catch (e) {
      const msg = (e as Error).message ?? ''
      console.error('[comicsResearch] strategy1 parse error:', msg.slice(0, 200))
      const posMatch = msg.match(/position (\d+)/)
      if (posMatch) {
        const pos = parseInt(posMatch[1])
        console.error(`[comicsResearch] around error (${pos-50}:${pos+50}):`, cleaned.slice(Math.max(0, pos-50), pos+50))
      }
    }
  }

  // Strategy 1.5: jsonrepair then reparse full JSON
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const repaired = jsonrepair(cleaned.slice(objStart, objEnd + 1))
      const parsed = JSON.parse(repaired) as ComicsResearchResponse
      if (Array.isArray(parsed.results)) {
        console.log(`[comicsResearch] strategy1.5 jsonrepair → ${parsed.results.length} results`)
        return applyFilters(parsed, params)
      }
    } catch (e) {
      console.error('[comicsResearch] strategy1.5 failed:', (e as Error).message?.slice(0, 150))
    }
  }

  // Strategy 2: model returned only the results array
  const arrStart = cleaned.indexOf('[')
  const arrEnd   = cleaned.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const results = JSON.parse(cleaned.slice(arrStart, arrEnd + 1))
      if (Array.isArray(results) && results.length > 0) {
        return applyFilters({
          query: { date_mode: params.dateMode, date_from: params.dateFrom, date_to: params.dateTo, max_results: params.maxResults },
          sources_used: [],
          count: results.length,
          results,
        }, params)
      }
    } catch { /* fall through */ }
  }

  // Strategy 4: per-object walker — handles truncated outer JSON, repairs each object individually
  const resultsKeyMatch = cleaned.match(/"results"\s*:\s*\[/)
  if (resultsKeyMatch?.index !== undefined) {
    const arrayStart = cleaned.indexOf('[', resultsKeyMatch.index)
    const slice = cleaned.slice(arrayStart)
    const validResults: unknown[] = []
    let depth = 0, s4ObjStart = -1, inStr = false, escape = false
    for (let i = 0; i < slice.length; i++) {
      const c = slice[i]
      if (escape)             { escape = false; continue }
      if (c === '\\' && inStr){ escape = true;  continue }
      if (c === '"')          { inStr = !inStr;  continue }
      if (inStr) continue
      if (c === '{') { if (depth === 0) s4ObjStart = i; depth++ }
      else if (c === '}') {
        depth--
        if (depth === 0 && s4ObjStart !== -1) {
          const candidate = slice.slice(s4ObjStart, i + 1)
          let p: unknown = null
          try { p = JSON.parse(candidate) } catch {
            try { p = JSON.parse(jsonrepair(candidate)) } catch (e2) {
              console.error(`[comicsResearch] s4 repair failed: ${(e2 as Error).message?.slice(0, 100)}`)
            }
          }
          if (p !== null) validResults.push(p)
          s4ObjStart = -1
        }
      }
    }
    if (validResults.length > 0) {
      console.log(`[comicsResearch] strategy4 recovered ${validResults.length} objects`)
      return applyFilters({
        query: { date_mode: params.dateMode, date_from: params.dateFrom, date_to: params.dateTo, max_results: params.maxResults },
        sources_used: [], count: validResults.length,
        results: validResults as ComicsResearchResponse['results'],
      }, params)
    }
  }

  console.error('[comicsResearch] all strategies failed. raw[:1000]:', raw.slice(0, 1000))
  console.error('[comicsResearch] raw[-500:]:', raw.slice(-500))
  return empty
}

async function callModel(model: string, params: SearchParams, label: string): Promise<ComicsResearchResponse> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer':  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
      'X-Title':       'SuperheroesInColor CMS',
    },
    body: JSON.stringify({
      model,
      max_tokens: 10000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(params) },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter [${label}] error ${response.status}: ${error}`)
  }

  const data = await response.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''

  console.log(`[comicsResearch:${label}] finish_reason:`, data.choices?.[0]?.finish_reason)
  console.log(`[comicsResearch:${label}] raw length:`, raw.length)
  console.log(`[comicsResearch:${label}] raw preview:`, raw.slice(0, 500))

  if (!raw) {
    return {
      query: { date_mode: params.dateMode, date_from: params.dateFrom, date_to: params.dateTo, max_results: params.maxResults },
      sources_used: [],
      count: 0,
      results: [],
    }
  }

  return parseSearchResponse(raw, params)
}

export async function searchComics(params: SearchParams): Promise<ComicsResearchResponse> {
  const result = await callModel(PERPLEXITY_MODEL, params, 'perplexity')
  if (result.results.length > 0) return result

  console.log('[comicsResearch] sonar empty — gpt-4o-search fallback')
  return callModel(FALLBACK_MODEL, params, 'gpt4o-search')
}
