# Skill: Convex Patterns
# Referencia de patrones correctos para este proyecto (Convex + Next.js 14)

---

## 1. Cuándo usar cada tipo de función

| Tipo | Cuándo usarlo | Puede acceder a DB | Puede llamar APIs externas |
|---|---|---|---|
| `query` | Leer datos, reactivo en UI | ✅ solo lectura | ❌ |
| `mutation` | Escribir datos desde UI o internamente | ✅ lectura + escritura | ❌ |
| `action` | Lógica con efectos secundarios | ❌ directo — usa `ctx.runQuery` / `ctx.runMutation` | ✅ |
| `internalQuery` | Query que solo llaman otras funciones Convex | ✅ solo lectura | ❌ |
| `internalMutation` | Mutation que solo llaman actions o scheduled functions | ✅ lectura + escritura | ❌ |
| `internalAction` | Action interna — scheduled functions, cron jobs | ❌ directo — usa `ctx.runMutation` | ✅ |

**Regla crítica**: las `action` NO pueden leer ni escribir a la DB directamente.
Siempre deben usar `ctx.runQuery(internal.module.functionName, args)` o
`ctx.runMutation(internal.module.functionName, args)`.

---

## 2. Estructura correcta de una action que escribe a la DB

```typescript
// ❌ INCORRECTO — las actions no tienen ctx.db
export const publishDirect = action({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.contentItemId) // ROMPE EN RUNTIME
  },
})

// ✅ CORRECTO — la action delega lectura/escritura a query/mutation internas
export const publishDirect = action({
  args: { contentItemId: v.id('contentItems') },
  handler: async (ctx, args) => {
    // Leer via internalQuery
    const item = await ctx.runQuery(internal.contentItems.getByIdInternal, {
      id: args.contentItemId,
    })
    // Llamar API externa
    const result = await tumblrAdapter.publishPost({ ... })
    // Escribir via internalMutation
    await ctx.runMutation(internal.publicationLog.create, {
      contentItemId: args.contentItemId,
      publishStatus: 'success',
      externalPostUrl: result.url,
    })
  },
})
```

---

## 3. Exponer funciones internas correctamente

```typescript
// convex/contentItems.ts

import { query, mutation, internalQuery, internalMutation } from './_generated/server'
import { internal } from './_generated/api'

// Pública — llamada desde componentes React via useQuery
export const getById = query({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Interna — llamada desde actions via ctx.runQuery
export const getByIdInternal = internalQuery({
  args: { id: v.id('contentItems') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Interna — llamada desde actions via ctx.runMutation
export const updateStatusInternal = internalMutation({
  args: { id: v.id('contentItems'), status: contentStatus },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status })
  },
})
```

---

## 4. Paginación con usePaginatedQuery

```typescript
// ✅ Convex tiene su propio sistema de paginación — NO usar offset/limit manual

// En convex/contentItems.ts:
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(contentStatus),
    contentType: v.optional(contentType),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query('contentItems')

    // Aplicar filtros antes de paginar
    if (args.status) {
      q = q.withIndex('by_status', (q) => q.eq('status', args.status!))
    }

    return await q.paginate(args.paginationOpts)
  },
})

// En el componente React:
import { usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

function CatalogTable() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.contentItems.list,
    { status: 'approved' },
    { initialNumItems: 25 }
  )

  return (
    <>
      {results.map(item => <ItemRow key={item._id} item={item} />)}
      {status === 'CanLoadMore' && (
        <button onClick={() => loadMore(25)}>Cargar más</button>
      )}
    </>
  )
}
```

---

## 5. Búsqueda de texto con searchIndex

```typescript
// En schema.ts — definir el índice:
contentItems: defineTable({ ... })
  .searchIndex('search_title', {
    searchField: 'title',
    filterFields: ['contentType', 'status', 'contentOrigin'],
  }),

// En convex/contentItems.ts — usar el índice:
export const search = query({
  args: {
    searchTerm: v.string(),
    contentType: v.optional(contentType),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query('contentItems')
      .withSearchIndex('search_title', (q) => {
        let sq = q.search('title', args.searchTerm)
        if (args.contentType) sq = sq.eq('contentType', args.contentType)
        return sq
      })

    return await q.paginate(args.paginationOpts)
  },
})
```

---

## 6. Manejo de IDs de Convex

```typescript
// Los IDs de Convex son strings opacos con tipo genérico Id<'tableName'>
// NUNCA construir IDs manualmente ni comparar como strings crudos

import { Id } from './_generated/dataModel'

// ❌ INCORRECTO
const id: string = '123abc'
const item = await ctx.db.get(id) // error de tipos

// ✅ CORRECTO — los IDs vienen del schema o de resultados previos
const item = await ctx.db.get(args.id) // args.id es Id<'contentItems'>

// ✅ Para pasar IDs entre action y mutation interna:
await ctx.runMutation(internal.contentItems.updateStatusInternal, {
  id: args.contentItemId, // Id<'contentItems'> se serializa correctamente
  status: 'published',
})

// ✅ Para convertir string a Id (cuando viene de URL params):
import { v } from 'convex/values'
// El validator v.id('contentItems') valida y convierte automáticamente
```

---

## 7. Convex File Storage (imágenes)

```typescript
// El upload de archivos es un proceso de dos pasos:
// 1. Obtener URL de upload desde el cliente
// 2. Subir el archivo directamente a esa URL
// 3. Guardar el storageId en la DB

// En convex/mediaAssets.ts:
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const saveMediaAsset = mutation({
  args: {
    contentItemId: v.id('contentItems'),
    storageId: v.id('_storage'),
    mimeType: v.string(),
    altText: v.optional(v.string()),
    isPrimary: v.boolean(),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId)
    if (!url) throw new Error('Storage URL not found')

    return await ctx.db.insert('mediaAssets', {
      contentItemId: args.contentItemId,
      storageId: args.storageId,
      publicUrl: url,
      mimeType: args.mimeType,
      altText: args.altText,
      isPrimary: args.isPrimary,
      sortOrder: 0,
      fileSizeBytes: undefined,
      width: undefined,
      height: undefined,
    })
  },
})

// En el componente React:
async function uploadImage(file: File, contentItemId: Id<'contentItems'>) {
  // 1. Obtener URL de upload
  const uploadUrl = await generateUploadUrl()

  // 2. Subir archivo
  const result = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  const { storageId } = await result.json()

  // 3. Guardar en DB
  await saveMediaAsset({ contentItemId, storageId, mimeType: file.type, isPrimary: false })
}
```

---

## 8. Scheduled Functions (cron jobs)

```typescript
// convex/crons.ts — único lugar donde se definen los schedules
import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Cada hora — publicar slots ready
crons.hourly(
  'publish pending slots',
  { minuteOffset: 0 },
  internal.scheduled.publishCron.publishPendingSlots
)

// Diario a las 2am UTC — recolectar métricas
crons.daily(
  'collect metrics',
  { hourUTC: 2, minuteUTC: 0 },
  internal.scheduled.metricsCron.collectMetrics
)

// Semanal — recomputar scores
crons.weekly(
  'recompute scores',
  { dayOfWeek: 'sunday', hourUTC: 3, minuteUTC: 0 },
  internal.scheduled.scoringCron.recomputeScores
)

export default crons

// Las scheduled functions son internalActions — usan ctx.runMutation para escribir:
// convex/scheduled/publishCron.ts
export const publishPendingSlots = internalAction({
  args: {},
  handler: async (ctx) => {
    const slots = await ctx.runQuery(internal.scheduleSlots.getReadySlots, {})
    for (const slot of slots) {
      await ctx.runAction(internal.actions.publisher.publishSlot, {
        slotId: slot._id,
      })
    }
  },
})
```

---

## 9. Hooks de Convex en componentes React

```typescript
// useQuery — reactivo, se actualiza automáticamente cuando cambian los datos
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'

function ItemDetail({ id }: { id: Id<'contentItems'> }) {
  // Se re-renderiza automáticamente si el item cambia en DB
  const item = useQuery(api.contentItems.getById, { id })

  const updateStatus = useMutation(api.contentItems.updateStatus)
  const publishDirect = useAction(api.actions.publisher.publishDirect)

  if (item === undefined) return <Spinner /> // loading
  if (item === null) return <NotFound />     // no existe

  async function handlePublish() {
    await publishDirect({ contentItemId: id, channel: 'tumblr' })
  }

  return <div>{item.title}</div>
}

// IMPORTANTE: useQuery devuelve undefined mientras carga, null si no existe
// Siempre manejar ambos casos
```

---

## 10. Manejo de errores en actions

```typescript
// Las actions deben capturar errores de APIs externas y persistirlos
// NUNCA dejar que un error de API externa rompa silenciosamente

export const publishDirect = action({
  args: { contentItemId: v.id('contentItems'), channel: channel },
  handler: async (ctx, args) => {
    let externalPostId: string | undefined
    let externalPostUrl: string | undefined
    let errorMessage: string | undefined
    let publishStatus: 'success' | 'failed' = 'failed'

    try {
      const result = await tumblrAdapter.publishPost({ ... })
      externalPostId = result.id
      externalPostUrl = result.url
      publishStatus = 'success'
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unknown error'
    }

    // Siempre persistir el resultado, exitoso o fallido
    await ctx.runMutation(internal.publicationLog.create, {
      contentItemId: args.contentItemId,
      channel: args.channel,
      publishStatus,
      externalPostId,
      externalPostUrl,
      errorMessage,
      retryCount: 0,
    })

    return { success: publishStatus === 'success', error: errorMessage }
  },
})
```

---

## 11. Convex Auth — protección de rutas

```typescript
// providers/ConvexProvider.tsx
'use client'
import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs'
import { ConvexReactClient } from 'convex/react'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  )
}

// middleware.ts — proteger rutas de dashboard
import { convexAuthNextjsMiddleware, createRouteMatcher } from '@convex-dev/auth/nextjs/server'

const isPublicRoute = createRouteMatcher(['/login'])

export default convexAuthNextjsMiddleware((request, { convexAuth }) => {
  if (!isPublicRoute(request) && !convexAuth.isAuthenticated()) {
    return Response.redirect(new URL('/login', request.url))
  }
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
```

---

## 12. Antipatrones a evitar

```typescript
// ❌ NO usar ctx.db dentro de una action
export const myAction = action({
  handler: async (ctx) => {
    await ctx.db.insert('contentItems', { ... }) // ROMPE
  },
})

// ❌ NO comparar Id<T> con strings directamente
if (item._id === 'some-string') { } // siempre falso

// ❌ NO olvidar que useQuery devuelve undefined al cargar
const item = useQuery(api.contentItems.getById, { id })
item.title // puede ser undefined — siempre hacer null check

// ❌ NO definir cron jobs fuera de convex/crons.ts
// ❌ NO usar fetch() directamente en mutations o queries
// ❌ NO llamar a APIs externas desde mutations — usar actions

// ✅ Las APIs externas SIEMPRE van en actions
// ✅ Las actions SIEMPRE delegan DB a internalQuery/internalMutation
// ✅ Los cron jobs SIEMPRE son internalActions registradas en crons.ts
```
