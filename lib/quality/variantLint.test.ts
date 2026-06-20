import { describe, it, expect } from 'vitest'
import { lintVariant, hasViolations } from './variantLint'

describe('lintVariant', () => {
  it('returns [] for clean content', () => {
    expect(lintVariant({ headline: 'Superman turns 85', bodyText: 'The Man of Steel debuted in 1938.' })).toEqual([])
  })

  it('flags "follow us"', () => {
    const v = lintVariant({ headline: 'Please follow us for more!' })
    expect(v).toHaveLength(1)
    expect(v[0].field).toBe('headline')
    expect(v[0].rule).toBe('Banned phrase')
    expect(v[0].match.toLowerCase()).toContain('follow us')
  })

  it('flags "subscribe"', () => {
    const v = lintVariant({ ctaText: 'Subscribe to our newsletter' })
    expect(v.some(x => x.rule === 'Banned phrase')).toBe(true)
    expect(v[0].field).toBe('ctaText')
  })

  it('flags "click here"', () => {
    const v = lintVariant({ bodyText: 'Click here to learn more' })
    expect(v.some(x => x.rule === 'Banned phrase')).toBe(true)
  })

  it('flags future promo — "next week"', () => {
    const v = lintVariant({ bodyText: 'Next week we have more content.' })
    expect(v.some(x => x.rule === 'Future promo')).toBe(true)
  })

  it('flags future promo — "we will be posting"', () => {
    const v = lintVariant({ bodyText: "We'll be posting more soon." })
    expect(v.some(x => x.rule === 'Future promo')).toBe(true)
  })

  it('flags self-referential — "as mentioned above"', () => {
    const v = lintVariant({ bodyText: 'As mentioned above, this hero is iconic.' })
    expect(v.some(x => x.rule === 'Self-referential')).toBe(true)
  })

  it('flags "in this post"', () => {
    const v = lintVariant({ bodyText: 'In this post we cover Black Panther.' })
    expect(v.some(x => x.rule === 'Self-referential')).toBe(true)
  })

  it('strips HTML from bodyText before checking', () => {
    const v = lintVariant({ bodyText: '<p>Great superhero story.</p>' })
    expect(v).toHaveLength(0)
  })

  it('reports correct field for each violation', () => {
    const v = lintVariant({ headline: 'Follow us!', ctaText: 'Click here' })
    const fields = v.map(x => x.field)
    expect(fields).toContain('headline')
    expect(fields).toContain('ctaText')
  })

  it('returns multiple violations', () => {
    const v = lintVariant({ bodyText: 'Follow us and subscribe! Next week more.' })
    expect(v.length).toBeGreaterThanOrEqual(2)
  })

  it('empty variant returns []', () => {
    expect(lintVariant({})).toEqual([])
  })

  it('case-insensitive matching', () => {
    const v = lintVariant({ headline: 'STAY TUNED for more!' })
    expect(v.some(x => x.rule === 'Banned phrase')).toBe(true)
  })
})

describe('hasViolations', () => {
  it('false for clean content', () => {
    expect(hasViolations({ headline: 'Clean title', bodyText: 'Good content.' })).toBe(false)
  })

  it('true when violation exists', () => {
    expect(hasViolations({ headline: 'Follow us!' })).toBe(true)
  })
})
