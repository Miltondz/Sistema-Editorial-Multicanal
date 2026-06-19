// Pure Jaccard similarity over token sets — no external deps

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  )
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const t of setA) if (setB.has(t)) intersection++
  const union = setA.size + setB.size - intersection
  return intersection / union
}

export interface DuplicateCandidate {
  id: string
  title: string
  similarity: number
}

export function findDuplicateCandidates(
  query: string,
  candidates: Array<{ id: string; title: string }>,
  threshold = 0.35
): DuplicateCandidate[] {
  return candidates
    .map(c => ({ id: c.id, title: c.title, similarity: jaccardSimilarity(query, c.title) }))
    .filter(c => c.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
}
