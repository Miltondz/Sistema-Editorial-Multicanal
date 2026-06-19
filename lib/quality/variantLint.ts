// Pure linter — no external deps, safe to run server or client side

export interface LintViolation {
  field: 'headline' | 'bodyText' | 'ctaText'
  rule: string
  match: string
}

const BANNED_PHRASES = [
  /follow us/i,
  /share this/i,
  /stay tuned/i,
  /coming soon/i,
  /don't miss/i,
  /check out our/i,
  /subscribe/i,
  /click here/i,
  /like and (re)?share/i,
  /\bDM\b.*for more/i,
]

const FUTURE_PROMO_PATTERNS = [
  /we('ll| will) be posting/i,
  /next (week|month|time|episode)/i,
  /upcoming (post|content|series)/i,
  /more (content|posts|articles) on the way/i,
]

const SELF_REF_PATTERNS = [
  /in this post/i,
  /in today'?s post/i,
  /as (mentioned|noted) (above|below)/i,
]

const ALL_RULES: Array<{ pattern: RegExp; rule: string }> = [
  ...BANNED_PHRASES.map(p => ({ pattern: p, rule: 'Banned phrase' })),
  ...FUTURE_PROMO_PATTERNS.map(p => ({ pattern: p, rule: 'Future promo' })),
  ...SELF_REF_PATTERNS.map(p => ({ pattern: p, rule: 'Self-referential' })),
]

export function lintVariant(variant: {
  headline?: string
  bodyText?: string
  ctaText?: string
}): LintViolation[] {
  const violations: LintViolation[] = []
  const fields: Array<{ key: 'headline' | 'bodyText' | 'ctaText'; text: string }> = [
    { key: 'headline', text: variant.headline ?? '' },
    { key: 'bodyText', text: variant.bodyText ?? '' },
    { key: 'ctaText',  text: variant.ctaText  ?? '' },
  ]
  for (const { key, text } of fields) {
    if (!text) continue
    for (const { pattern, rule } of ALL_RULES) {
      const m = text.match(pattern)
      if (m) {
        violations.push({ field: key, rule, match: m[0] })
      }
    }
  }
  return violations
}

export function hasViolations(variant: Parameters<typeof lintVariant>[0]): boolean {
  return lintVariant(variant).length > 0
}
