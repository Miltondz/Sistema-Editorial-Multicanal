export type Confidence = 'high' | 'medium' | 'low'

export type InclusionType =
  | 'protagonist_diversity'
  | 'character_diversity'
  | 'writer_diversity'
  | 'artist_diversity'
  | 'cover_diversity'
  | 'lgbtq_representation'

export type DiversityTag =
  | 'black' | 'latinx' | 'asian' | 'indigenous' | 'middle_eastern'
  | 'lgbtq' | 'transgender' | 'disability' | 'women' | 'nonbinary'
  | 'multiracial' | 'jewish' | 'muslim' | 'international'

export interface SearchParams {
  dateMode: 'absolute' | 'relative_resolved'
  dateFrom: string
  dateTo: string
  maxResults: number
  publishers?: string[]
  minConfidence?: Confidence
  requireImages?: boolean
  maxImagesPerResult?: number
}

export interface ResearchSource {
  name: string
  url: string
  purpose: 'discovery' | 'metadata' | 'validation' | 'image_verification'
}

export interface DateEvidence {
  status: 'confirmed' | 'estimated' | 'unverified'
  note: string
  source_urls: string[]
}

export interface ComicImage {
  url: string
  type: 'main_cover' | 'variant_cover' | 'issue_image' | 'publisher_image'
  source: string
  source_page: string
  image_evidence_status: 'confirmed' | 'inferred' | 'unverified'
  notes: string
}

export interface DiversePerson {
  name: string
  diversity_tags: string[]
  validation_status: 'confirmed' | 'inferred' | 'unverified'
  evidence: string
  source_urls: string[]
}

export interface DiverseArtist extends DiversePerson {
  role: 'interior' | 'artist' | 'penciller' | 'inker' | 'colorist'
}

export interface ComicCreators {
  writers: DiversePerson[]
  artists: DiverseArtist[]
  cover_artists: DiversePerson[]
}

export interface ComicCharacter {
  name: string
  category: 'protagonist' | 'main_cast' | 'supporting' | 'cover_character' | 'cameo'
  diversity_tags: string[]
  validation_status: 'confirmed' | 'inferred' | 'unverified'
  evidence: string
  source_urls: string[]
}

export interface InclusionReason {
  type: InclusionType
  priority: number
  description: string
  source_urls: string[]
}

export interface VerificationLinks {
  primary_issue_page: string
  secondary_sources: string[]
  variant_pages: string[]
  character_validation: string[]
  creator_validation: string[]
  image_validation: string[]
}

export interface ComicResult {
  title: string
  issue: string
  full_title: string
  year: number
  publisher: string
  release_date: string
  date_evidence: DateEvidence
  summary: string
  images: ComicImage[]
  creators: ComicCreators
  characters: ComicCharacter[]
  inclusion_reasons: InclusionReason[]
  verification_links: VerificationLinks
  confidence: Confidence
  notes: string
}

export interface ComicsResearchResponse {
  query: {
    date_mode: string
    date_from: string
    date_to: string
    max_results: number
  }
  sources_used: ResearchSource[]
  count: number
  results: ComicResult[]
}
