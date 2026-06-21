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
  first_appeared_in_issue?: CVRef & { volume?: CVRef }
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
export async function getRecentIssues(dateFrom: string, dateTo: string, limit = 20): Promise<CVIssue[]> {
  return cvFetch<CVIssue[]>('/issues/', {
    filter:     `cover_date:${dateFrom}|${dateTo}`,
    sort:       'cover_date:desc',
    limit:      String(limit),
    field_list: 'id,name,issue_number,deck,image,cover_date,store_date,volume,character_credits,person_credits,site_detail_url',
  })
}

export async function getPublisherVolumes(publisherId: number, limit = 20): Promise<CVVolume[]> {
  return cvFetch<CVVolume[]>('/volumes/', {
    filter:     `publisher:${publisherId}`,
    sort:       'date_last_updated:desc',
    limit:      String(limit),
    field_list: 'id,name,deck,image,publisher,start_year,count_of_issues,person_credits,site_detail_url',
  })
}

// ── Higher-level compositions ─────────────────────────────────────────────

// Search + get detail in one call. Returns null if not found.
export async function findVolume(title: string, publisher?: string): Promise<CVVolume | null> {
  const query = publisher ? `${title} ${publisher}` : title
  const results = await searchComicVine(query, ['volume'], 5)
  if (!results.length) return null
  const best = results.find(r => r.name?.toLowerCase() === title.toLowerCase()) ?? results[0]
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

export async function searchPublisher(name: string): Promise<{ id: number; name: string } | null> {
  const results = await searchComicVine(name, ['publisher'], 3)
  if (!results.length) return null
  const best = results.find(r => r.name?.toLowerCase().includes(name.toLowerCase())) ?? results[0]
  return { id: best.id, name: best.name }
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
  const resources: CVResource[] =
    contentType === 'personaje' ? ['character'] :
    contentType === 'autor'     ? ['person'] :
    ['volume', 'issue']

  const query = publisher ? `${title} ${publisher}` : title
  const results = await searchComicVine(query, resources, 5)
  if (!results.length) return null

  const best = results.find(r => r.name?.toLowerCase() === title.toLowerCase()) ?? results[0]

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
          ? `${fa.volume.name} #${(fa as any).issue_number ?? ''}`
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
