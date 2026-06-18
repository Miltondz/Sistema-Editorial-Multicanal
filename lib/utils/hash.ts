// Uses Web Crypto API (works in Convex V8 runtime, Node.js ≥15, and browsers)
export async function computeCanonicalHash(item: {
  title: string
  sourcePostUrl?: string | null
  sourcePostId?: string | null
}): Promise<string> {
  const input = [
    item.title.toLowerCase().trim(),
    item.sourcePostUrl ?? '',
    item.sourcePostId ?? '',
  ].join('|')

  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.slice(0, 16)
}
