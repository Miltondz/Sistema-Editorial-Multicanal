# Skill: Editorial CMS Domain
# Reglas de dominio de SuperheroesInColor CMS — obligatorias en toda implementación

---

## 1. Campos de trazabilidad de origen — reglas críticas

Estos tres campos definen la identidad de cada ítem y tienen restricciones estrictas:

| Campo | Tipo | Mutable | Descripción |
|---|---|---|---|
| `contentOrigin` | `'imported' \| 'manual' \| 'assisted'` | ❌ Nunca | Origen inicial del ítem |
| `sourcePlatform` | `'tumblr' \| 'x' \| undefined` | ❌ Nunca | Plataforma de origen si fue importado |
| `enrichedManually` | `boolean` | ✅ Solo true→ nunca vuelve a false | Si un ítem importado fue editado después |

```typescript
// ❌ INCORRECTO — nunca permitir cambiar contentOrigin o sourcePlatform
await ctx.db.patch(args.id, {
  contentOrigin: 'manual', // PROHIBIDO
  sourcePlatform: 'x',    // PROHIBIDO
})

// ✅ CORRECTO — update solo permite campos mutables
// En convex/contentItems.ts, la mutation update debe excluir estos campos:
export const update = mutation({
  args: {
    id: v.id('contentItems'),
    patch: v.object({
      // contentOrigin: AUSENTE — no se puede cambiar
      // sourcePlatform: AUSENTE — no se puede cambiar
      title: v.optional(v.string()),
      summary: v.optional(v.string()),
      longDescription: v.optional(v.string()),
      enrichedManually: v.optional(v.boolean()),
      // ... resto de campos mutables
    }),
  },
  handler: async (ctx, args) => {
    // Si enrichedManually pasa a true, registrar audit event
    if (args.patch.enrichedManually === true) {
      const current = await ctx.db.get(args.id)
      if (current && !current.enrichedManually) {
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'contentItem',
          entityId: args.id,
          eventType: 'item.enriched',
          payloadJson: { previousValue: false },
        })
      }
    }
    await ctx.db.patch(args.id, args.patch)
  },
})
```

---

## 2. Audit events — obligatorio en TODA mutación

**Regla**: cada mutación que modifique datos de negocio DEBE registrar un audit event.
No es opcional. Si una mutación no llama a `auditEvents.log`, está incompleta.

```typescript
// Eventos válidos por entidad:

// contentItems
'item.created'          // al crear
'item.updated'          // al editar campos
'item.status_changed'   // al cambiar status
'item.enriched'         // cuando enrichedManually pasa de false a true
'item.approved'         // cuando status pasa a 'approved'
'item.archived'         // cuando status pasa a 'archived'
'item.published_direct' // publicación directa sin slot

// contentVariants
'variant.created'
'variant.generated'     // generada por IA
'variant.edited'        // editada manualmente después de generar
'variant.approved'      // aprobada para publicación
'variant.published'

// scheduleSlots
'slot.created'
'slot.locked'
'slot.unlocked'
'slot.assigned'         // ítem asignado al slot
'slot.published'
'slot.failed'
'slot.skipped'

// importJobs
'import.started'
'import.completed'
'import.failed'
```

```typescript
// Patrón correcto en cualquier mutation:
export const approve = mutation({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id)
    if (!item) throw new Error('Item not found')
    if (item.status !== 'in_review' && item.status !== 'draft') {
      throw new Error(`Cannot approve item with status: ${item.status}`)
    }

    await ctx.db.patch(args.id, { status: 'approved' })

    // OBLIGATORIO — audit event
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: args.id,
      eventType: 'item.approved',
      payloadJson: { previousStatus: item.status },
    })
  },
})
```

---

## 3. Máquina de estados — transiciones válidas

### ContentItem status

```
draft ──────────────────→ researching
draft ──────────────────→ in_review
draft ──────────────────→ archived
researching ────────────→ in_review
researching ────────────→ draft
in_review ──────────────→ approved
in_review ──────────────→ draft
in_review ──────────────→ blocked
approved ───────────────→ scheduled
approved ───────────────→ published     (publicación directa)
approved ───────────────→ archived
scheduled ──────────────→ published
scheduled ──────────────→ approved      (si se saca del calendario)
published ──────────────→ archived
published ──────────────→ approved      (para recircular)
blocked ────────────────→ in_review     (solo por revisión manual)
```

```typescript
// Validar transición antes de aplicar:
const VALID_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft:       ['researching', 'in_review', 'archived'],
  researching: ['in_review', 'draft'],
  in_review:   ['approved', 'draft', 'blocked'],
  approved:    ['scheduled', 'published', 'archived'],
  scheduled:   ['published', 'approved'],
  published:   ['archived', 'approved'],
  archived:    [], // terminal — no tiene transiciones válidas
  blocked:     ['in_review'],
}

function validateTransition(current: ContentStatus, next: ContentStatus): void {
  if (!VALID_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid transition: ${current} → ${next}`)
  }
}
```

### ContentVariant status

```
not_started → generated → edited → approved → scheduled → published
                                  ↓                       ↓
                               disabled                 failed
```

### ScheduleSlot status

```
empty → planned → locked → ready → publishing → published
                                              ↓
                                          skipped / failed
```

---

## 4. Creación de ContentItem — checklist completo

Al crear un ContentItem, la mutation `create` DEBE:

```typescript
export const create = mutation({
  handler: async (ctx, args) => {
    // 1. Generar slug único desde el título
    const slug = await generateUniqueSlug(ctx, args.title)

    // 2. Computar canonicalHash
    const canonicalHash = computeCanonicalHash({
      title: args.title,
      sourcePostUrl: args.sourcePostUrl,
      sourcePostId: args.sourcePostId,
    })

    // 3. Verificar duplicado por hash
    const existing = await ctx.db
      .query('contentItems')
      .withIndex('by_canonical_hash', q => q.eq('canonicalHash', canonicalHash))
      .first()
    if (existing) {
      throw new Error(`Duplicate detected: ${existing._id}`)
    }

    // 4. Insertar el ítem
    const itemId = await ctx.db.insert('contentItems', {
      ...args,
      slug,
      canonicalHash,
      enrichedManually: false,         // siempre false al crear
      needsReview: args.contentOrigin === 'imported', // true si viene de import
      status: args.contentOrigin === 'imported' ? 'in_review' : 'draft',
      editorialPriority: args.editorialPriority ?? 3,
      evergreenClass: args.evergreenClass ?? 'medium',
      isSensitive: false,
      characters: args.characters ?? [],
      creators: args.creators ?? [],
      representationTags: args.representationTags ?? [],
      themeTags: args.themeTags ?? [],
    })

    // 5. Crear channelScores para tumblr y x (OBLIGATORIO)
    await ctx.runMutation(internal.channelScores.createForItem, { contentItemId: itemId })

    // 6. Registrar audit event (OBLIGATORIO)
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'contentItem',
      entityId: itemId,
      eventType: 'item.created',
      payloadJson: { contentOrigin: args.contentOrigin, sourcePlatform: args.sourcePlatform },
    })

    return itemId
  },
})
```

---

## 5. Fórmula de scoring — implementación de referencia

```typescript
// convex/actions/scoring.ts

interface ScoreFactors {
  clickScore: number         // 0-1 normalizado
  engagementScore: number    // 0-1 normalizado
  evergreenScore: number     // 0-1 según evergreenClass: high=1, medium=0.6, low=0.2
  editorialPriority: number  // 1-5, normalizar a 0-1: (priority - 1) / 4
  daysSinceLastPost: number  // días desde last_posted_at en este canal
  topicFatiguePenalty: number // 0-1: 1 si hay ítem del mismo grupo en cooldown, 0 si no
  contentOrigin: ContentOrigin
  enrichedManually: boolean
}

function computeOriginBoost(
  origin: ContentOrigin,
  enriched: boolean,
  rules: ScoringRules
): number {
  if (origin === 'manual') return rules.originBoostManual
  if (origin === 'assisted') return rules.originBoostAssisted
  if (origin === 'imported' && enriched) return rules.originBoostEnriched
  return rules.originBoostImported // imported sin enriquecer
}

function computeRecencyPenalty(daysSinceLastPost: number, cooldownDays: number): number {
  if (daysSinceLastPost >= cooldownDays) return 0 // sin penalización
  // Penalización proporcional: más reciente = más penalización
  return 1 - (daysSinceLastPost / cooldownDays)
}

export function computeScore(factors: ScoreFactors, rules: ScoringRules): number {
  const normalizedPriority = (factors.editorialPriority - 1) / 4

  const recencyPenalty = computeRecencyPenalty(
    factors.daysSinceLastPost,
    rules.cooldownDaysItem
  )

  const originBoost = computeOriginBoost(
    factors.contentOrigin,
    factors.enrichedManually,
    rules
  )

  const score =
    (rules.weightClicks         * factors.clickScore) +
    (rules.weightEngagement     * factors.engagementScore) +
    (rules.weightEvergreen      * factors.evergreenScore) +
    (rules.weightManualPriority * normalizedPriority) -
    (rules.weightRecencyPenalty * recencyPenalty) -
    (rules.weightTopicFatigue   * factors.topicFatiguePenalty) +
    originBoost

  // Clamp entre 0 y 1
  return Math.max(0, Math.min(1, score))
}
```

---

## 6. Reglas de elegibilidad — previas al scoring

Un ítem NO debe entrar al pool de candidatos para el calendario si NO cumple TODAS estas condiciones. Verificar en orden:

```typescript
async function isEligible(
  item: ContentItem,
  channel: Channel,
  date: string,
  rules: ScoringRules,
  ctx: QueryCtx
): Promise<boolean> {

  // 1. Status válido
  if (item.status !== 'approved' && item.status !== 'published') return false

  // 2. Variante activa aprobada para este canal
  const variant = await ctx.db
    .query('contentVariants')
    .withIndex('by_item_and_channel', q =>
      q.eq('contentItemId', item._id).eq('channel', channel)
    )
    .filter(q => q.eq(q.field('isActive'), true))
    .first()
  if (!variant || variant.status !== 'approved') return false

  // 3. Cooldown del ítem
  const scores = await ctx.db
    .query('channelScores')
    .withIndex('by_item_and_channel', q =>
      q.eq('contentItemId', item._id).eq('channel', channel)
    )
    .first()

  if (scores?.lastPostedAt) {
    const daysSince = (Date.now() - scores.lastPostedAt) / (1000 * 60 * 60 * 24)
    if (daysSince < rules.cooldownDaysItem) return false
  }

  // 4. Cooldown de franquicia/topic group
  if (item.topicFatigueGroup) {
    const cutoff = Date.now() - (rules.cooldownDaysTopic * 24 * 60 * 60 * 1000)
    const recentSameGroup = await ctx.db
      .query('publicationLog')
      .withIndex('by_channel', q => q.eq('channel', channel))
      .filter(q => q.gt(q.field('_creationTime'), cutoff))
      .collect()

    // Verificar si alguna publicación reciente es del mismo topic group
    // (requiere join con contentItems — hacer con runQuery en action)
    const hasFatigue = recentSameGroup.some(/* lógica de join */)
    if (hasFatigue) return false
  }

  return true
}
```

---

## 7. Cuotas del calendario — cómo aplicarlas

```typescript
// Al generar el calendario, respetar las cuotas por tipo de contenido.
// Las cuotas se aplican sobre el total de slots del período.

const CONTENT_TYPE_GROUPS: Record<string, ContentType[]> = {
  comic:    ['comic'],
  libro:    ['libro'],
  cosplay:  ['cosplay'],
  articulo: ['articulo'],
  otros:    ['autor', 'poster', 'pelicula', 'personaje', 'coleccion'],
}

function getQuotaGroup(contentType: ContentType): keyof typeof CONTENT_TYPE_GROUPS {
  for (const [group, types] of Object.entries(CONTENT_TYPE_GROUPS)) {
    if (types.includes(contentType)) return group
  }
  return 'otros'
}

// Al seleccionar el siguiente candidato para un slot:
// 1. Calcular cuántos slots ya tienen cada grupo en el período actual
// 2. Calcular el déficit de cada grupo vs su cuota objetivo
// 3. Priorizar ítems del grupo con mayor déficit
// 4. Dentro del grupo, ordenar por reuseScore desc
```

---

## 8. OriginBadge — especificación completa

```typescript
// components/catalog/OriginBadge.tsx
// DEBE mostrar exactamente estas 6 variantes según la sección 11 del PRD

interface OriginBadgeProps {
  contentOrigin: ContentOrigin
  sourcePlatform?: SourcePlatform
  enrichedManually: boolean
}

const BADGE_CONFIG = {
  manual: {
    label: 'Manual',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  assisted: {
    label: 'Asistido IA',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  imported_tumblr_raw: {
    label: 'Histórico Tumblr',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  imported_tumblr_enriched: {
    label: 'Tumblr ✦ curado',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  imported_x_raw: {
    label: 'Histórico X',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  imported_x_enriched: {
    label: 'X ✦ curado',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
} as const

function getBadgeKey(props: OriginBadgeProps): keyof typeof BADGE_CONFIG {
  if (props.contentOrigin === 'manual') return 'manual'
  if (props.contentOrigin === 'assisted') return 'assisted'
  if (props.sourcePlatform === 'tumblr') {
    return props.enrichedManually ? 'imported_tumblr_enriched' : 'imported_tumblr_raw'
  }
  if (props.sourcePlatform === 'x') {
    return props.enrichedManually ? 'imported_x_enriched' : 'imported_x_raw'
  }
  return 'imported_tumblr_raw' // fallback
}

export function OriginBadge(props: OriginBadgeProps) {
  const key = getBadgeKey(props)
  const config = BADGE_CONFIG[key]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  )
}
```

---

## 9. Normalización de ítems importados

Al normalizar posts de Tumblr o X al schema de ContentItem, SIEMPRE aplicar estos valores:

```typescript
// Valores fijos para TODO ítem importado — sin excepciones
const IMPORT_DEFAULTS = {
  contentOrigin: 'imported' as const,
  enrichedManually: false,
  status: 'in_review' as const,
  needsReview: true,
  editorialPriority: 3,
  evergreenClass: 'medium' as const,
  isSensitive: false,
  characters: [],
  creators: [],
  representationTags: [],
  themeTags: [],
}

// sourcePlatform según la fuente:
// Tumblr → sourcePlatform: 'tumblr'
// X export → sourcePlatform: 'x'

// sourceDate: timestamp del post original (no la fecha de importación)
// importedAt: Date.now() (momento de la importación)
```

---

## 10. Publicación — checklist previo

Antes de publicar en cualquier canal, verificar en orden:

```typescript
async function validateBeforePublish(
  contentItemId: Id<'contentItems'>,
  channel: Channel,
  ctx: ActionCtx
): Promise<{ valid: boolean; error?: string }> {

  const item = await ctx.runQuery(internal.contentItems.getByIdInternal, { id: contentItemId })
  if (!item) return { valid: false, error: 'Item not found' }

  // 1. Status del ítem
  if (item.status !== 'approved' && item.status !== 'published') {
    return { valid: false, error: `Item status must be approved or published, got: ${item.status}` }
  }

  // 2. Variante activa aprobada
  const variant = await ctx.runQuery(internal.contentVariants.getActiveForChannel, {
    contentItemId,
    channel,
  })
  if (!variant) return { valid: false, error: `No active variant for channel: ${channel}` }
  if (variant.status !== 'approved') {
    return { valid: false, error: `Variant status must be approved, got: ${variant.status}` }
  }

  // 3. Variante tiene contenido mínimo
  if (!variant.bodyText || variant.bodyText.trim().length === 0) {
    return { valid: false, error: 'Variant body_text is empty' }
  }

  return { valid: true }
}
```

---

## 11. Invariantes del sistema — nunca violar

1. **Todo ContentItem tiene exactamente dos filas en channelScores** — una para 'tumblr' y una para 'x'. Se crean en la mutation `create` y nunca se eliminan.

2. **contentOrigin y sourcePlatform son inmutables** — la mutation `update` no acepta estos campos.

3. **enrichedManually solo va de false a true** — nunca al revés. Si se detecta un intento de pasar a false, ignorarlo silenciosamente o lanzar error.

4. **Todo ítem importado entra con needsReview=true y status='in_review'** — sin excepciones, incluso si el importador los considera "limpios".

5. **Toda mutación de negocio registra un audit event** — sin excepciones.

6. **channelScores.reuseScore solo se actualiza via la action recomputeAllScores** — nunca directamente en mutations de negocio.

7. **Los slots locked=true no se tocan en regeneración de calendario** — la función de generación debe verificar este flag antes de asignar o sobreescribir.

8. **Una variante published o failed no puede volver a generated** — solo puede ir a disabled.
