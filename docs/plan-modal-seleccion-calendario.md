# Plan: Modal de selección de publicaciones para "Generar calendario"

Feature: al pulsar "Generar calendario" en `/planner`, abrir un modal intermedio que liste
publicaciones elegibles (status `approved` + variante activa aprobada del canal), permita
buscar/filtrar/seleccionar, y dispare la generación solo con los `selectedItemIds` elegidos.

---

## 0. Resumen de hallazgos del código actual

- `generateCalendar` (`convex/actions/scoring.ts`) NO recibe ids; arma el pool de candidatos
  desde `getDataForGenerationInternal` y filtra por: item `approved`/`published`, variante activa
  aprobada del canal, cooldown de item, topic fatigue. El filtrado final está en el loop sobre
  `eligible` (líneas 133-152) y la asignación de slots (líneas 196-257).
- `getDataForGenerationInternal` (`convex/scheduleSlots.ts:163`) ya trae `approvedVariants` via
  índice `by_channel_and_status` (`channel` + `status='approved'`) y `allItems` via `channelScores`
  ordenados por `by_channel_and_score`. OJO: `allItems` solo contiene items que tienen fila en
  `channelScores` dentro del top 300 — suficiente para generación, pero para el modal queremos
  listar TODOS los items aprobados con variante aprobada activa, sin depender de scores.
- Índices existentes relevantes:
  - `contentItems.by_status` (`status`)
  - `contentVariants.by_channel_and_status` (`channel`, `status`)
  - `contentVariants.by_item` (`contentItemId`)
- `handleGenerate` en `planner/page.tsx:207` llama `generateCal({ startDate, endDate, channel, overwriteUnlocked })`.
- Restricción de guidelines: NO usar `.filter()` en queries (usar índice), preferir `.take()` sobre
  `.collect()`. La query nueva debe ser acotada.

---

## 1. Archivos a crear / modificar

| Archivo | Acción | Descripción |
|---|---|---|
| `convex/schema.ts` | Modificar | Nuevo índice `by_status` en `contentVariants` para listar variantes aprobadas por status sin depender del canal. (Ver §6 — opcional; se puede reutilizar `by_channel_and_status` iterando canales.) |
| `convex/contentItems.ts` | Modificar | Nueva query `listApprovedForCalendar` que devuelve items aprobados con variantes activas aprobadas + metadata para el modal. |
| `convex/actions/scoring.ts` | Modificar | `generateCalendar` acepta `selectedItemIds?: Id<'contentItems'>[]`; restringe el pool `eligible` a esos ids. |
| `components/planner/CalendarGenerateModal.tsx` | Crear | Componente client-side del modal de selección. |
| `app/(dashboard)/planner/page.tsx` | Modificar | "Generar calendario" abre el modal; el modal dispara la generación con `selectedItemIds`. |

---

## 2. Nueva query Convex — `listApprovedForCalendar`

Ubicación: `convex/contentItems.ts` (sección QUERIES).

Objetivo: devolver items `approved` que tengan al menos una `contentVariant` con
`status='approved'` e `isActive=true`, con los campos que el modal necesita y la lista de canales
disponibles por item.

Estrategia (respeta guidelines: índice + bounded):

1. Leer items aprobados via `by_status` con `.take(500)` (cota; el catálogo no crece a millones).
2. Para cada item, leer sus variantes via índice `by_item` con `.take(10)` (un item tiene a lo sumo
   2 canales × pocas versiones activas). Filtrar en JS por `isActive && status==='approved'`.
   - No usar `.filter()` en la query DB (guideline). El filtrado de booleano `isActive`/`status` se
     hace en memoria sobre el pequeño conjunto por item, igual que ya hace `countByStatus`.
3. Quedarse solo con items que tengan ≥1 canal aprobado.

```ts
// ── Query: items aprobados con variante activa aprobada (para modal de calendario) ──
export const listApprovedForCalendar = query({
  args: {
    // Filtros opcionales aplicados server-side para acotar payload
    contentType: v.optional(contentTypeV),
    channel: v.optional(v.union(v.literal('tumblr'), v.literal('x'))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<{
    itemId: string
    title: string
    contentType: string
    coverImageUrl?: string
    channels: Array<'tumblr' | 'x'>   // canales con variante activa aprobada
  }>> => {
    // 1. Items aprobados (bounded). Si hay search, usar el searchIndex existente.
    let items
    if (args.search && args.search.trim().length > 0) {
      items = await ctx.db
        .query('contentItems')
        .withSearchIndex('search_title', q =>
          q.search('title', args.search!).eq('status', 'approved')
        )
        .take(200)
    } else {
      items = await ctx.db
        .query('contentItems')
        .withIndex('by_status', q => q.eq('status', 'approved'))
        .take(500)
    }

    const result: Array<{
      itemId: string; title: string; contentType: string
      coverImageUrl?: string; channels: Array<'tumblr' | 'x'>
    }> = []

    for (const item of items) {
      // Filtro server-side por contentType
      if (args.contentType && item.contentType !== args.contentType) continue

      const variants = await ctx.db
        .query('contentVariants')
        .withIndex('by_item', q => q.eq('contentItemId', item._id))
        .take(10)

      const channels = new Set<'tumblr' | 'x'>()
      for (const variant of variants) {
        if (variant.isActive && variant.status === 'approved') {
          channels.add(variant.channel)
        }
      }
      if (channels.size === 0) continue                       // sin variante aprobada → fuera
      if (args.channel && !channels.has(args.channel)) continue // filtro de canal

      result.push({
        itemId: item._id,
        title: item.title,
        contentType: item.contentType,
        coverImageUrl: item.coverImageUrl,
        channels: Array.from(channels),
      })
    }

    return result
  },
})
```

Notas:
- `search_title` searchIndex ya tiene `filterFields: ['contentType','status','contentOrigin']`, así
  que `.eq('status','approved')` dentro del search es válido y eficiente.
- El filtro de `channel` es opcional: el modal puede mostrar todos los canales y solo deshabilitar
  selección por canal en cliente. Recomiendo pasar el `channel` actual del planner como default para
  que la lista coincida con lo que realmente se podrá generar (la generación es por canal único).
- Tipo de retorno explícito (los handlers con `ctx.runQuery`/recursión en este repo declaran el tipo;
  aquí no es obligatorio pero ayuda al tipado del cliente).

---

## 3. Modificación del action `generateCalendar`

Ubicación: `convex/actions/scoring.ts`.

Cambios:

1. Añadir arg `selectedItemIds?: v.array(v.id('contentItems'))`.
2. Convertir a `Set<string>` y, al construir el pool `eligible`, saltar items no seleccionados.

```ts
export const generateCalendar = action({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    channel: channelV,
    overwriteUnlocked: v.optional(v.boolean()),
    selectedItemIds: v.optional(v.array(v.id('contentItems'))),   // NUEVO
  },
  handler: async (ctx, args): Promise<{ slotsCreated: number; slotsSkipped: number; batchId: string }> => {
    // ... sin cambios hasta construir `eligible` ...

    // NUEVO: set de selección (undefined ⇒ sin restricción, comportamiento legacy)
    const selectedSet = args.selectedItemIds && args.selectedItemIds.length > 0
      ? new Set(args.selectedItemIds.map(id => id as string))
      : null

    const eligible: Candidate[] = []
    for (const item of allItems) {
      const itemId = item._id as string
      if (selectedSet && !selectedSet.has(itemId)) continue   // NUEVO: solo seleccionados
      const variant = variantMap.get(itemId)
      if (!variant) continue
      // ... resto igual (cooldown, fatigue, push) ...
    }
    // ... resto del handler sin cambios ...
  },
})
```

Consideración importante (limitación de `allItems`):
- `eligible` se construye iterando `allItems`, que proviene del top-300 de `channelScores`. Un item
  recién aprobado podría no tener `channelScores` aún → no aparecería en `allItems` → aunque esté
  seleccionado, no se agendaría.
- Hoy `channelScores.createForItem` se llama al crear el item (ver `contentItems.create:355` y
  `importBatchInternal:252`), así que en la práctica todo item tiene score. Si se quiere blindar:
  ampliar `getDataForGenerationInternal` para que, cuando lleguen `selectedItemIds`, cargue esos
  items directamente por id además del top-300. **Recomendado dejarlo como mejora opcional** y
  documentar la precondición "ejecutar Actualizar scores si un item no aparece".

Decisión de diseño: cuando `selectedItemIds` viene definido y no vacío, el modal ya garantizó que
esos items tienen variante aprobada activa; el cooldown/topic-fatigue se siguen aplicando para no
romper las reglas editoriales. Si el usuario quiere forzar incluso con cooldown, sería otra feature.

---

## 4. Componente Modal — `components/planner/CalendarGenerateModal.tsx`

Client component (`'use client'`). Sigue el patrón visual de `SlotDetailModal`/`AddSlotModal`
(overlay `fixed inset-0 bg-black/40`, panel `bg-white rounded-xl`).

### Props

```ts
interface CalendarGenerateModalProps {
  channel: 'tumblr' | 'x'
  startDate: string
  endDate: string
  onClose: () => void
  // Dispara la generación; devuelve el resultado para que la página muestre feedback
  onGenerate: (selectedItemIds: string[]) => Promise<void>
  generating: boolean
}
```

### Estado interno

```ts
const [search, setSearch] = useState('')
const [typeFilter, setTypeFilter] = useState<string | 'all'>('all')
const [channelFilter, setChannelFilter] = useState<'tumblr' | 'x' | 'all'>(channel)
const [selected, setSelected] = useState<Set<string>>(new Set())
```

### Datos

```ts
const items = useQuery(api.contentItems.listApprovedForCalendar, {
  contentType: typeFilter === 'all' ? undefined : typeFilter,
  channel:     channelFilter === 'all' ? undefined : channelFilter,
  search:      search.trim() || undefined,
})
```

- `items === undefined` → estado "Cargando…".
- Búsqueda: debounce ligero (200-300 ms) con `useState`+`useEffect`/`setTimeout`, o filtrar también
  en cliente sobre el resultado para respuesta inmediata. Server-side search es la fuente de verdad.

### Selección

- `toggleOne(itemId)`: add/remove en el `Set`.
- `toggleAll()`: si todos los visibles seleccionados → limpiar; si no → seleccionar todos los visibles.
- Mostrar contador `selected.size`.
- Al cambiar filtros, mantener selección (no resetear) para no perder elecciones previas.

### Sub-componentes

1. `CalendarGenerateModal` (contenedor): header, barra de filtros, lista, footer.
2. `ItemRow` (interno): una fila por item — checkbox, thumbnail (`coverImageUrl` o placeholder),
   título, badge de tipo (reusar `TYPE_COLORS` — extraer a `lib/constants` o duplicar), chips de
   canales disponibles (`channels`).
3. (Opcional) `ChannelChip` / `TypeBadge` helpers.

### Layout

```
┌───────────────────────────────────────────────┐
│ Generar calendario · {Mes Año} · Canal: X    ✕ │
├───────────────────────────────────────────────┤
│ [🔍 buscar título…]  [Tipo ▾]  [Canal ▾]       │
│ [☑ Seleccionar todos]            N seleccionados│
├───────────────────────────────────────────────┤
│ ☑ [img] Título…        comic   [tumblr][x]     │  ← scroll (max-h-[60vh])
│ ☐ [img] Título…        cosplay [tumblr]        │
│ …                                               │
├───────────────────────────────────────────────┤
│            [Cancelar]  [Generar con N seleccionados] │
└───────────────────────────────────────────────┘
```

- Filtro de tipo: opciones desde los 9 `contentType` del schema.
- Botón "Generar con N seleccionados": `disabled` si `selected.size === 0 || generating`.
  Texto dinámico: `Generando…` mientras `generating`.
- `onClick` → `await onGenerate(Array.from(selected))`. La página cierra el modal tras éxito.

### Accesibilidad / UX

- Cerrar con click en overlay y botón ✕ (igual que modales existentes).
- Imagen: `next/image` o `<img>` con `loading="lazy"`, fallback gris si no hay `coverImageUrl`.
- Lista vacía: mensaje "No hay publicaciones aprobadas con variantes para este canal".

---

## 5. Cambios en `app/(dashboard)/planner/page.tsx`

1. **Nuevo estado de apertura del modal**:
   ```ts
   const [showGenModal, setShowGenModal] = useState(false)
   ```

2. **El botón "Generar calendario" abre el modal** (ya no genera directo):
   ```tsx
   <button type="button" onClick={() => setShowGenModal(true)} disabled={generating} ...>
     {generating ? 'Generando…' : 'Generar calendario'}
   </button>
   ```

3. **Refactor de `handleGenerate`** para aceptar ids y ser invocado desde el modal:
   ```ts
   async function handleGenerate(selectedItemIds: string[]) {
     setGenerating(true); setGenError(null); setGenResult(null)
     const effectiveStart = startDate < today ? today : startDate
     try {
       setGenResult(await generateCal({
         startDate: effectiveStart,
         endDate,
         channel,
         overwriteUnlocked: true,
         selectedItemIds: selectedItemIds as any,   // Id<'contentItems'>[]
       }))
       setShowGenModal(false)   // cerrar modal al terminar OK
     } catch (err) {
       setGenError(err instanceof Error ? err.message : 'Error')
     } finally {
       setGenerating(false)
     }
   }
   ```

4. **Render del modal** junto a los otros modales (antes del cierre del componente):
   ```tsx
   {showGenModal && (
     <CalendarGenerateModal
       channel={channel}
       startDate={startDate}
       endDate={endDate}
       generating={generating}
       onClose={() => setShowGenModal(false)}
       onGenerate={handleGenerate}
     />
   )}
   ```

5. **Import** del componente:
   ```ts
   import CalendarGenerateModal from '@/components/planner/CalendarGenerateModal'
   ```

El feedback (`genResult`/`genError`) y el banner de pendientes se mantienen igual: el modal cierra
en éxito y la página muestra "{slotsCreated} slots creados…".

---

## 6. Índices nuevos en `schema.ts`

No es estrictamente necesario un índice nuevo: la query reutiliza `contentItems.by_status`,
`contentItems.search_title` y `contentVariants.by_item` (todos ya existen).

Opcional — si se quiere evitar el N+1 de leer variantes por item (un `ctx.db.get`+query por cada uno
de hasta 500 items), añadir índice para barrer variantes aprobadas activas de una sola pasada:

```ts
// contentVariants
.index('by_status', ['status'])          // barrer todas las 'approved' y agrupar por contentItemId
```

Con ese índice, una alternativa más eficiente para `listApprovedForCalendar`:
1. `contentVariants.withIndex('by_status', q => q.eq('status','approved')).take(1000)`,
   filtrar `isActive` en JS, agrupar canales por `contentItemId`.
2. Cargar cada `contentItem` distinto y filtrar `status==='approved'`.

Trade-off: el enfoque del §2 (iterar items aprobados) es más simple y suficiente para el volumen
actual (catálogo pequeño). Recomiendo **empezar sin índice nuevo**; añadir `by_status` solo si el
catálogo crece y el modal se nota lento. Decisión documentada aquí para no bloquear la implementación.

---

## 7. Orden de implementación sugerido

1. `convex/contentItems.ts` — añadir `listApprovedForCalendar`. Verificar con `npx convex dev` que
   compila y aparece en `api`.
2. `convex/actions/scoring.ts` — añadir `selectedItemIds` y el `selectedSet` filter.
3. `components/planner/CalendarGenerateModal.tsx` — crear el modal con datos mock primero, luego
   conectar la query.
4. `app/(dashboard)/planner/page.tsx` — estado `showGenModal`, refactor `handleGenerate`, render.
5. Prueba E2E manual: aprobar item + variante, abrir modal, filtrar, seleccionar subset, generar,
   confirmar que solo esos items aparecen en slots del mes.

## 8. Casos borde a cubrir

- Sin items aprobados → modal muestra vacío; botón deshabilitado.
- Item seleccionado en cooldown/topic-fatigue → no se agenda (esperado); el resumen
  `slotsSkipped` lo refleja. Considerar mostrar aviso "X seleccionados, Y agendados" leyendo
  `slotsCreated` vs `selected.size`.
- Cambio de canal en el planner mientras el modal está cerrado: el modal usa el `channel` actual al
  abrirse (prop), correcto.
- `selectedItemIds` vacío no debería llegar al action (botón deshabilitado), pero el action trata
  `[]`/`undefined` como "sin restricción" (legacy) — para evitar generar con todo por accidente, el
  guard del botón en cliente es la defensa principal.
