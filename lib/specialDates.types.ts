export type SpecialDateCategory =
  | 'character_birthday'
  | 'creator_birthday'
  | 'creator_death'
  | 'first_appearance'
  | 'series_anniversary'
  | 'award'
  | 'industry_milestone'
  | 'organization_founded'
  | 'cultural_event'

export type DiversityTag =
  | 'black' | 'latinx' | 'asian' | 'indigenous' | 'middle_eastern'
  | 'lgbtq' | 'transgender' | 'disability' | 'women' | 'nonbinary'
  | 'multiracial' | 'jewish' | 'muslim' | 'international'

export interface SpecialDateEntity {
  name: string
  alias: string | null
  type: 'character' | 'person'
  universe: string | null
  image_search_hint: string
}

export interface SpecialDateSource {
  url: string
  site_name: string
  title: string
  verified: boolean
}

export interface SpecialDateBannerImage {
  url: string | null
  source: string | null
  license: string | null
  alt_text: string
  fallback_search_query: string
}

export interface SpecialDateGeneratedContent {
  teaser: string
  hashtags: string[]
}

export interface SpecialDate {
  date_mmdd: string
  year: number | null
  title: string
  title_short: string
  description: string
  fun_fact: string | null
  category: SpecialDateCategory
  diversity_tags: DiversityTag[]
  entity: SpecialDateEntity
  generated_content: SpecialDateGeneratedContent
  banner_image: SpecialDateBannerImage
  sources: SpecialDateSource[]
  confidence: 'high' | 'medium' | 'low'
  suggested_post_tags: string[]
  related_search_terms: string[]
}
