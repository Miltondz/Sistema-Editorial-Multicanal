import { describe, it, expect } from 'vitest'
import { jaccardSimilarity, findDuplicateCandidates } from './similarity'

describe('jaccardSimilarity', () => {
  it('identical strings → 1', () => {
    expect(jaccardSimilarity('spider man comics', 'spider man comics')).toBe(1)
  })

  it('completely disjoint → 0', () => {
    expect(jaccardSimilarity('spider man', 'wonder woman')).toBe(0)
  })

  it('both empty → 1', () => {
    expect(jaccardSimilarity('', '')).toBe(1)
  })

  it('one empty → 0', () => {
    expect(jaccardSimilarity('batman', '')).toBe(0)
    expect(jaccardSimilarity('', 'batman')).toBe(0)
  })

  it('partial overlap between 0 and 1', () => {
    const sim = jaccardSimilarity('batman comics dark knight', 'batman origins dark')
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })

  it('case-insensitive', () => {
    expect(jaccardSimilarity('BATMAN', 'batman')).toBe(1)
  })

  it('punctuation stripped', () => {
    expect(jaccardSimilarity('batman!', 'batman')).toBe(1)
  })

  it('tokens of 2 chars or fewer are ignored', () => {
    // "a", "an", "is" are all <= 2 chars and filtered; both sides become empty → 1
    expect(jaccardSimilarity('a an', 'a an')).toBe(1)
  })

  it('short tokens do not contribute to overlap', () => {
    // "ok" is <=2 chars, filtered. "batman" vs "batman ok" → same token set → 1
    expect(jaccardSimilarity('batman', 'batman ok')).toBe(1)
  })
})

describe('findDuplicateCandidates', () => {
  const candidates = [
    { id: '1', title: 'Spider-Man: The Amazing Story' },
    { id: '2', title: 'Batman: Dark Knight Returns' },
    { id: '3', title: 'Wonder Woman Origins' },
    { id: '4', title: 'Spider-Man: Into the Spider-Verse' },
  ]

  it('returns matches above default threshold', () => {
    const results = findDuplicateCandidates('Spider-Man Amazing Story', candidates)
    expect(results.some(r => r.id === '1')).toBe(true)
  })

  it('excludes below threshold', () => {
    const results = findDuplicateCandidates('Spider-Man Amazing Story', candidates, 0.3)
    expect(results.some(r => r.id === '2')).toBe(false)
  })

  it('sorted by similarity descending', () => {
    const results = findDuplicateCandidates('Spider-Man story', candidates, 0.05)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity)
    }
  })

  it('caps at 5 results', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: `Spider-Man issue ${i} story` }))
    const results = findDuplicateCandidates('Spider-Man', many, 0)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('similarity on each result is between 0 and 1', () => {
    const results = findDuplicateCandidates('Spider-Man Amazing Story', candidates, 0.05)
    for (const r of results) {
      expect(r.similarity).toBeGreaterThanOrEqual(0)
      expect(r.similarity).toBeLessThanOrEqual(1)
    }
  })

  it('returns id and title on each result', () => {
    const results = findDuplicateCandidates('Spider-Man Amazing Story', candidates, 0.1)
    for (const r of results) {
      expect(r.id).toBeDefined()
      expect(r.title).toBeDefined()
    }
  })

  it('empty candidates → []', () => {
    expect(findDuplicateCandidates('Batman', [], 0.3)).toEqual([])
  })

  it('threshold 0 includes everything', () => {
    const results = findDuplicateCandidates('Batman', candidates, 0)
    expect(results.length).toBe(candidates.length)
  })
})
