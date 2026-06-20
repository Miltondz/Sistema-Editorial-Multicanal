// Pure logic extracted from convex/contentItems.ts so vitest can import without Convex runtime.
// ponytail: two extractions (applySecondary + VALID_TRANSITIONS) to unblock unit tests

export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:       ['researching', 'in_review', 'approved', 'archived'],
  researching: ['in_review', 'approved', 'draft'],
  in_review:   ['approved', 'draft', 'blocked'],
  approved:    ['scheduled', 'published', 'archived'],
  scheduled:   ['published', 'approved'],
  published:   ['archived', 'approved'],
  archived:    [],
  blocked:     ['in_review'],
}

export interface SecondaryArgs {
  status?: string
  contentType?: string
  contentOrigin?: string
  sourcePlatform?: string
  enrichedManually?: boolean
  needsReview?: boolean
}

export function applySecondary(
  base: any,
  usedFields: string[],
  args: SecondaryArgs
): any {
  let q = base
  if (!usedFields.includes('status') && args.status)
    q = q.filter((f: any) => f.eq(f.field('status'), args.status!))
  if (!usedFields.includes('contentType') && args.contentType)
    q = q.filter((f: any) => f.eq(f.field('contentType'), args.contentType!))
  if (!usedFields.includes('contentOrigin') && args.contentOrigin)
    q = q.filter((f: any) => f.eq(f.field('contentOrigin'), args.contentOrigin!))
  if (args.sourcePlatform)
    q = q.filter((f: any) => f.eq(f.field('sourcePlatform'), args.sourcePlatform!))
  if (args.enrichedManually !== undefined)
    q = q.filter((f: any) => f.eq(f.field('enrichedManually'), args.enrichedManually!))
  if (args.needsReview !== undefined)
    q = q.filter((f: any) => f.eq(f.field('needsReview'), args.needsReview!))
  return q
}
