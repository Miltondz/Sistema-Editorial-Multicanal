import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  TUMBLR_FOOTER,
  buildFullTumblrCaption,
  stripHtml,
  assembleXTweet,
  buildTumblrPayload,
  buildXPayload,
} from './payloads'

// ── buildFullTumblrCaption ────────────────────────────────────────────────

describe('buildFullTumblrCaption', () => {
  it('joins headline, body, footer', () => {
    const result = buildFullTumblrCaption('My Headline', '<p>Body text</p>')
    expect(result).toContain('<h2>My Headline</h2>')
    expect(result).toContain('<p>Body text</p>')
    expect(result).toContain(TUMBLR_FOOTER)
  })

  it('includes footer even when body is empty', () => {
    const result = buildFullTumblrCaption('Headline', '')
    expect(result).toContain(TUMBLR_FOOTER)
    expect(result).toContain('<h2>Headline</h2>')
  })
})

// ── stripHtml ─────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('strips tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('replaces HTML entities with space', () => {
    const result = stripHtml('A&amp;B')
    expect(result).not.toContain('&amp;')
  })

  it('collapses whitespace', () => {
    expect(stripHtml('<p>  hello   world  </p>')).toBe('hello world')
  })

  it('empty string returns empty', () => {
    expect(stripHtml('')).toBe('')
  })

  it('plain text unchanged', () => {
    expect(stripHtml('no tags here')).toBe('no tags here')
  })
})

// ── assembleXTweet ────────────────────────────────────────────────────────

describe('assembleXTweet', () => {
  it('includes headline, body, CTA', () => {
    const { text } = assembleXTweet({ headline: 'Title', bodyText: 'Body.' })
    expect(text).toContain('Title')
    expect(text).toContain('Body.')
    expect(text).toContain('linktr.ee/HeroesInColor')
  })

  it('total length never exceeds 280', () => {
    const long = 'word '.repeat(100)
    const { text } = assembleXTweet({ headline: 'Short title', bodyText: long })
    expect(text.length).toBeLessThanOrEqual(280)
  })

  it('sets truncated=true when body is cut', () => {
    const long = 'a'.repeat(300)
    const { truncated } = assembleXTweet({ headline: 'Short', bodyText: long })
    expect(truncated).toBe(true)
  })

  it('sets truncated=false when content fits', () => {
    const { truncated } = assembleXTweet({ headline: 'Hi', bodyText: 'Short.' })
    expect(truncated).toBe(false)
  })

  it('works with no body', () => {
    const { text, truncated } = assembleXTweet({ headline: 'Only headline' })
    expect(text).toContain('Only headline')
    expect(truncated).toBe(false)
  })

  it('works with no headline', () => {
    const { text } = assembleXTweet({ bodyText: 'Just body.' })
    expect(text).toContain('Just body.')
    expect(text).toContain('linktr.ee/HeroesInColor')
  })

  it('strips HTML from headline and body', () => {
    const { text } = assembleXTweet({ headline: '<b>Bold</b>', bodyText: '<p>Para</p>' })
    expect(text).not.toContain('<b>')
    expect(text).not.toContain('<p>')
    expect(text).toContain('Bold')
    expect(text).toContain('Para')
  })

  it('length field matches text.length', () => {
    const result = assembleXTweet({ headline: 'Title', bodyText: 'Body content.' })
    expect(result.length).toBe(result.text.length)
  })
})

// ── buildTumblrPayload ────────────────────────────────────────────────────

const BASE_VARIANT = { headline: 'Test Headline', bodyText: '<p>Some body text</p>', ctaText: '#hero, #comics' }
const BASE_ITEM    = { contentType: 'comic', representationTags: ['black'], themeTags: ['superhero'], buyLink: undefined, coverImageUrl: undefined }

describe('buildTumblrPayload', () => {
  beforeEach(() => { process.env.TUMBLR_BLOG_NAME = 'test-blog' })
  afterEach(()  => { delete process.env.TUMBLR_BLOG_NAME })

  it('photo post when images present', () => {
    const result = buildTumblrPayload(BASE_VARIANT, BASE_ITEM, [{ publicUrl: 'https://cdn.com/img.jpg' }])
    expect(result.type).toBe('photo')
    expect(result.imageUrls).toEqual(['https://cdn.com/img.jpg'])
    expect(result.caption).toContain('Test Headline')
    expect(result.body).toBeUndefined()
  })

  it('link post when no images but buyLink present', () => {
    const item = { ...BASE_ITEM, buyLink: 'https://buy.com/book' }
    const result = buildTumblrPayload(BASE_VARIANT, item, [])
    expect(result.type).toBe('link')
    expect(result.linkUrl).toBe('https://buy.com/book')
    expect(result.linkTitle).toBe('Test Headline')
  })

  it('text post when no images and no buyLink', () => {
    const result = buildTumblrPayload(BASE_VARIANT, BASE_ITEM, [])
    expect(result.type).toBe('text')
    expect(result.body).toContain('Test Headline')
    expect(result.imageUrls).toBeUndefined()
  })

  it('falls back to coverImageUrl when no mediaAssets', () => {
    const item = { ...BASE_ITEM, coverImageUrl: 'https://cdn.com/cover.jpg' }
    const result = buildTumblrPayload(BASE_VARIANT, item, [])
    expect(result.type).toBe('photo')
    expect(result.imageUrls).toEqual(['https://cdn.com/cover.jpg'])
  })

  it('mediaAssets take priority over coverImageUrl', () => {
    const item = { ...BASE_ITEM, coverImageUrl: 'https://cdn.com/cover.jpg' }
    const result = buildTumblrPayload(BASE_VARIANT, item, [{ publicUrl: 'https://cdn.com/asset.jpg' }])
    expect(result.imageUrls).toEqual(['https://cdn.com/asset.jpg'])
  })

  it('uses only first image (Tumblr single-photo)', () => {
    const assets = [{ publicUrl: 'https://cdn.com/1.jpg' }, { publicUrl: 'https://cdn.com/2.jpg' }]
    const result = buildTumblrPayload(BASE_VARIANT, BASE_ITEM, assets)
    expect(result.imageUrls).toHaveLength(1)
    expect(result.imageUrls![0]).toBe('https://cdn.com/1.jpg')
  })

  it('splits ctaText into tags, strips leading #', () => {
    const result = buildTumblrPayload({ ...BASE_VARIANT, ctaText: '#hero, #comics, #marvel' }, BASE_ITEM, [])
    expect(result.tags).toContain('hero')
    expect(result.tags).toContain('comics')
    expect(result.tags).toContain('marvel')
  })

  it('always includes contentType and brand tag', () => {
    const result = buildTumblrPayload(BASE_VARIANT, BASE_ITEM, [])
    expect(result.tags).toContain('comic')
    expect(result.tags).toContain('superherosincolor')
  })

  it('deduplicates tags', () => {
    const item = { ...BASE_ITEM, representationTags: ['superherosincolor'], themeTags: ['comic'] }
    const result = buildTumblrPayload(BASE_VARIANT, item, [])
    expect(new Set(result.tags).size).toBe(result.tags.length)
  })

  it('caps tags at 30', () => {
    const item = {
      ...BASE_ITEM,
      representationTags: Array.from({ length: 20 }, (_, i) => `rep${i}`),
      themeTags:          Array.from({ length: 15 }, (_, i) => `theme${i}`),
    }
    const result = buildTumblrPayload(BASE_VARIANT, item, [])
    expect(result.tags.length).toBeLessThanOrEqual(30)
  })

  it('blogName comes from TUMBLR_BLOG_NAME env', () => {
    const result = buildTumblrPayload(BASE_VARIANT, BASE_ITEM, [])
    expect(result.blogName).toBe('test-blog')
  })
})

// ── buildXPayload ─────────────────────────────────────────────────────────

describe('buildXPayload', () => {
  const variant = { headline: 'Test Title', bodyText: 'Body content here.' }
  const item    = { buyLink: undefined }

  it('text comes from assembleXTweet (includes CTA)', () => {
    const result = buildXPayload(variant, item, [])
    expect(result.text).toContain('Test Title')
    expect(result.text).toContain('linktr.ee/HeroesInColor')
  })

  it('passes up to 4 image urls', () => {
    const assets = Array.from({ length: 6 }, (_, i) => ({ publicUrl: `https://cdn.com/${i}.jpg` }))
    const result = buildXPayload(variant, item, assets)
    expect(result.imageUrls).toHaveLength(4)
  })

  it('empty imageUrls when no assets', () => {
    const result = buildXPayload(variant, item, [])
    expect(result.imageUrls).toHaveLength(0)
  })
})
