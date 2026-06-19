import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchSpecialDates, buildUserPrompt, parseResults } from './specialDates'

const STORM_ITEM = {
  date_mmdd: '06-18',
  year: null,
  title: "Storm's Birthday (Ororo Munroe)",
  title_short: "Storm's Birthday",
  description: "Storm, also known as Ororo Munroe, is one of Marvel's most iconic Black female superheroes. Her canonical birthday is June 18. She first appeared in Giant-Size X-Men #1 (1975) and has been a cornerstone of X-Men lore for decades.",
  fun_fact: "Storm was one of the first Black female superheroes to headline her own ongoing comic series.",
  category: 'character_birthday',
  diversity_tags: ['black', 'women'],
  entity: {
    name: 'Storm',
    alias: 'Ororo Munroe',
    type: 'character',
    universe: 'Marvel',
    image_search_hint: 'Storm Marvel Comics Ororo Munroe white hair',
  },
  generated_content: {
    teaser: "Happy Birthday, Storm! Ororo Munroe — one of Marvel's most iconic Black female heroes — was born on this day, making her one of the most beloved X-Men of all time.",
    hashtags: ['#Storm', '#OroroMunroe', '#XMen', '#BlackSuperhero', '#SuperheroesInColor'],
  },
  banner_image: {
    url: 'https://static.wikia.nocookie.net/marveldatabase/images/storm.jpg',
    source: 'Marvel Wiki',
    license: 'Fair Use',
    alt_text: 'Storm / Ororo Munroe, Marvel Comics character, with white hair and lightning',
    fallback_search_query: 'storm ororo munroe marvel comics',
  },
  sources: [
    {
      url: 'https://marvel.fandom.com/wiki/Ororo_Munroe_(Earth-616)',
      site_name: 'Marvel Wiki',
      title: 'Ororo Munroe (Earth-616)',
      verified: true,
    },
  ],
  confidence: 'high',
  suggested_post_tags: ['Storm', 'X-Men', 'Marvel', 'BlackSuperhero', 'WomenInComics'],
  related_search_terms: ['Storm Marvel birthday', 'Ororo Munroe June 18', 'X-Men diversity'],
}

function makeOpenRouterResponse(content: string) {
  return {
    ok: true,
    text: async () => '',
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  }
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key-123'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.OPENROUTER_API_KEY
})

describe('buildUserPrompt', () => {
  it('includes month number', () => {
    const prompt = buildUserPrompt(6)
    expect(prompt).toContain('month 6')
  })

  it('includes specific day when provided', () => {
    const prompt = buildUserPrompt(6, 18)
    expect(prompt).toContain('day 18')
    expect(prompt).toContain('06-18')
  })

  it('uses "all days" phrasing when day omitted', () => {
    const prompt = buildUserPrompt(6)
    expect(prompt).toContain('all days in month 6')
  })
})

describe('parseResults', () => {
  it('parses valid JSON array', () => {
    const raw = JSON.stringify([STORM_ITEM])
    const results = parseResults(raw)
    expect(results).toHaveLength(1)
    expect(results[0].date_mmdd).toBe('06-18')
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n' + JSON.stringify([STORM_ITEM]) + '\n```'
    const results = parseResults(raw)
    expect(results).toHaveLength(1)
  })

  it('returns [] on malformed JSON', () => {
    const results = parseResults('not json at all {{ broken')
    expect(results).toEqual([])
  })

  it('returns [] when response is not an array', () => {
    const results = parseResults(JSON.stringify({ single: 'object' }))
    expect(results).toEqual([])
  })

  it('filters by day when provided', () => {
    const other = { ...STORM_ITEM, date_mmdd: '06-19', title: 'Other Event' }
    const raw = JSON.stringify([STORM_ITEM, other])
    const results = parseResults(raw, 18)
    expect(results).toHaveLength(1)
    expect(results[0].date_mmdd).toBe('06-18')
  })

  it('drops items with invalid date_mmdd format', () => {
    const bad = { ...STORM_ITEM, date_mmdd: 'June-18' }
    const results = parseResults(JSON.stringify([bad]))
    expect(results).toEqual([])
  })

  it('coerces invalid category to cultural_event', () => {
    const bad = { ...STORM_ITEM, category: 'made_up_category' }
    const results = parseResults(JSON.stringify([bad]))
    expect(results[0].category).toBe('cultural_event')
  })

  it('filters out invalid diversity_tags', () => {
    const bad = { ...STORM_ITEM, diversity_tags: ['black', 'invalid_tag', 'women'] }
    const results = parseResults(JSON.stringify([bad]))
    expect(results[0].diversity_tags).toEqual(['black', 'women'])
  })

  it('nullifies banner_image url that does not start with https://', () => {
    const bad = { ...STORM_ITEM, banner_image: { ...STORM_ITEM.banner_image, url: 'http://insecure.com/img.jpg' } }
    const results = parseResults(JSON.stringify([bad]))
    expect(results[0].banner_image.url).toBeNull()
  })

  it('banner_image url that starts with https:// is preserved', () => {
    const results = parseResults(JSON.stringify([STORM_ITEM]))
    expect(results[0].banner_image.url).toMatch(/^https:\/\//)
  })

  it('sets fallback teaser when generated_content.teaser is empty', () => {
    const noTeaser = {
      ...STORM_ITEM,
      generated_content: { teaser: '', hashtags: [] },
    }
    const results = parseResults(JSON.stringify([noTeaser]))
    expect(results[0].generated_content.teaser).toContain('Storm')
  })

  it('confidence defaults to medium when invalid value', () => {
    const bad = { ...STORM_ITEM, confidence: 'super_high' }
    const results = parseResults(JSON.stringify([bad]))
    expect(results[0].confidence).toBe('medium')
  })
})

describe('searchSpecialDates', () => {
  it('calls fetch with perplexity/sonar-pro model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeOpenRouterResponse(JSON.stringify([STORM_ITEM])))
    vi.stubGlobal('fetch', mockFetch)

    await searchSpecialDates(6, 18)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('openrouter.ai')
    const body = JSON.parse(opts.body)
    expect(body.model).toBe('perplexity/sonar-pro')
  })

  it('sends Authorization header with API key', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeOpenRouterResponse(JSON.stringify([STORM_ITEM])))
    vi.stubGlobal('fetch', mockFetch)

    await searchSpecialDates(6, 18)

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer test-key-123')
  })

  it('returns parsed results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOpenRouterResponse(JSON.stringify([STORM_ITEM]))))

    const results = await searchSpecialDates(6, 18)

    expect(results).toHaveLength(1)
    expect(results[0].date_mmdd).toBe('06-18')
    expect(results[0].generated_content.teaser).toBeTruthy()
  })

  it('banner_image url is null or starts with https://', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOpenRouterResponse(JSON.stringify([STORM_ITEM]))))

    const results = await searchSpecialDates(6, 18)
    const url = results[0].banner_image.url
    expect(url === null || url.startsWith('https://')).toBe(true)
  })

  it('returns [] when response content is malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOpenRouterResponse('garbage text { not valid')))

    const results = await searchSpecialDates(6, 18)
    expect(results).toEqual([])
  })

  it('returns [] when response content is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOpenRouterResponse('')))

    const results = await searchSpecialDates(6, 18)
    expect(results).toEqual([])
  })

  it('throws when fetch returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }))

    await expect(searchSpecialDates(6, 18)).rejects.toThrow('OpenRouter error 401')
  })

  it('throws when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY

    await expect(searchSpecialDates(6, 18)).rejects.toThrow('OPENROUTER_API_KEY is not set')
  })
})
