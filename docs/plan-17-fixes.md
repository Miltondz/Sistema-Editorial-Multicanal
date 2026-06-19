# Implementation Plan — 17 Fixes (3 Tiers)

SuperheroesInColor editorial CMS · Next.js 14 App Router + Convex.
All contracts grounded against real code (`convex/schema.ts`, etc.) and are compilable against the existing codebase.

Conventions referenced throughout:
- `channelV = v.union(v.literal('tumblr'), v.literal('x'))`
- Schema field/index names taken verbatim from `convex/schema.ts`.
- AI variant generation entrypoint: `api.actions.ai.generateVariant` (args `{ contentItemId, channel }`).
- `internal.auditEvents.log({ entityType, entityId?, eventType, payloadJson? })` already exists; reuse it.

---

## TIER 1 (S complexity)

### T1-1: Dashboard CTA/search dead buttons
**Files:** `app/(dashboard)/page.tsx`

**What changes:**
- Replace the static `<button>` "Nuevo contenido" (lines 42-50) with a Next.js `<Link href="/catalog/new">` keeping the same styling.
- Replace the static search `<div>` (lines 29-34) with a controlled `<input>` inside a `<form onSubmit>` that pushes to `/catalog?q=<encoded>`.
- Add `'use client'` already present; import `Link from 'next/link'` and `useRouter` from `next/navigation`.

**Contracts:**
```typescript
// app/(dashboard)/page.tsx — new local state + handler
const router = useRouter()
const [search, setSearch] = useState('')

function handleSearchSubmit(e: React.FormEvent) {
  e.preventDefault()
  const q = search.trim()
  router.push(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog')
}

// CTA becomes:
// <Link href="/catalog/new" className="px-4 py-2 rounded-xl text-sm font-medium text-white …">…</Link>
```

**Execution notes:** Catalog page must read `?q=` — see T1-2; do that read in the same pass so the search lands in the filter state. Keep existing inline `style={{ background: '#6366F1' }}` on the Link.

---

### T1-2: Catalog filters lost on search
**Files:** `convex/contentItems.ts` (`list` query), `app/(dashboard)/catalog/page.tsx`

**What changes:**
- In `contentItems.list`, the search branch (lines 78-83) currently ignores `status`/`contentType`. The `search_title` search index declares `filterFields: ['contentType', 'status', 'contentOrigin']`, so chain `.eq()` for whichever filters are present.
- In `catalog/page.tsx`, initialize `filters.search` from `useSearchParams().get('q')` so the dashboard handoff (T1-1) works.

**Contracts:**
```typescript
// convex/contentItems.ts — replace search branch inside list.handler
if (args.search && args.search.trim().length > 0) {
  return await ctx.db
    .query('contentItems')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withSearchIndex('search_title', (q: any) => {
      let s = q.search('title', args.search!)
      if (args.status)        s = s.eq('status', args.status)
      if (args.contentType)   s = s.eq('contentType', args.contentType)
      if (args.contentOrigin) s = s.eq('contentOrigin', args.contentOrigin)
      return s
    })
    .paginate(args.paginationOpts)
}
```
```typescript
// app/(dashboard)/catalog/page.tsx
import { useSearchParams } from 'next/navigation'
const sp = useSearchParams()
const [filters, setFilters] = useState<FilterState>(() => ({
  ...INITIAL_FILTERS,
  search: sp.get('q') ?? '',
}))
```

**Execution notes:** Only `contentType`, `status`, `contentOrigin` are valid `eq` filters on this search index — do NOT add `sourcePlatform`/`needsReview` to the `.eq()` chain (they are not in `filterFields` and will throw). `sourcePlatform`/`enrichedManually`/`needsReview` filters simply don't combine with search; that's acceptable.

---

### T1-3: "Generate both variants" button
**Files:** `components/editor/VariantPanel.tsx`

**What changes:**
- In `VariantPanel` (the parent, lines 394+), add a "Generar ambas variantes" button above the two `ChannelVariantCard`s.
- Handler calls `generateVariant` twice (tumblr then x) sequentially via `useAction(api.actions.ai.generateVariant)`. Sequential avoids two simultaneous OpenRouter calls and keeps error attribution clear.

**Contracts:**
```typescript
// components/editor/VariantPanel.tsx — inside VariantPanel
const generateVariant = useAction(api.actions.ai.generateVariant as any)
const [genBoth, setGenBoth] = useState(false)
const [genBothError, setGenBothError] = useState<string | null>(null)

async function handleGenerateBoth() {
  setGenBoth(true); setGenBothError(null)
  try {
    await generateVariant({ contentItemId, channel: 'tumblr' } as any)
    await generateVariant({ contentItemId, channel: 'x' } as any)
  } catch (err) {
    setGenBothError(err instanceof Error ? err.message : 'Error generando variantes')
  } finally {
    setGenBoth(false)
  }
}
```

**Execution notes:** `generateVariant` returns `{ headline, bodyText, ctaText, modelUsed }` and writes via `applyGeneration`, so the `listByItem` subscriptions inside each card refresh automatically — no manual refetch. Button label while running: "Generando ambas…".

---

### T1-4: X tweet assembled-length preview
**Files:** `components/editor/VariantPanel.tsx`

**What changes:**
- In `ChannelVariantCard`, when `channel === 'x'`, render the final assembled tweet length using the SAME assembly logic as `buildXPayload` in `convex/actions/publisher.ts` (lines 91-116): `headline + "\n\n" + body + "\n\n" + cta`, cta fixed to `linktr.ee/HeroesInColor`, 280 budget.
- Add a small helper in the component to compute assembled text + char count from the active variant.

**Contracts:**
```typescript
// components/editor/VariantPanel.tsx — pure helper mirroring buildXPayload
function assembleXPreview(v: { headline?: string; bodyText?: string }): { text: string; length: number } {
  const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  const headline = stripHtml(v.headline ?? '')
  const cta = 'linktr.ee/HeroesInColor'
  let body = stripHtml(v.bodyText ?? '')
  const overhead = headline.length + 4 + cta.length
  const maxBody = Math.max(0, 280 - overhead - 4)
  if (body.length > maxBody) body = body.slice(0, maxBody - 3) + '...'
  const text = [headline, body, cta].filter(Boolean).join('\n\n')
  return { text, length: text.length }
}
// Render under X preview: `{length}/280` (red if length > 280).
```

**Execution notes:** Keep `assembleXPreview` byte-for-byte aligned with `buildXPayload` so the preview never disagrees with what publishes. Only render for `channel === 'x'` and when `activeVariant` exists.

---

### T1-5: Performance metrics in analytics
**Files:** `app/(dashboard)/analytics/page.tsx`

**What changes:**
- Add a new "Rendimiento" section wiring `api.performanceMetrics.listRecentByChannel` (already exists, returns impressions/engagements/likes/reposts/reblogs/linkClicks per successful log).
- Aggregate totals + render a list of recent posts with their metrics. Pass the current `channel` toggle through.

**Contracts:**
```typescript
// app/(dashboard)/analytics/page.tsx
const perf = useQuery(api.performanceMetrics.listRecentByChannel, {
  channel,            // Channel | undefined — matches optional arg
  limit: 100,
}) as Array<{
  _id: string
  _creationTime: number
  channel: 'tumblr' | 'x'
  externalPostUrl?: string
  impressions: number
  engagements: number
  likes: number
  reposts: number
  reblogs: number
  linkClicks: number
}> | undefined

const perfTotals = useMemo(() => {
  if (!perf) return null
  return perf.reduce((acc, m) => ({
    impressions: acc.impressions + m.impressions,
    engagements: acc.engagements + m.engagements,
    likes:       acc.likes + m.likes,
    linkClicks:  acc.linkClicks + m.linkClicks,
  }), { impressions: 0, engagements: 0, likes: 0, linkClicks: 0 })
}, [perf])
```

**Execution notes:** `listRecentByChannel` only returns logs that HAVE a `performanceMetrics` row (it `continue`s when none). Show an empty-state ("Sin métricas registradas aún") when `perf?.length === 0` — most logs won't have metrics yet.

---

### T1-6: Sparkline "review" series flat/fake
**Files:** `convex/contentItems.ts` (`getDashboardSparklines`)

**What changes:**
- The `review` series (lines 925-930) is a flat array (current `needsReview` count repeated 10×). Replace with a real per-day series derived from `auditEvents` of `eventType: 'item.created'` where the item entered review — but simpler and accurate: count `item.approved` audit events is already used for `approved`-from-pubLogs incorrectly too. Fix `review` to count daily NEW review-entry events using `auditEvents` `by_event_type` index for `'item.created'` filtered to imported origin, OR remove the series.
- Decision: make `review` real by counting `auditEvents` with `eventType === 'item.created'` per day (proxy for items entering the pipeline/review). Keep return shape identical.

**Contracts:**
```typescript
// convex/contentItems.ts — getDashboardSparklines, replace the flat review block
const createdEvents = await ctx.db
  .query('auditEvents')
  .withIndex('by_event_type', q => q.eq('eventType', 'item.created'))
  .order('desc')
  .take(500)
const review = days.map(dayStart =>
  createdEvents.filter(e => e._creationTime >= dayStart && e._creationTime < nextDay(dayStart)).length
)
// return { review, approved, published } unchanged
```

**Execution notes:** Return type stays `{ review: number[]; approved: number[]; published: number[] }` so `KPISection` needs no change. `by_event_type` index already exists on `auditEvents`. Also fix the misleading `approved` series in the same function if time permits (currently it counts tumblr pubLogs, not approvals) — but that is out of scope unless explicitly requested; leave `approved` as-is to avoid scope creep.

---

### T1-7: Storage blobs not deleted
**Files:** `convex/contentItems.ts` (`deleteItem`, `bulkDeleteItems`, `bulkDeleteByImportJob`)

**What changes:**
- In all three delete paths, before `ctx.db.delete(asset._id)`, call `ctx.storage.delete(asset.storageId)` (mirrors `mediaAssets.deleteAsset` which already does this at line 93).
- Wrap each storage delete in try/catch so a missing/already-deleted blob doesn't abort the whole mutation.

**Contracts:**
```typescript
// convex/contentItems.ts — in deleteItem, bulkDeleteItems, bulkDeleteByImportJob
const assets = await ctx.db
  .query('mediaAssets')
  .withIndex('by_item', q => q.eq('contentItemId', /* id */))
  .collect()
for (const a of assets) {
  try { await ctx.storage.delete(a.storageId) } catch { /* blob already gone */ }
  await ctx.db.delete(a._id)
}
```

**Execution notes:** `mediaAssets.storageId` is `v.id('_storage')` — `ctx.storage.delete` accepts it directly. Apply the identical 3-line pattern in all three loops; replace the existing `for (const a of assets) await ctx.db.delete(a._id)` lines (and remove the stale "storage blobs remain" comment at line 651).

---

## TIER 2 (M complexity)

### T2-8: Special-dates → planner bridge
**Files:** `convex/scheduleSlots.ts` (new mutation), `app/(dashboard)/special-dates/page.tsx` (button), `convex/specialDates.ts` (date normalization helper if needed)

**What changes:**
- Add `scheduleSlots.createFromSpecialDate` mutation: given a `specialDate` date string + channel + dayPart, create a `locked` slot on that date (status `'locked'`). Accept the resolved `YYYY-MM-DD` (anniversaries are `MM-DD`; resolve to the next upcoming year on the client before calling, OR pass a fully-resolved date).
- In `special-dates/page.tsx` `DateCard`, add a "Programar en planner" button that resolves the date and calls the mutation, then links to `/planner`.

**Contracts:**
```typescript
// convex/scheduleSlots.ts
export const createFromSpecialDate = mutation({
  args: {
    scheduledFor: v.string(),        // resolved YYYY-MM-DD
    channel: channelV,
    dayPart: dayPartV,
    specialDateId: v.id('specialDates'),
    title: v.string(),
  },
  handler: async (ctx, args): Promise<Id<'scheduleSlots'>> => {
    const id = await ctx.db.insert('scheduleSlots', {
      scheduledFor: args.scheduledFor,
      dayPart: args.dayPart,
      channel: args.channel,
      contentMode: 'new',
      priority: 10,
      locked: true,
      status: 'locked',
    })
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot',
      entityId: id,
      eventType: 'slot.created_from_special_date',
      payloadJson: { specialDateId: args.specialDateId, title: args.title, scheduledFor: args.scheduledFor, channel: args.channel },
    })
    return id
  },
})
```
```typescript
// app/(dashboard)/special-dates/page.tsx — date resolver for MM-DD anniversaries
function resolveSpecialDate(date: string, dateType: 'anniversary' | 'one_time'): string {
  if (dateType === 'one_time') return date           // already YYYY-MM-DD
  const [mm, dd] = date.split('-')                   // MM-DD
  const now = new Date()
  let year = now.getUTCFullYear()
  const candidate = `${year}-${mm}-${dd}`
  if (new Date(candidate + 'T00:00:00Z') < now) year += 1
  return `${year}-${mm}-${dd}`
}
const createSlotFromDate = useMutation(api.scheduleSlots.createFromSpecialDate)
```

**Execution notes:** A locked slot with no `contentItemId` is valid (schema makes `contentItemId` optional; `locked` status is in `slotStatus`). The default dayPart should be `'morning'`; let the user pick channel via a tiny inline toggle or default to `'tumblr'`. Do NOT reuse `createManual` — it forces `locked:false` and `status` from `contentItemId`.

---

### T2-9: Failed slot retry UI
**Files:** `convex/actions/publisher.ts` (new public action), `app/(dashboard)/planner/page.tsx` (retry button on failed slots)

**What changes:**
- There is currently NO public retry action — `publishSlot` is an `internalAction`. Add a thin public `retryFailedSlot` action that re-arms a failed slot to `ready` and schedules `publishSlot` with `retryCount: 0`.
- `scheduleSlots.listFailed` query already exists (returns enriched failed slots). Surface a "Reintentar ahora" button in the planner failed-slots area.

**Contracts:**
```typescript
// convex/actions/publisher.ts
export const retryFailedSlot = action({
  args: { slotId: v.id('scheduleSlots') },
  handler: async (ctx, args): Promise<{ scheduled: boolean; error?: string }> => {
    const slot = await ctx.runQuery(internal.scheduleSlots.getByIdInternal, { id: args.slotId }) as any | null
    if (!slot) return { scheduled: false, error: 'Slot no encontrado' }
    if (slot.status !== 'failed') return { scheduled: false, error: `El slot no está en estado failed (${slot.status})` }
    if (!slot.contentItemId) return { scheduled: false, error: 'El slot no tiene contenido asignado' }
    await ctx.runMutation(internal.scheduleSlots.updateStatusInternal, { id: args.slotId, status: 'ready' })
    await ctx.scheduler.runAfter(0, internal.actions.publisher.publishSlot, { slotId: args.slotId, retryCount: 0 })
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'scheduleSlot', entityId: args.slotId,
      eventType: 'slot.retry_requested', payloadJson: { channel: slot.channel },
    })
    return { scheduled: true }
  },
})
```
```typescript
// app/(dashboard)/planner/page.tsx
const failedSlots = useQuery(api.scheduleSlots.listFailed, {})
const retryFailedSlot = useAction(api.actions.publisher.retryFailedSlot)
// Button: onClick={() => retryFailedSlot({ slotId: slot._id })}
```

**Execution notes:** `publishSlot`'s guard accepts `'ready'` status, so setting `ready` then scheduling at delay 0 re-enters the retry/backoff machinery cleanly. `action`/`internalAction` are imported in publisher.ts already (`"use node"` file). Show optimistic "Reintentando…" then rely on `listFailed` subscription to drop the row when it republishes.

---

### T2-10: Full Tumblr post preview
**Files:** `components/editor/VariantPanel.tsx`, `lib/preview/tumblr.ts` (new shared helper)

**What changes:**
- Extract the Tumblr caption/tags assembly from `convex/actions/publisher.ts` (`TUMBLR_FOOTER`, `buildFullTumblrCaption`, tag merge at lines 38-88) into a browser-safe `lib/preview/tumblr.ts` so the client can render the exact final caption + footer + tags without importing the `"use node"` action.
- In `ChannelVariantCard` (tumblr), add a "Vista final" mode showing `<h2>headline</h2> + body + TUMBLR_FOOTER` (sanitized) and the merged tag list.

**Contracts:**
```typescript
// lib/preview/tumblr.ts  (NO 'use node' — pure, importable client-side)
export const TUMBLR_FOOTER = '<p>[SuperheroesInColor&nbsp;…]</p>' // copy verbatim from publisher.ts line 38

export function buildFullTumblrCaption(headline: string, bodyText: string): string {
  return [`<h2>${headline}</h2>`, bodyText, TUMBLR_FOOTER].filter(Boolean).join('\n')
}

export function buildTumblrTags(
  variantCtaText: string | undefined,
  representationTags: string[],
  themeTags: string[],
  contentType: string,
): string[] {
  const variantTags = variantCtaText
    ? variantCtaText.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    : []
  return [...variantTags, ...representationTags, ...themeTags, contentType, 'superherosincolor']
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 30)
}
```

**Execution notes:** Refactor `publisher.ts` to import from `lib/preview/tumblr.ts` (delete its local `TUMBLR_FOOTER`/`buildFullTumblrCaption` duplicates) so the two never drift. `ChannelVariantCard` needs `representationTags`/`themeTags`/`contentType` — these are NOT in the variant; pass them down from a parent that has the item, or fetch via `api.contentItems.getById`. Simplest: add optional `itemTags?: {representationTags:string[];themeTags:string[];contentType:string}` prop threaded from the editor page which already loads the item.

---

### T2-11: Alt-text + dimensions in MediaUploader
**Files:** `components/editor/ContentEditor.tsx` (`MediaUploader`)

**What changes:**
- Before upload, read natural image dimensions client-side via an `Image()` / `createImageBitmap`, and add an alt-text `<input>`. Pass `altText`, `width`, `height` to `saveMediaAsset` (mutation already accepts all three — see `convex/mediaAssets.ts` lines 12-24).
- Add per-asset alt-text editing (calls a new `mediaAssets.updateAltText` mutation) OR capture alt at upload time only (minimum viable: capture at upload).

**Contracts:**
```typescript
// components/editor/ContentEditor.tsx — MediaUploader
const [altText, setAltText] = useState('')

async function readDimensions(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const dims = { width: bmp.width, height: bmp.height }
    bmp.close()
    return dims
  } catch { return {} }
}

// inside handleFileChange, after generateUploadUrl/fetch:
const { width, height } = await readDimensions(file)
await saveMediaAsset({
  contentItemId,
  storageId,
  mimeType: file.type,
  fileSizeBytes: file.size,
  altText: altText.trim() || undefined,
  width,
  height,
})
setAltText('')
```
```typescript
// convex/mediaAssets.ts — optional: edit alt after upload
export const updateAltText = mutation({
  args: { id: v.id('mediaAssets'), altText: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { altText: args.altText || undefined })
  },
})
```

**Execution notes:** `saveMediaAsset` already validates `width`/`height`/`altText` as optional — no schema change (fields exist in `mediaAssets`). `createImageBitmap` works in all modern browsers; the try/catch falls back to no-dimensions. Render existing `asset.width × asset.height` under each thumbnail when present.

---

### T2-12: Variant quality linter
**Files:** `lib/quality/variantLint.ts` (new, pure), `convex/actions/ai.ts` (call after generation), `components/editor/VariantPanel.tsx` (display warnings)

**What changes:**
- Add a pure linter producing warnings: banned-phrase hits, Tumblr `<p>` count > 3, X assembled length > 280, X body > 150. Banned-phrase list mirrors the prompt in `ai.ts` line 265.
- Call it in `generateVariant` after the `headline/bodyText/ctaText` are finalized (post-enforcement, before `applyGeneration`), store warnings in the audit log, and return them so the UI can show them.
- Display warnings in `ChannelVariantCard` after a generate.

**Contracts:**
```typescript
// lib/quality/variantLint.ts
export interface LintResult {
  warnings: string[]
  bannedPhrases: string[]
  paragraphCount: number
  assembledLength: number
}

const BANNED = [
  'must-read','a must','instant classic','essential reading','you need to read',
  'perfect for fans of',"don't miss",'highly recommended','stunning','groundbreaking',
  'amazing','incredible','powerful story','diverse','diversity','minority',
  'creators are unknown','creators are not listed','writer is unknown','artist is unknown',
]

export function lintVariant(args: {
  channel: 'tumblr' | 'x'
  headline: string
  bodyText: string
  ctaText: string
}): LintResult {
  const warnings: string[] = []
  const haystack = `${args.headline} ${args.bodyText}`.toLowerCase()
  const bannedPhrases = BANNED.filter(p => haystack.includes(p))
  if (bannedPhrases.length) warnings.push(`Frases prohibidas: ${bannedPhrases.join(', ')}`)

  const paragraphCount = (args.bodyText.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []).length
  if (args.channel === 'tumblr' && paragraphCount > 3) warnings.push(`Demasiados párrafos: ${paragraphCount} (máx 3)`)

  let assembledLength = 0
  if (args.channel === 'x') {
    const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const body = strip(args.bodyText)
    if (body.length > 150) warnings.push(`Cuerpo X > 150 (${body.length})`)
    assembledLength = strip(args.headline).length + 4 + body.length + 4 + 'linktr.ee/HeroesInColor'.length
    if (assembledLength > 280) warnings.push(`Tweet ensamblado > 280 (${assembledLength})`)
  }
  return { warnings, bannedPhrases, paragraphCount, assembledLength }
}
```
```typescript
// convex/actions/ai.ts — generateVariant return type gains lintWarnings
handler: async (ctx, args): Promise<{
  headline: string; bodyText: string; ctaText: string; modelUsed: string
  lintWarnings: string[]
}> => { /* … after enforcement, before applyGeneration: */
  const lint = lintVariant({ channel: args.channel, headline, bodyText, ctaText })
  // log via internal.auditEvents.log eventType 'variant.lint' payloadJson: lint
  // return { …, lintWarnings: lint.warnings }
}
```

**Execution notes:** `lib/quality/variantLint.ts` must be pure (no `"use node"`) so both the action and the client can import it. The linter does NOT block generation — warnings are advisory. The substring match for `'incredible'`/`'amazing'` will over-flag occasionally; acceptable for an advisory linter. Add `import { lintVariant } from '../../lib/quality/variantLint'` to `ai.ts`.

---

### T2-13: Planner N+1 fix
**Files:** `convex/scheduleSlots.ts` (`listByDateRangeWithItems`)

**What changes:**
- `listByDateRangeWithItems` (lines 48-89) does `await ctx.db.get(slot.contentItemId)` inside a per-slot loop. De-duplicate: collect unique `contentItemId`s, `get` each once, build a `Map`, then assemble. (Convex has no `getMany`; the win is dedup + parallelism, not a single round trip.)

**Contracts:**
```typescript
// convex/scheduleSlots.ts — listByDateRangeWithItems.handler, replace enrichment loop
const uniqueItemIds = [...new Set(
  slots.map(s => s.contentItemId).filter((x): x is Id<'contentItems'> => x != null)
)]
const itemDocs = await Promise.all(uniqueItemIds.map(id => ctx.db.get(id)))
const itemMap = new Map<string, Doc<'contentItems'>>()
itemDocs.forEach((doc, i) => { if (doc) itemMap.set(uniqueItemIds[i] as string, doc) })

const enriched = slots.map(slot => {
  const item = slot.contentItemId ? itemMap.get(slot.contentItemId as string) : null
  return {
    ...slot,
    item: item ? {
      _id: item._id, title: item.title, contentType: item.contentType,
      contentOrigin: item.contentOrigin, enrichedManually: item.enrichedManually,
      sourcePlatform: item.sourcePlatform,
    } : null,
  }
})
return enriched
```

**Execution notes:** `Doc`/`Id` are already imported in scheduleSlots.ts (line 4). Output shape is identical to the current implementation — planner UI needs no change. Apply the same dedup pattern to `listFailed` (lines 491-499) if touching it for T2-9.

---

## TIER 3 (polish)

### T3-14: Channel scores visible in editor
**Files:** `app/(dashboard)/catalog/[id]/page.tsx`

**What changes:**
- The score breakdown panel ALREADY renders `reuseScore`, `clickScore`, `engagementScore`, `reblogScore`, `evergreenScore`, `postCount`, `lastPostedAt` (lines 90-147). This item is largely satisfied. Remaining gap: `data.scores` comes from `getById` which returns ALL channelScores rows; ensure both tumblr+x render and add a compact `reuseScore`/`clickScore` summary near the top of the page for quick scan.
- Add a one-line score chip row under the page title showing per-channel `reuseScore`.

**Contracts:**
```typescript
// app/(dashboard)/catalog/[id]/page.tsx — derive a compact summary from existing `scores`
type ScoreRow = { _id: string; channel: 'tumblr' | 'x'; reuseScore: number; clickScore: number }
const scoreSummary = (scores as ScoreRow[] | undefined)?.map(s => ({
  channel: s.channel, reuseScore: s.reuseScore, clickScore: s.clickScore,
})) ?? []
// Render chips: `{channel}: reuse {reuseScore.toFixed(2)} · click {clickScore.toFixed(2)}`
```

**Execution notes:** `getById` (contentItems.ts line 125-128) already attaches `scores` via the `by_item` index. No backend change. This is mostly confirming + adding the top summary chips; the detailed panel already exists.

---

### T3-15: scoringRules editor UI
**Files:** `convex/scoringRules.ts` (queries/mutation — verify/add), `app/(dashboard)/settings/page.tsx` (panel)

**What changes:**
- Add `scoringRules.getByChannel` query and `scoringRules.upsert` mutation covering every field in the `scoringRules` table (weights, cooldowns, quotas, origin boosts, `active`).
- Add a settings panel with numeric inputs per channel (`tumblr`/`x`), loading current rules and saving via `upsert`.

**Contracts:**
```typescript
// convex/scoringRules.ts
const channelV = v.union(v.literal('tumblr'), v.literal('x'))

export const getByChannel = query({
  args: { channel: channelV },
  handler: async (ctx, args) =>
    await ctx.db.query('scoringRules').withIndex('by_channel', q => q.eq('channel', args.channel)).first(),
})

export const upsert = mutation({
  args: {
    channel: channelV,
    cooldownDaysItem: v.number(), cooldownDaysTopic: v.number(),
    weightClicks: v.number(), weightEngagement: v.number(), weightEvergreen: v.number(),
    weightManualPriority: v.number(), weightRecencyPenalty: v.number(), weightTopicFatigue: v.number(),
    originBoostManual: v.number(), originBoostAssisted: v.number(),
    originBoostEnriched: v.number(), originBoostImported: v.number(),
    quotaComic: v.number(), quotaLibro: v.number(), quotaCosplay: v.number(),
    quotaArticulo: v.number(), quotaOtros: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { channel, ...fields } = args
    const existing = await ctx.db.query('scoringRules').withIndex('by_channel', q => q.eq('channel', channel)).first()
    if (existing) { await ctx.db.patch(existing._id, fields); return existing._id }
    return await ctx.db.insert('scoringRules', { channel, ...fields })
  },
})
```

**Execution notes:** Arg list must include EVERY non-system field from the `scoringRules` schema (lines 240-260) — omitting one makes `insert` fail validation. Audit-log the change with `eventType: 'scoringRules.updated'`. Verify `convex/scoringRules.ts` exists first; the generation action reads rules via `by_channel` (`scheduleSlots.getDataForGenerationInternal` line 172).

---

### T3-16: Audit log viewer per item
**Files:** `convex/auditEvents.ts` (new query), `app/(dashboard)/catalog/[id]/page.tsx` (timeline component)

**What changes:**
- `auditEvents` currently only exposes the internal `log` mutation. Add a public `listByEntity` query using the `by_entity` index `['entityType','entityId']`.
- Add a timeline component on the item page rendering events newest-first.

**Contracts:**
```typescript
// convex/auditEvents.ts
export const listByEntity = query({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('auditEvents')
      .withIndex('by_entity', q => q.eq('entityType', args.entityType).eq('entityId', args.entityId))
      .order('desc')
      .take(Math.min(args.limit ?? 50, 200))
  },
})
```
```typescript
// app/(dashboard)/catalog/[id]/page.tsx
const audit = useQuery(api.auditEvents.listByEntity, {
  entityType: 'contentItem',
  entityId: params.id,
}) as Array<{
  _id: string; _creationTime: number; eventType: string; payloadJson?: unknown
}> | undefined
// Render: timestamp · eventType · key payload fields (e.g. from/to for status_changed)
```

**Execution notes:** Audit entries log `entityId` as a stringified Convex id (mutations pass the id directly; the `log` validator types it `v.optional(v.string())`). `params.id` is already the raw string id — pass it directly. `by_entity` requires BOTH `entityType` and `entityId` eq for an indexed range; both are provided.

---

### T3-17: Fuzzy duplicate detection
**Files:** `lib/quality/similarity.ts` (new, pure), `convex/actions/ai.ts` (`researchContent` — add pre-insert check), `convex/contentItems.ts` (internal candidate query)

**What changes:**
- Current dedup is exact `canonicalHash` only (`contentItems.create` line 385-391). Add fuzzy title similarity: normalize titles, compute token-set / Levenshtein ratio, flag near-duplicates above a threshold (e.g. 0.85).
- Add an internal query returning recent candidate titles; call the similarity check inside `researchContent` before promoting/creating, returning `possibleDuplicates` in the result.

**Contracts:**
```typescript
// lib/quality/similarity.ts (pure)
export function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\(\d{4}\)/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
export function similarityRatio(a: string, b: string): number {
  const na = normalizeTitle(a), nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}
function levenshtein(a: string, b: string): number { /* standard DP, O(a·b) */ return 0 }
export function findSimilar(title: string, candidates: { _id: string; title: string }[], threshold = 0.85) {
  return candidates
    .map(c => ({ _id: c._id, title: c.title, ratio: similarityRatio(title, c.title) }))
    .filter(c => c.ratio >= threshold)
    .sort((a, b) => b.ratio - a.ratio)
}
```
```typescript
// convex/contentItems.ts — internal candidate provider
export const listTitlesForDedupInternal = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const items = await ctx.db.query('contentItems').order('desc').take(Math.min(args.limit ?? 1000, 2000))
    return items.map(i => ({ _id: i._id as string, title: i.title }))
  },
})
```
```typescript
// convex/actions/ai.ts — researchContent return extension
//   const candidates = await ctx.runQuery(internal.contentItems.listTitlesForDedupInternal, { limit: 1000 })
//   const possibleDuplicates = findSimilar(parsed.title, candidates, 0.85)
//   return { ...parsed, possibleDuplicates }
```

**Execution notes:** `lib/quality/similarity.ts` must be pure for use in the `"use node"` action. Keep candidate cap ≤2000 to bound the O(n·|title|²) Levenshtein cost; this runs once per research call so it's fine. Do NOT auto-block creation — surface `possibleDuplicates` to the editor UI for a human decision (matches the existing soft-review philosophy).

---

## Cross-cutting execution order

1. T1-7, T2-13, T1-6 — backend-only, no UI deps, lowest risk. Land first.
2. T1-2 then T1-1 — search filter fix must precede the dashboard search handoff.
3. T2-10 + T1-4 + T2-12 share assembly/lint logic — extract `lib/preview/tumblr.ts` and `lib/quality/variantLint.ts` once, reuse in publisher.ts, ai.ts, and VariantPanel.
4. T2-9 needs `retryFailedSlot` (publisher.ts) before the planner button.
5. T3-15/T3-16/T3-17 are independent; do last.

Validate every Convex change with `npx convex dev` (regenerates `_generated/api`) before wiring the `api.*` references in client code.
