// Comic Vine API client — server-side only (API key must not leak to browser)
// Base URL: https://comicvine.gamespot.com/api
// Type prefixes: character=4005, volume=4050, person=4040, issue=4000, publisher=4010

const BASE = 'https://comicvine.gamespot.com/api'

// ── Shared types ──────────────────────────────────────────────────────────

export interface CVImage {
  icon_url:     string
  medium_url:   string
  original_url: string
  thumb_url:    string
}

export interface CVRef {
  id:              number
  name:            string
  api_detail_url?: string
  site_detail_url?: string
}

// ── Resource types ────────────────────────────────────────────────────────

export interface CVSearchResult {
  resource_type: 'character' | 'volume' | 'issue' | 'publisher' | 'person' | 'team' | 'story_arc'
  id:            number
  name:          string
  deck?:         string
  image?:        CVImage
  api_detail_url: string
  site_detail_url?: string
  // character
  real_name?:    string
  publisher?:    CVRef
  // volume
  start_year?:   string
  count_of_issues?: number
  // issue
  cover_date?:   string
  volume?:       CVRef
}

export interface CVCharacter {
  id:           number
  name:         string
  real_name?:   string
  deck?:        string
  description?: string
  image?:       CVImage
  publisher?:   CVRef
  gender?:      number   // 1=male 2=female 0=other
  birth?:       string
  powers?:      Array<{ id: number; name: string }>
  creators?:    Array<{ id: number; name: string }>
  first_appeared_in_issue?: CVRef & { volume?: CVRef; issue_number?: string }
  count_of_issue_appearances?: number
  site_detail_url?: string
}

export interface CVVolume {
  id:            number
  name:          string
  deck?:         string
  description?:  string
  image?:        CVImage
  publisher?:    CVRef
  start_year?:   string
  count_of_issues?: number
  person_credits?:    Array<{ id: number; name: string; role: string }>
  character_credits?: Array<{ id: number; name: string }>
  first_issue?:  CVRef
  last_issue?:   CVRef
  site_detail_url?: string
}

export interface CVPerson {
  id:           number
  name:         string
  deck?:        string
  description?: string
  image?:       CVImage
  birth?:       string
  country?:     string
  gender?:      number
  created_characters?: Array<{ id: number; name: string }>
  site_detail_url?: string
}

export interface CVIssue {
  id:            number
  name?:         string
  issue_number?: string
  deck?:         string
  image?:        CVImage
  cover_date?:   string
  store_date?:   string
  volume?:       CVRef
  character_credits?: Array<{ id: number; name: string }>
  person_credits?:    Array<{ id: number; name: string; role: string }>
  site_detail_url?: string
}

// ── Core fetch helper ─────────────────────────────────────────────────────

interface CVResponse<T> {
  status_code: number
  error:       string
  number_of_total_results: number
  number_of_page_results:  number
  results:     T
}

async function cvFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.COMICVINE_API_KEY
  if (!apiKey) throw new Error('COMICVINE_API_KEY is not set')

  const qs = new URLSearchParams({ ...params, api_key: apiKey, format: 'json' })
  const url = `${BASE}${path}?${qs}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'SuperheroesInColor-CMS/1.0' },
  })
  if (!res.ok) throw new Error(`ComicVine HTTP ${res.status}: ${await res.text()}`)

  const json: CVResponse<T> = await res.json()
  if (json.status_code !== 1) throw new Error(`ComicVine API error ${json.status_code}: ${json.error}`)

  return json.results
}

// ── Role mapping ──────────────────────────────────────────────────────────

// Maps CV role strings to CMS creatorRole values
export function cvRoleToCreatorRole(
  cvRole: string
): 'writer' | 'artist' | 'cover_artist' | 'colorist' | 'photographer' | 'other' {
  const r = cvRole.toLowerCase()
  if (r.includes('writer') || r.includes('script')) return 'writer'
  if (r.includes('cover')) return 'cover_artist'
  if (r.includes('color') || r.includes('colour')) return 'colorist'
  if (r.includes('pencil') || r.includes('inker') || r.includes('artist') || r.includes('illustrat')) return 'artist'
  if (r.includes('photo')) return 'photographer'
  return 'other'
}

// ── Public functions — single resource ────────────────────────────────────

export type CVResource = 'character' | 'volume' | 'issue' | 'publisher' | 'person' | 'team' | 'story_arc'

export async function searchComicVine(
  query: string,
  resources: CVResource[] = ['character', 'volume', 'issue', 'person'],
  limit = 10
): Promise<CVSearchResult[]> {
  return cvFetch<CVSearchResult[]>('/search/', {
    query,
    resources: resources.join(','),
    limit:     String(limit),
    field_list: 'id,name,deck,image,resource_type,api_detail_url,site_detail_url,publisher,start_year,count_of_issues,real_name,cover_date,volume',
  })
}

// ID format: numeric only (e.g. 1487). The type prefix (4005-) is added internally.
export async function getCharacter(id: number): Promise<CVCharacter> {
  return cvFetch<CVCharacter>(`/character/4005-${id}/`, {
    field_list: 'id,name,real_name,deck,description,image,publisher,gender,birth,powers,creators,first_appeared_in_issue,count_of_issue_appearances,site_detail_url',
  })
}

export async function getVolume(id: number): Promise<CVVolume> {
  return cvFetch<CVVolume>(`/volume/4050-${id}/`, {
    field_list: 'id,name,deck,description,image,publisher,start_year,count_of_issues,person_credits,character_credits,first_issue,last_issue,site_detail_url',
  })
}

export async function getPerson(id: number): Promise<CVPerson> {
  return cvFetch<CVPerson>(`/person/4040-${id}/`, {
    field_list: 'id,name,deck,description,image,birth,country,gender,created_characters,site_detail_url',
  })
}

export async function getIssue(id: number): Promise<CVIssue> {
  return cvFetch<CVIssue>(`/issue/4000-${id}/`, {
    field_list: 'id,name,issue_number,deck,image,cover_date,store_date,volume,character_credits,person_credits,site_detail_url',
  })
}

// ── List endpoints ────────────────────────────────────────────────────────

// dateFrom/dateTo format: YYYY-MM-DD
// Note: CV's /issues/ endpoint does not support publisher filtering — returns all publishers
export async function getRecentIssues(
  dateFrom: string,
  dateTo: string,
  limit = 20
): Promise<CVIssue[]> {
  return cvFetch<CVIssue[]>('/issues/', {
    filter:     `cover_date:${dateFrom}|${dateTo}`,
    sort:       'cover_date:desc',
    limit:      String(limit),
    field_list: 'id,name,issue_number,deck,image,cover_date,store_date,volume,character_credits,person_credits,site_detail_url',
  })
}

// Note: CV's /volumes/ list endpoint does not support publisher:id filtering.
// This uses the search endpoint with the publisher name as keyword — not an exact filter.
export async function getPublisherVolumes(publisherName: string, limit = 20): Promise<CVSearchResult[]> {
  return searchComicVine(publisherName, ['volume'], limit)
}

// Get volumes a character appears in, filtered by year range.
// Uses CV /volumes/ list endpoint with character_credits filter.
export async function getVolumesByCharacterId(
  characterId: number,
  opts: { yearFrom?: number; yearTo?: number; limit?: number } = {}
): Promise<CVSearchResult[]> {
  const params: Record<string, string> = {
    filter:     `character_credits:${characterId}`,
    sort:       'start_year:desc',
    limit:      String(opts.limit ?? 10),
    field_list: 'id,name,deck,image,publisher,start_year,count_of_issues,site_detail_url',
  }
  const results = await cvFetch<CVSearchResult[]>('/volumes/', params)
  return results.filter(vol => {
    const year = vol.start_year ? parseInt(vol.start_year) : null
    if (!year) return !opts.yearFrom && !opts.yearTo
    if (opts.yearFrom && year < opts.yearFrom - 1) return false
    if (opts.yearTo   && year > opts.yearTo + 1)   return false
    return true
  })
}

// publisher IDs for major US publishers — search endpoint doesn't reliably return publishers
export const KNOWN_PUBLISHER_IDS: Record<string, number> = {
  'Marvel':            31,
  'Marvel Comics':     31,
  'DC':                10,
  'DC Comics':         10,
  'Image':              6,
  'Image Comics':       6,
  'Dark Horse':        14,
  'Dark Horse Comics': 14,
  'IDW':                8,
  'IDW Publishing':     8,
  'Boom':              68,
  'BOOM! Studios':     68,
  'Oni Press':         24,
  'Fantagraphics':     49,
  'Milestone':         10,  // Milestone imprint of DC
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Strip issue number, year, volume qualifier from comic title before CV search
function cleanComicTitle(title: string): string {
  return title
    .replace(/\s*#\d+(\.\d+)?/g, '')       // remove #1, #12, #1.5
    .replace(/\s*\(\d{4}\)/g, '')           // remove (2016)
    .replace(/\s+Vol\.?\s*\d+/gi, '')       // remove Vol.1, Vol 2
    .replace(/\s+Issue\s+\d+/gi, '')        // remove Issue 1
    .trim()
}

// Pick best volume from search results: exact name > most issues > first
function pickBestVolume(results: CVSearchResult[], cleanTitle: string): CVSearchResult {
  const lower = cleanTitle.toLowerCase()
  const exact = results.find(r => r.name?.toLowerCase() === lower)
  if (exact) return exact
  // Sort by issue count descending — the canonical run has the most issues
  const sorted = [...results].sort((a, b) => (b.count_of_issues ?? 0) - (a.count_of_issues ?? 0))
  return sorted[0]
}

// ── Higher-level compositions ─────────────────────────────────────────────

// Search + get detail in one call. Returns null if not found.
export async function findVolume(title: string, publisher?: string): Promise<CVVolume | null> {
  const clean = cleanComicTitle(title)
  const query = publisher ? `${clean} ${publisher}` : clean
  const results = await searchComicVine(query, ['volume'], 10)
  if (!results.length) return null
  const best = pickBestVolume(results, clean)
  return getVolume(best.id)
}

export async function findCharacter(name: string): Promise<CVCharacter | null> {
  const results = await searchComicVine(name, ['character'], 3)
  if (!results.length) return null
  const best = results.find(r => r.name?.toLowerCase() === name.toLowerCase()) ?? results[0]
  return getCharacter(best.id)
}

export async function findPerson(name: string): Promise<CVPerson | null> {
  const results = await searchComicVine(name, ['person'], 3)
  if (!results.length) return null
  const best = results.find(r => r.name?.toLowerCase() === name.toLowerCase()) ?? results[0]
  return getPerson(best.id)
}

// CV search endpoint doesn't reliably return publishers — use /publishers/ list with filter
export async function searchPublisher(name: string): Promise<{ id: number; name: string } | null> {
  // Fast path: known publisher
  const knownId = KNOWN_PUBLISHER_IDS[name]
  if (knownId) return { id: knownId, name }
  // Slow path: /publishers/ filter endpoint
  try {
    const results = await cvFetch<Array<{ id: number; name: string }>>('/publishers/', {
      filter:     `name:${name}`,
      field_list: 'id,name',
      limit:      '3',
    })
    if (results.length) return { id: results[0].id, name: results[0].name }
  } catch { /* fall through */ }
  return null
}

// ── Enrichment helper ─────────────────────────────────────────────────────

export interface CVEnrichmentResult {
  cvId:          number
  cvUrl?:        string
  resourceType:  CVSearchResult['resource_type']
  name:          string
  deck?:         string
  coverImageUrl?: string
  publisher?:    string
  startYear?:    string
  // volume-specific
  creators?:     Array<{ name: string; role: string }>
  characters?:   Array<{ id: number; name: string }>
  issueCount?:   number
  // character-specific
  realName?:     string
  powers?:       Array<{ id: number; name: string }>
  firstAppearance?: string
  // person-specific
  country?:      string
  createdCharacters?: Array<{ id: number; name: string }>
}

// Main enrichment function: given a title + optional hints, returns the best CV match with details.
// contentType drives which resource type to prioritize.
export async function enrichFromComicVine(
  title: string,
  publisher?: string,
  contentType?: string
): Promise<CVEnrichmentResult | null> {
  const isComic = !contentType || contentType === 'comic' || contentType === 'novela_grafica'
  const resources: CVResource[] =
    contentType === 'personaje' ? ['character'] :
    contentType === 'autor'     ? ['person'] :
    ['volume']   // comics: volumes only — issues rarely have person_credits in list endpoint

  // Strip #N, (YYYY), Vol.N from comic titles for cleaner matches
  const searchTitle = isComic ? cleanComicTitle(title) : title
  const query = publisher ? `${searchTitle} ${publisher}` : searchTitle
  const results = await searchComicVine(query, resources, 10)
  if (!results.length) return null

  const best = isComic
    ? pickBestVolume(results, searchTitle)
    : (results.find(r => r.name?.toLowerCase() === searchTitle.toLowerCase()) ?? results[0])

  const base: CVEnrichmentResult = {
    cvId:         best.id,
    cvUrl:        best.site_detail_url,
    resourceType: best.resource_type,
    name:         best.name,
    deck:         best.deck,
    coverImageUrl: best.image?.original_url ?? best.image?.medium_url,
    publisher:    best.publisher?.name,
    startYear:    best.start_year,
  }

  // Fetch detail based on resource type
  if (best.resource_type === 'volume') {
    try {
      const vol = await getVolume(best.id)
      base.creators = vol.person_credits?.map(pc => ({
        name: pc.name,
        role: cvRoleToCreatorRole(pc.role),
      }))
      base.characters = vol.character_credits
      base.issueCount = vol.count_of_issues
      if (!base.coverImageUrl) base.coverImageUrl = vol.image?.original_url
    } catch { /* detail unavailable, return base */ }
  } else if (best.resource_type === 'character') {
    try {
      const char = await getCharacter(best.id)
      base.realName  = char.real_name
      base.powers    = char.powers
      base.publisher = char.publisher?.name
      const fa = char.first_appeared_in_issue
      if (fa) {
        base.firstAppearance = fa.volume
          ? `${fa.volume.name} #${fa.issue_number ?? ''}`
          : fa.name ?? undefined
      }
      if (!base.coverImageUrl) base.coverImageUrl = char.image?.original_url
    } catch {}
  } else if (best.resource_type === 'person') {
    try {
      const person = await getPerson(best.id)
      base.country            = person.country
      base.createdCharacters  = person.created_characters
      if (!base.coverImageUrl) base.coverImageUrl = person.image?.original_url
    } catch {}
  }

  return base
}
