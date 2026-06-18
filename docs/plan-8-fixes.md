# Implementation Plan — 8 Fixes (CMS editorial multicanal)

Senior-architect plan. No code here — only scope, contracts, risks. Each issue lists exact files, concrete changes, a testable completion contract, and the gotcha.

Grounding notes from current code:
- `contentItems` already has a `by_status` index (`convex/schema.ts:103`) → reuse for issue 7.
- Tumblr publisher wraps `bodyText` in `buildFullTumblrCaption` adding `<h2>headline</h2>` + footer (`convex/actions/publisher.ts:39-41`). HTML in `bodyText` is real → preview must render it (issue 1).
- X payload today = `stripHtml(bodyText)` + `\n\n` + `ctaText` (cta defaults to `buyLink`) (`publisher.ts:84-104`). Issue 4 restructures this.
- Variant generation persists via `internal.contentVariants.applyGeneration` (`ai.ts:234`).
- Planner builds `slotMap` keyed `${date}:${dayPart}` already supporting arrays (`planner/page.tsx:175-182`); `+` button exists per cell (`page.tsx:537-546`). Pill color = `STATUS_COLORS[slot.status]` (`page.tsx:568`); `TYPE_COLORS` already defined (`page.tsx:52-62`) but only used on a tiny inner badge.
- `generateCalendar` takes `startDate`/`endDate`; planner passes month bounds (`page.tsx:144,195`). No past-clamp anywhere (issue 6).

---

## Issue 1 — HTML preview toggle in VariantPanel

**Files to change**
- `components/editor/VariantPanel.tsx`

**What to add/change**
- In the read-only preview block (`ChannelVariantCard`, lines 156-177), for `channel === 'tumblr'` only, add a 2-state toggle (`'code' | 'preview'`), local `useState`, default `'preview'`.
- `preview` mode: render `activeVariant.bodyText` via `dangerouslySetInnerHTML` inside a styled container (prose-ish: `<p>`, `<b>`, `<i>`, `<a>`). Keep `headline`/`ctaText` rendered as today.
- `code` mode: keep current `whitespace-pre-wrap` raw-text rendering.
- Toggle = two small buttons ("Código" / "Vista previa") in the card header next to the status badge. X channel: no toggle (plain text), unchanged.
- Sanitize before injecting: strip `<script>`, `<style>`, `<iframe>`, and `on*=` attributes with a small local allowlist/strip helper (no new dependency required; regex strip acceptable for trusted internal content but MUST remove script/event handlers).

**Completion contract**
- Given a tumblr variant whose `bodyText` = `"<p><i>Hook</i></p><p>Body <b>Name</b></p>"`, the preview pane renders an italic line and a bold "Name" (i.e. real DOM tags, not visible angle brackets). Toggling to "Código" shows the literal string including `<p>` tags. X variant card shows NO toggle and renders body as plain text. A `bodyText` containing `<script>alert(1)</script>` does not execute / the script tag is stripped from rendered output.

**Risk**
- XSS via `dangerouslySetInnerHTML`. Content is AI/editor-generated (semi-trusted) → must strip script/style/iframe/event-handler attrs. Do not pull a heavy sanitizer lib for one field unless already present; a scoped strip is fine but must be applied every render, including `code`→`preview` switches.

---

## Issue 2 — AI content quality: no filler, tight paragraphs

**Files to change**
- `convex/actions/ai.ts` (tumblr branch of `generateVariant`, lines 137-186)

**What to add/change**
- Rewrite the tumblr `bodyText` instructions: **max 3 `<p>` tags total** (was "3–5 paragraphs"). Target 1–2 tight paragraphs; a 3rd only if a buy link `<p>` is needed.
- Add an explicit BANNED-PHRASES rule: no "must-read", "a must", "instant classic", "essential", "you need to read", "perfect for fans", vague superlatives ("amazing", "incredible", "groundbreaking" with no specific). Keep existing "diverse/diversity/minority" ban.
- Add UNIQUE-INFO rule: each paragraph must add new concrete information from one of: plot/premise specifics, creator background, representation angle. No paragraph may restate another.
- Keep the JSON output shape unchanged (`headline`/`bodyText`/`ctaText`).
- Optional post-parse guard in handler: if `bodyText` contains more than 3 `<p>` tags, keep only the first 3 (defensive trim) — or at minimum log a warning. (Recommend hard trim to honor the contract.)

**Completion contract**
- For a comic item, generated tumblr `bodyText` contains **≤ 3 `<p>...</p>` blocks** (count via regex `/<p[ >]/g`) and contains **none** of the banned phrases (case-insensitive substring check on the stripped text). A reviewer reading the output can identify at least two distinct concrete facts (e.g. a plot detail AND a creator name) — verifiable manually on one sample.

**Risk**
- Model may ignore the ≤3 cap → the defensive handler trim is the enforceable backstop; the prompt alone is not a contract. Trimming raw HTML can orphan an unclosed tag — trim on `</p>` boundaries, not mid-tag.

---

## Issue 3 — Creator research in prompts

**Files to change**
- `convex/actions/ai.ts` (tumblr branch primarily; X branch lead line)

**What to add/change**
- Add a CREATOR-RESEARCH instruction block to the tumblr prompt: instruct the model to use its training knowledge to identify the writer/artist for the comic and, when known, name concrete creator background — nationality, notable other works, awards (e.g. Eisner). Only state facts it is confident about; if unknown, omit rather than invent.
- When `item.creators` is already populated (passed as `creatorsText`, `ai.ts:122-124`), tell the model to expand on those named creators specifically rather than guessing new names.
- Add an explicit "do not fabricate creator facts" guard line (anti-hallucination), pairing with issue 2's specificity rule.

**Completion contract**
- For a comic with a well-known creator already in `item.creators` (e.g. writer present), the generated tumblr `bodyText` mentions that creator by name wrapped per existing `<b>` rule, and includes at least one concrete creator-background clause (other work / nationality / award) in prose. For an item with empty `creators` and an obscure title, output contains no invented full names presented as fact (manual check on one sample).

**Risk**
- Hallucinated awards/credits. The "only if confident / do not fabricate" instruction reduces but cannot eliminate; flag for human review in editor (the preview from issue 1 supports this). This is a prompt-quality change, not deterministic — contract is sample-verifiable, not unit-testable.

---

## Issue 4 — X post format mirrors Tumblr, compressed

**Files to change**
- `convex/actions/ai.ts` (X branch of `generateVariant`, lines 187-214)
- `convex/actions/publisher.ts` (`buildXPayload`, lines 84-104)

**What to add/change**
- AI X branch: produce three fields —
  - `headline`: same title format as Tumblr headline (plain text).
  - `bodyText`: **1 sentence, ≤ 150 chars**, specific, no filler (apply issue-2 banned list).
  - `ctaText`: **always the fixed string** `linktr.ee/HeroesInColor` (ignore `buyLink`). Hard-code in handler after parse rather than trusting the model — set `ctaText = 'linktr.ee/HeroesInColor'` for the X channel regardless of model output.
- `buildXPayload`: stop using `buyLink`. Assemble `\`${headline}\n\n${bodyText}\n\n${ctaText}\``. Drop the existing `stripHtml(bodyText)` + url-23-char logic except as a final safety: enforce total ≤ 280; if over, truncate `bodyText` (the only flexible field), never the headline or cta. `linktr.ee/HeroesInColor` is not an `http://` URL so the Twitter 23-char t.co rule does not apply — count it literally (24 chars).

**Completion contract**
- `buildXPayload` output `.text` equals exactly `headline + "\n\n" + bodyText + "\n\n" + "linktr.ee/HeroesInColor"` for inputs that fit, and `.text.length <= 280` for ALL inputs (including an over-long `bodyText`, which gets truncated while headline and the literal cta survive intact). Generated X variants have `ctaText === 'linktr.ee/HeroesInColor'` regardless of `item.buyLink`.

**Risk**
- Other callers of the X variant `ctaText`/`buyLink` (e.g. publisher uses `variant.ctaText ?? item.buyLink`). Confirm `buildXPayload` is the only X assembler (it is per grep). The editor still shows X "máx 220 caracteres" body hint (`VariantPanel.tsx:196,201`) — update that hint to 150 for consistency (minor, same file as issue 1). Truncation must not cut a multibyte char in half.

---

## Issue 5 — Calendar: multiple slots per time band, prominent +

**Files to change**
- `app/(dashboard)/planner/page.tsx` (`WeekBand` cell render, lines 508-547; `AddSlotModal` copy line 801-803)

**What to add/change**
- Data layer already supports N slots/cell (slotMap arrays + per-cell create). Only UX: make `+` a clearly visible affordance, not a ghost `+` (`text-gray-300`, line 541).
- Change the add control to a full-width dashed "+ Agregar" button at the bottom of each non-past cell, always visible (not hover-only), e.g. `border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-600`. Keep it below the rendered `slots.map` pills so adding a 2nd/3rd slot to an occupied cell is obviously possible.
- Optional: small slot-count badge ("2") on cells with ≥2 slots.
- Update header helper text (`page.tsx:265`) to mention multiple slots per franja if helpful.

**Completion contract**
- In a cell that already contains 1 slot pill, a visibly-styled "Agregar" button is rendered below the pill without hovering; clicking it opens `AddSlotModal` and confirming creates a 2nd slot in the SAME `${date}:${dayPart}` cell, which then renders two pills stacked. Past-date cells show no add button.

**Risk**
- No backend uniqueness constraint assumed on `(date,dayPart,channel)`; verify `createManual` allows duplicates (planner already maps arrays, so it should). If a DB unique constraint exists it must be relaxed — check `convex/scheduleSlots.ts createManual` before asserting done.

---

## Issue 6 — Calendar: no past-date generation

**Files to change**
- `app/(dashboard)/planner/page.tsx` (`handleGenerate`, lines 193-198)
- (No Convex change required if clamped client-side; alternatively clamp inside `generateCalendar`.)

**What to add/change**
- Compute `effectiveStart = startDate < today ? today : startDate` (string compare is valid for `YYYY-MM-DD`). `today` already available via `todayStr()` (`page.tsx:128`).
- Pass `startDate: effectiveStart` to `generateCal(...)`. `endDate` unchanged (month end).
- Defense-in-depth (recommended): also clamp inside `convex/actions/scoring.ts generateCalendar` so cron/server callers can't backfill the past — `const effectiveStart = args.startDate < todayStr() ? todayStr() : args.startDate;` and use it for both `getDataForGenerationInternal` range and `getDatesInRange`. Add a server `todayStr()` helper (UTC slice already used elsewhere, `scoring.ts:286`).

**Completion contract**
- On June 17 with month = June, calling generate produces zero slots dated before `2026-06-17` (no slot with `scheduledFor < today`), while still generating June 17–30. Verifiable by inspecting created slots' `scheduledFor` min value == today (or later). If a past-clamp is added server-side, calling `generateCalendar` directly with `startDate` = `2026-06-01` also yields no pre-today slots.

**Risk**
- String compare only safe with zero-padded ISO dates — both sides already are. Clamping client-side only leaves the action backfillable; prefer the server clamp as the authoritative contract. `clearUnlockedInRangeInternal` still uses the original `startDate..endDate` — decide whether to clear past unlocked slots or not; recommend clear range stays full month but generation range is clamped, so stale past slots get removed but not recreated.

---

## Issue 7 — Calendar: pending-approvals counter

**Files to change**
- `convex/contentItems.ts` (new query `countByStatus`)
- `app/(dashboard)/planner/page.tsx` (new info banner above calendar; import `Link` already present, line 3)

**What to add/change**
- New query `countByStatus` in `contentItems.ts`: count items with `status` in `['in_review','draft']` using the existing `by_status` index (one bounded `.take(N)` per status, sum lengths — mirror `getDashboardStats` pattern, `contentItems.ts:538-559`, to stay within Convex read limits). Return `{ inReview, draft, total }`.
- Planner: `useQuery(api.contentItems.countByStatus, {})`; render a small section above the grid (near the feedback area, after line 306) showing e.g. "N ítems pendientes de aprobación" with a `<Link href="/review">` ("Revisar →"). Hide when total is 0.

**Completion contract**
- `api.contentItems.countByStatus` returns numeric `inReview`, `draft`, `total` where `total === inReview + draft`, computed via the `by_status` index (no full unindexed scan). Planner renders a banner showing `total` only when `total > 0`, containing a working link to `/review`. With zero pending items the banner is absent.

**Risk**
- `.take(500)` cap (as in `getDashboardStats`) means counts saturate at the cap for huge backlogs — acceptable for a "needs approval" nudge; document the cap or display "500+". Ensure `/review` route exists (confirm `app/(dashboard)/review` before wiring the link; if absent, point to the existing review/needs-review page).

---

## Issue 8 — Calendar: content-type colors for slot pills

**Files to change**
- `app/(dashboard)/planner/page.tsx` (`TYPE_COLORS` map lines 52-62; `SlotPill` lines 558-597; legend lines 384-389)

**What to add/change**
- Extend `TYPE_COLORS` to cover all **9** content types (currently 9 keys present: comic, libro, cosplay, articulo, autor, poster, pelicula, personaje, coleccion — verify each is visually distinct; `articulo`/`poster`/`pelicula` etc. already differ). Ensure every type maps to a distinct background — no two share the same Tailwind color.
- `SlotPill`: change `colorClass` (line 568) from `STATUS_COLORS[slot.status]` to `TYPE_COLORS[slot.item?.contentType]` (fallback gray for empty/no item). Pill background now encodes content type.
- Move status encoding to a **left border** (e.g. `border-l-4` with a per-status border color map) OR a tiny status badge inside the pill. Remove the now-redundant inner `TYPE_COLORS` mini-badge (lines 583-587) since the whole pill carries the type color — replace it with the status badge/dot.
- Update the legend (lines 384-389) to show the 9 content-type colors (type legend) in addition to / instead of the current status legend; keep a status key too.

**Completion contract**
- Each of the 9 content types renders a pill with a unique background color (9 distinct colors, none duplicated). A slot's status is still visually distinguishable on the pill via a status-colored left border or badge (e.g. failed vs published differ on the same content type). Empty/unassigned slots fall back to a neutral gray pill. Legend documents the 9 type colors.

**Risk**
- Status info loss: status was previously the ONLY pill color signal; moving it to a thin border can reduce salience for `failed`/`publishing` — keep those high-contrast (red/purple border) so errors stay noticeable. Verify all 9 `contentType` string values exactly match the union in `convex/contentItems.ts:8-12` (comic/libro/autor/cosplay/articulo/poster/pelicula/personaje/coleccion) so no type falls through to gray fallback.

---

## Cross-cutting / sequencing notes
- Issues 1–4 touch `ai.ts` + `publisher.ts` + `VariantPanel.tsx`; do 2 & 3 together (same tumblr prompt), then 4 (X prompt + payload), then 1 (UI, depends on tumblr HTML existing).
- Issues 5–8 all touch `planner/page.tsx`; batch them in one pass to avoid merge churn. 7 also needs the new `countByStatus` Convex query.
- After any `convex/` change run `npx convex dev` to regenerate `_generated` types (the `as any` casts in the planner/panel exist because types lag until regen).
- No schema migration required for any issue (new query only, no new fields).
