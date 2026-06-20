import { describe, it, expect } from 'vitest'
import { VALID_TRANSITIONS, applySecondary } from './contentFilters'

// ── Mock Convex query builder ─────────────────────────────────────────────
// Tracks which fields applySecondary passes to f.field() — enough to verify
// which filters get applied without needing the real Convex runtime.

function mockBuilder() {
  const filtered: string[] = []
  const builder: any = {
    filter(fn: (f: any) => any) {
      const spy = {
        eq: (a: any, _b: any) => a,
        field: (name: string) => { filtered.push(name); return name },
      }
      fn(spy)
      return builder
    },
    _filtered: filtered,
  }
  return builder
}

// ── VALID_TRANSITIONS ─────────────────────────────────────────────────────

describe('VALID_TRANSITIONS', () => {
  it('draft can move to researching, in_review, approved, archived', () => {
    expect(VALID_TRANSITIONS.draft).toEqual(['researching', 'in_review', 'approved', 'archived'])
  })

  it('approved can move to scheduled, published, archived', () => {
    expect(VALID_TRANSITIONS.approved).toEqual(['scheduled', 'published', 'archived'])
  })

  it('archived has no valid transitions', () => {
    expect(VALID_TRANSITIONS.archived).toEqual([])
  })

  it('blocked can only move to in_review', () => {
    expect(VALID_TRANSITIONS.blocked).toEqual(['in_review'])
  })

  it('in_review cannot move to published directly', () => {
    expect(VALID_TRANSITIONS.in_review).not.toContain('published')
  })

  it('published can return to approved (unpublish)', () => {
    expect(VALID_TRANSITIONS.published).toContain('approved')
  })

  it('all defined statuses have an entry', () => {
    const statuses = ['draft', 'researching', 'in_review', 'approved', 'scheduled', 'published', 'archived', 'blocked']
    for (const s of statuses) expect(VALID_TRANSITIONS[s]).toBeDefined()
  })
})

// ── applySecondary ────────────────────────────────────────────────────────

describe('applySecondary — field skipping when in usedFields', () => {
  it('skips status filter when status is in usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, ['status'], { status: 'approved' })
    expect(b._filtered).not.toContain('status')
  })

  it('applies status filter when NOT in usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, [], { status: 'approved' })
    expect(b._filtered).toContain('status')
  })

  it('skips contentType when in usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, ['contentType'], { contentType: 'comic' })
    expect(b._filtered).not.toContain('contentType')
  })

  it('applies contentType when not in usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, [], { contentType: 'comic' })
    expect(b._filtered).toContain('contentType')
  })

  it('skips contentOrigin when in usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, ['contentOrigin'], { contentOrigin: 'imported' })
    expect(b._filtered).not.toContain('contentOrigin')
  })

  it('applies contentOrigin when not in usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, [], { contentOrigin: 'imported' })
    expect(b._filtered).toContain('contentOrigin')
  })
})

describe('applySecondary — always-applied filters', () => {
  it('always applies sourcePlatform regardless of usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, ['sourcePlatform'], { sourcePlatform: 'tumblr' })
    expect(b._filtered).toContain('sourcePlatform')
  })

  it('always applies enrichedManually when defined', () => {
    const b = mockBuilder()
    applySecondary(b, ['enrichedManually'], { enrichedManually: false })
    expect(b._filtered).toContain('enrichedManually')
  })

  it('applies enrichedManually when false (undefined-check, not falsy-check)', () => {
    const b = mockBuilder()
    applySecondary(b, [], { enrichedManually: false })
    expect(b._filtered).toContain('enrichedManually')
  })

  it('skips enrichedManually when undefined', () => {
    const b = mockBuilder()
    applySecondary(b, [], { enrichedManually: undefined })
    expect(b._filtered).not.toContain('enrichedManually')
  })

  it('always applies needsReview when defined', () => {
    const b = mockBuilder()
    applySecondary(b, ['needsReview'], { needsReview: true })
    expect(b._filtered).toContain('needsReview')
  })

  it('applies needsReview when false (undefined-check, not falsy-check)', () => {
    const b = mockBuilder()
    applySecondary(b, [], { needsReview: false })
    expect(b._filtered).toContain('needsReview')
  })

  it('skips needsReview when undefined', () => {
    const b = mockBuilder()
    applySecondary(b, [], { needsReview: undefined })
    expect(b._filtered).not.toContain('needsReview')
  })
})

describe('applySecondary — no filters when args are absent', () => {
  it('returns base unchanged when no args provided', () => {
    const b = mockBuilder()
    applySecondary(b, [], {})
    expect(b._filtered).toHaveLength(0)
  })

  it('applies only the args that are present', () => {
    const b = mockBuilder()
    applySecondary(b, [], { status: 'draft', needsReview: true })
    expect(b._filtered).toContain('status')
    expect(b._filtered).toContain('needsReview')
    expect(b._filtered).not.toContain('contentType')
    expect(b._filtered).not.toContain('sourcePlatform')
  })
})

describe('applySecondary — stacking: multiple filters chain fluently', () => {
  it('all args applied when none in usedFields', () => {
    const b = mockBuilder()
    applySecondary(b, [], {
      status:           'approved',
      contentType:      'comic',
      contentOrigin:    'imported',
      sourcePlatform:   'tumblr',
      enrichedManually: true,
      needsReview:      false,
    })
    expect(b._filtered).toContain('status')
    expect(b._filtered).toContain('contentType')
    expect(b._filtered).toContain('contentOrigin')
    expect(b._filtered).toContain('sourcePlatform')
    expect(b._filtered).toContain('enrichedManually')
    expect(b._filtered).toContain('needsReview')
    expect(b._filtered).toHaveLength(6)
  })

  it('usedFields exempts only index-backed fields, not always-applied ones', () => {
    const b = mockBuilder()
    applySecondary(b, ['status', 'contentType', 'contentOrigin'], {
      status:         'approved',
      contentType:    'comic',
      contentOrigin:  'imported',
      sourcePlatform: 'tumblr',
      needsReview:    true,
    })
    expect(b._filtered).not.toContain('status')
    expect(b._filtered).not.toContain('contentType')
    expect(b._filtered).not.toContain('contentOrigin')
    expect(b._filtered).toContain('sourcePlatform')
    expect(b._filtered).toContain('needsReview')
    expect(b._filtered).toHaveLength(2)
  })
})
