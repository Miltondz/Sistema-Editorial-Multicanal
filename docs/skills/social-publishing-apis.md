# Skill: Social Publishing APIs
# Patrones correctos para Tumblr API v2 y X API v2 en este proyecto

---

## 1. Tumblr API v2 — Autenticación

Tumblr usa **OAuth 1.0a** (no OAuth 2.0). Es más complejo que OAuth 2.0.
Usar la librería `tumblr.js` para simplificar el manejo de firma de requests.

```bash
npm install tumblr.js
```

```typescript
// lib/integrations/tumblr.ts
import tumblr from 'tumblr.js'

// Las credenciales vienen de variables de entorno — NUNCA hardcodear
const client = tumblr.createClient({
  consumer_key:    process.env.TUMBLR_CONSUMER_KEY!,
  consumer_secret: process.env.TUMBLR_CONSUMER_SECRET!,
  token:           process.env.TUMBLR_OAUTH_TOKEN!,
  token_secret:    process.env.TUMBLR_OAUTH_TOKEN_SECRET!,
})

// Verificar conexión al inicializar
export async function verifyTumblrCredentials(): Promise<boolean> {
  try {
    await client.userInfo()
    return true
  } catch {
    return false
  }
}
```

---

## 2. Tumblr API v2 — Importación (fetchAllPosts)

```typescript
// lib/integrations/tumblr.ts

export interface TumblrPost {
  id: string
  type: 'text' | 'photo' | 'link' | 'quote' | 'video' | 'audio' | 'chat'
  timestamp: number        // Unix timestamp en segundos
  slug: string
  tags: string[]
  post_url: string
  // Campos por tipo:
  photos?: Array<{
    original_size: { url: string; width: number; height: number }
    alt_sizes: Array<{ url: string; width: number; height: number }>
  }>
  body?: string            // type: text
  caption?: string         // type: photo, video
  url?: string             // type: link
  title?: string           // type: link, text
  description?: string     // type: link
  source_url?: string      // type: quote
  text?: string            // type: quote
}

const TUMBLR_PAGE_SIZE = 20 // máximo permitido por la API

export async function fetchAllPosts(
  blogName: string,
  onPage: (posts: TumblrPost[]) => Promise<void>
): Promise<void> {
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const response = await client.blogPosts(blogName, {
      limit: TUMBLR_PAGE_SIZE,
      offset,
      reblog_info: false,
      notes_info: false,
    })

    const posts = response.posts as TumblrPost[]

    if (posts.length === 0) {
      hasMore = false
      break
    }

    await onPage(posts)
    offset += posts.length

    // Rate limiting: Tumblr permite ~250 requests/hora en OAuth
    // Esperar 500ms entre páginas para no saturar
    if (posts.length === TUMBLR_PAGE_SIZE) {
      await new Promise(resolve => setTimeout(resolve, 500))
    } else {
      hasMore = false
    }
  }
}
```

---

## 3. Tumblr API v2 — Publicación

Tumblr maneja tres tipos de posts relevantes para este proyecto.
El tipo se elige según el contenido del ítem.

```typescript
// lib/integrations/tumblr.ts

export interface TumblrPublishParams {
  blogName: string
  type: 'photo' | 'text' | 'link'
  // Para type: 'photo'
  caption?: string
  imageUrls?: string[]     // URLs públicas de imágenes — máx 10
  // Para type: 'text'
  title?: string
  body?: string            // HTML permitido
  // Para type: 'link'
  linkUrl?: string
  linkTitle?: string
  linkDescription?: string
  // Comunes
  tags: string[]           // máx 30 tags, cada uno máx 140 chars
  nativeInlineImages?: boolean
}

export async function publishPost(
  params: TumblrPublishParams
): Promise<{ id: string; url: string }> {

  let payload: Record<string, unknown>

  if (params.type === 'photo') {
    // IMPORTANTE: Tumblr acepta source (URL externa) o data (base64)
    // Para este proyecto usamos source con URLs de Convex Storage
    payload = {
      type: 'photo',
      source: params.imageUrls?.join(',') ?? '',
      caption: params.caption ?? '',
      tags: params.tags.join(','),
    }
  } else if (params.type === 'text') {
    payload = {
      type: 'text',
      title: params.title ?? '',
      body: params.body ?? '',
      tags: params.tags.join(','),
    }
  } else {
    // type: 'link'
    payload = {
      type: 'link',
      url: params.linkUrl ?? '',
      title: params.linkTitle ?? '',
      description: params.linkDescription ?? '',
      tags: params.tags.join(','),
    }
  }

  const response = await client.createPost(params.blogName, payload)

  // La respuesta incluye el id del post creado
  const postId = String(response.id)
  const postUrl = `https://${params.blogName}.tumblr.com/post/${postId}`

  return { id: postId, url: postUrl }
}

// Seleccionar tipo de post según el ContentItem:
export function selectPostType(
  hasImages: boolean,
  hasBuyLink: boolean
): 'photo' | 'link' | 'text' {
  if (hasImages) return 'photo'   // priorizar imagen
  if (hasBuyLink) return 'link'   // si tiene enlace, usar link post
  return 'text'
}
```

---

## 4. X API v2 — Autenticación

X usa **OAuth 1.0a User Context** para escribir tweets en nombre del usuario.
Usar la librería `twitter-api-v2`.

```bash
npm install twitter-api-v2
```

```typescript
// lib/integrations/x.ts
import { TwitterApi } from 'twitter-api-v2'

// IMPORTANTE: para posting necesitamos OAuth 1.0a con tokens de usuario
// NO usar solo API Key + Secret (eso es app-only, solo para lectura)
const xClient = new TwitterApi({
  appKey:        process.env.X_API_KEY!,
  appSecret:     process.env.X_API_SECRET!,
  accessToken:   process.env.X_ACCESS_TOKEN!,
  accessSecret:  process.env.X_ACCESS_TOKEN_SECRET!,
})

// El cliente writable expone los endpoints de escritura
export const xReadWrite = xClient.readWrite

export async function verifyXCredentials(): Promise<boolean> {
  try {
    await xReadWrite.v2.me()
    return true
  } catch {
    return false
  }
}
```

---

## 5. X API v2 — Publicación de tweets

**Crítico**: en X API v2, el upload de media es un paso SEPARADO y usa v1.1, no v2.
El texto del tweet tiene límite de 280 caracteres incluyendo URLs (las URLs cuentan como 23 chars).

```typescript
// lib/integrations/x.ts

export interface XPublishParams {
  text: string           // máx 280 chars — las URLs cuentan como 23 chars c/u
  imageUrls?: string[]   // URLs públicas de imágenes a adjuntar — máx 4
}

export async function publishTweet(
  params: XPublishParams
): Promise<{ id: string; url: string }> {

  let mediaIds: string[] = []

  // PASO 1: Subir media si hay imágenes
  // IMPORTANTE: el upload de media usa v1.1, no v2
  // y requiere descargar la imagen primero (no acepta URLs directamente)
  if (params.imageUrls && params.imageUrls.length > 0) {
    mediaIds = await uploadMediaFiles(params.imageUrls)
  }

  // PASO 2: Publicar el tweet con los media_ids
  const tweetPayload: Parameters<typeof xReadWrite.v2.tweet>[0] = {
    text: params.text,
  }

  if (mediaIds.length > 0) {
    tweetPayload.media = { media_ids: mediaIds as [string, ...string[]] }
  }

  const response = await xReadWrite.v2.tweet(tweetPayload)
  const tweetId = response.data.id
  // Construir URL del tweet — necesitamos el username
  const me = await xReadWrite.v2.me()
  const tweetUrl = `https://x.com/${me.data.username}/status/${tweetId}`

  return { id: tweetId, url: tweetUrl }
}

// Upload de imágenes — proceso de dos pasos usando v1.1
async function uploadMediaFiles(imageUrls: string[]): Promise<string[]> {
  const mediaIds: string[] = []

  for (const url of imageUrls.slice(0, 4)) { // X permite máx 4 imágenes
    // 1. Descargar la imagen desde Convex Storage
    const imageResponse = await fetch(url)
    const imageBuffer = await imageResponse.arrayBuffer()
    const mimeType = imageResponse.headers.get('content-type') ?? 'image/jpeg'

    // 2. Subir a X usando v1.1 media upload
    const mediaId = await xReadWrite.v1.uploadMedia(Buffer.from(imageBuffer), {
      mimeType,
    })

    mediaIds.push(mediaId)
  }

  return mediaIds
}
```

---

## 6. X API v2 — Límites y throttling

```typescript
// lib/integrations/x.ts

// X API free tier: 500 escrituras/mes
// Este contador debe persistirse en Convex para hacer tracking

export const X_MONTHLY_WRITE_LIMIT = 500
export const X_WRITE_ALERT_THRESHOLD = 0.8 // alertar al 80% = 400 escrituras

// En convex/actions/publisher.ts, antes de publicar en X:
async function checkXRateLimit(ctx: ActionCtx): Promise<void> {
  const count = await ctx.runQuery(internal.publicationLog.countXPostsThisMonth, {})

  if (count >= X_MONTHLY_WRITE_LIMIT) {
    throw new Error(`X API monthly write limit reached (${X_MONTHLY_WRITE_LIMIT} posts)`)
  }

  if (count >= X_MONTHLY_WRITE_LIMIT * X_WRITE_ALERT_THRESHOLD) {
    // Registrar alerta — visible en dashboard
    await ctx.runMutation(internal.auditEvents.log, {
      entityType: 'system',
      entityId: undefined,
      eventType: 'x.rate_limit_warning',
      payloadJson: { currentCount: count, limit: X_MONTHLY_WRITE_LIMIT },
    })
  }
}

// En convex/publicationLog.ts — query para contar posts de X este mes:
export const countXPostsThisMonth = internalQuery({
  args: {},
  handler: async (ctx) => {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const posts = await ctx.db
      .query('publicationLog')
      .withIndex('by_channel', q => q.eq('channel', 'x'))
      .filter(q =>
        q.and(
          q.eq(q.field('publishStatus'), 'success'),
          q.gte(q.field('_creationTime'), startOfMonth.getTime())
        )
      )
      .collect()

    return posts.length
  },
})
```

---

## 7. X API v2 — Parser del export JSON

```typescript
// lib/integrations/x.ts

// El export de X viene en data/tweet.js con este formato:
// window.YTD.tweet.part0 = [ { tweet: { ... } }, ... ]
// NO es JSON puro — hay que limpiar el prefijo antes de parsear

export interface XExportTweet {
  tweet: {
    id: string
    full_text: string
    created_at: string  // "Mon Jan 01 00:00:00 +0000 2024"
    entities?: {
      urls?: Array<{
        url: string           // URL acortada t.co
        expanded_url: string  // URL real
        display_url: string
      }>
      media?: Array<{
        media_url_https: string
        type: 'photo' | 'video' | 'animated_gif'
      }>
    }
    in_reply_to_status_id?: string  // si es respuesta, ignorar en import
    retweeted_status_id?: string    // si es RT, ignorar en import
  }
}

export function parseTweetExport(fileContent: string): XExportTweet['tweet'][] {
  // Limpiar el prefijo de JavaScript
  const jsonContent = fileContent
    .replace(/^window\.YTD\.tweet\.part\d+\s*=\s*/, '')
    .trim()

  const raw: XExportTweet[] = JSON.parse(jsonContent)

  return raw
    .map(item => item.tweet)
    .filter(tweet => {
      // Filtrar respuestas y retweets — no son contenido original
      if (tweet.in_reply_to_status_id) return false
      if (tweet.full_text.startsWith('RT @')) return false
      return true
    })
}

// Normalizar un tweet exportado a CreateContentItemArgs:
export function normalizeTweetToContentItem(
  tweet: XExportTweet['tweet']
): Partial<CreateContentItemArgs> {
  // Expandir URLs acortadas en el texto
  let text = tweet.full_text
  if (tweet.entities?.urls) {
    for (const url of tweet.entities.urls) {
      text = text.replace(url.url, url.expanded_url)
    }
  }

  // Extraer buy_link — primer enlace no-media del tweet
  const buyLink = tweet.entities?.urls?.find(
    u => !u.expanded_url.includes('t.co/') &&
         !u.expanded_url.includes('twitter.com') &&
         !u.expanded_url.includes('x.com')
  )?.expanded_url

  return {
    title: text.slice(0, 100), // título provisional — para revisión manual
    summary: text,
    contentOrigin: 'imported',
    sourcePlatform: 'x',
    sourcePostId: tweet.id,
    sourcePostUrl: `https://x.com/i/status/${tweet.id}`,
    sourceDate: new Date(tweet.created_at).getTime(),
    buyLink,
    contentType: 'comic', // provisional — para revisión manual
  }
}
```

---

## 8. Manejo de errores de API — patrones por caso

```typescript
// lib/integrations/tumblr.ts y x.ts

// Tumblr errores comunes:
// 401 — credenciales inválidas o expiradas
// 403 — blog no encontrado o sin permisos
// 429 — rate limit (250 req/hora en OAuth)
// 503 — Tumblr down (frecuente)

// X errores comunes:
// 401 — credenciales inválidas
// 403 — cuenta suspendida o sin permisos de escritura
// 429 — rate limit de la API
// 453 — monthly cap alcanzado (free tier)

export class SocialPublishError extends Error {
  constructor(
    message: string,
    public readonly platform: 'tumblr' | 'x',
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'SocialPublishError'
  }
}

// En el publisher action, clasificar si el error es reintentable:
function classifyError(error: unknown, platform: 'tumblr' | 'x'): SocialPublishError {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()

    // Rate limit — reintentable después de esperar
    if (msg.includes('429') || msg.includes('rate limit')) {
      return new SocialPublishError(error.message, platform, 429, true)
    }

    // Server error — reintentable
    if (msg.includes('503') || msg.includes('500')) {
      return new SocialPublishError(error.message, platform, 503, true)
    }

    // Monthly cap de X — NO reintentable
    if (msg.includes('453') || msg.includes('monthly')) {
      return new SocialPublishError(error.message, platform, 453, false)
    }

    // Auth error — NO reintentable (requiere acción manual)
    if (msg.includes('401') || msg.includes('403')) {
      return new SocialPublishError(error.message, platform, 401, false)
    }
  }

  return new SocialPublishError(String(error), platform, undefined, true)
}
```

---

## 9. Política de reintentos (en publisher action)

```typescript
// convex/actions/publisher.ts

const MAX_RETRIES = 3
const RETRY_BACKOFF_MS = [5000, 15000, 30000] // 5s, 15s, 30s

export const publishSlot = internalAction({
  args: { slotId: v.id('scheduleSlots') },
  handler: async (ctx, args) => {
    const slot = await ctx.runQuery(internal.scheduleSlots.getByIdInternal, { id: args.slotId })
    if (!slot) throw new Error('Slot not found')

    const currentRetry = slot.retryCount ?? 0

    try {
      // Intentar publicar
      const result = await ctx.runAction(internal.actions.publisher.publishDirect, {
        contentItemId: slot.contentItemId!,
        channel: slot.channel,
        variantId: slot.variantId,
      })

      if (result.success) {
        await ctx.runMutation(internal.scheduleSlots.updateStatus, {
          id: args.slotId,
          status: 'published',
        })
      } else {
        throw new Error(result.error ?? 'Unknown publish error')
      }

    } catch (error) {
      const publishError = classifyError(error, slot.channel as 'tumblr' | 'x')

      if (publishError.retryable && currentRetry < MAX_RETRIES - 1) {
        // Programar reintento con backoff
        const delayMs = RETRY_BACKOFF_MS[currentRetry] ?? 30000
        await ctx.scheduler.runAfter(
          delayMs,
          internal.actions.publisher.publishSlot,
          { slotId: args.slotId }
        )
        await ctx.runMutation(internal.scheduleSlots.incrementRetry, { id: args.slotId })
      } else {
        // Agotar reintentos o error no reintentable
        await ctx.runMutation(internal.scheduleSlots.updateStatus, {
          id: args.slotId,
          status: 'failed',
        })
        await ctx.runMutation(internal.auditEvents.log, {
          entityType: 'scheduleSlot',
          entityId: args.slotId,
          eventType: 'slot.failed',
          payloadJson: {
            error: publishError.message,
            statusCode: publishError.statusCode,
            retryCount: currentRetry,
          },
        })
      }
    }
  },
})
```

---

## 10. Construcción del payload por canal

```typescript
// convex/actions/publisher.ts
// Cómo construir el payload final para cada canal a partir de un ContentVariant

function buildTumblrPayload(
  variant: ContentVariant,
  item: ContentItem,
  mediaAssets: MediaAsset[]
): TumblrPublishParams {
  const hasImages = mediaAssets.length > 0
  const postType = selectPostType(hasImages, !!item.buyLink)

  // Tags: combinar representation_tags + theme_tags + content_type
  const tags = [
    ...item.representationTags,
    ...item.themeTags,
    item.contentType,
    'superherosincolor',
  ].slice(0, 30) // máx 30 tags

  return {
    blogName: process.env.TUMBLR_BLOG_NAME!,
    type: postType,
    caption: postType === 'photo'
      ? `${variant.headline}\n\n${variant.bodyText}\n\n${variant.ctaText ?? ''}`
      : undefined,
    body: postType === 'text'
      ? `<h2>${variant.headline}</h2>\n${variant.bodyText}\n\n${variant.ctaText ?? ''}`
      : undefined,
    imageUrls: postType === 'photo'
      ? mediaAssets.map(a => a.publicUrl).slice(0, 10)
      : undefined,
    linkUrl: postType === 'link' ? item.buyLink ?? undefined : undefined,
    linkTitle: postType === 'link' ? variant.headline ?? undefined : undefined,
    linkDescription: postType === 'link' ? variant.bodyText ?? undefined : undefined,
    tags,
  }
}

function buildXPayload(
  variant: ContentVariant,
  item: ContentItem,
  mediaAssets: MediaAsset[]
): XPublishParams {
  // Combinar headline + body + cta respetando el límite de 280 chars
  // Las URLs cuentan como 23 chars en X independientemente de su longitud
  const ctaWithLink = variant.ctaText ?? item.buyLink ?? ''
  const urlCharCount = ctaWithLink.startsWith('http') ? 23 : ctaWithLink.length
  const availableChars = 280 - urlCharCount - 2 // 2 para saltos de línea

  let text = variant.bodyText ?? ''
  if (text.length > availableChars) {
    text = text.slice(0, availableChars - 3) + '...'
  }

  const fullText = [text, ctaWithLink].filter(Boolean).join('\n\n')

  return {
    text: fullText,
    imageUrls: mediaAssets.map(a => a.publicUrl).slice(0, 4), // máx 4 en X
  }
}
```

---

## 11. Antipatrones a evitar

```typescript
// ❌ NO intentar subir imágenes a X pasando solo la URL
// X NO acepta URLs de imágenes directamente — hay que descargar y subir como buffer
await xClient.v1.uploadMedia('https://cdn.example.com/image.jpg') // FALLA

// ✅ CORRECTO — descargar primero, luego subir como buffer
const buffer = await fetch(url).then(r => r.arrayBuffer())
await xClient.v1.uploadMedia(Buffer.from(buffer), { mimeType: 'image/jpeg' })

// ❌ NO ignorar el monthly cap de X en free tier
// Si se agota, las publicaciones fallan con error 453 hasta el mes siguiente

// ❌ NO asumir que Tumblr acepta JSON con las imágenes como array
// El campo 'source' de Tumblr v2 espera URLs separadas por coma (string)
{ source: ['url1', 'url2'] } // FALLA
{ source: 'url1,url2' }      // CORRECTO

// ❌ NO hacer el upload de media y el tweet en la misma llamada en X
// Son dos requests separadas: primero uploadMedia(), luego tweet()

// ❌ NO usar OAuth 2.0 para escribir tweets — X requiere OAuth 1.0a User Context
// OAuth 2.0 Bearer Token es solo para lectura (search, timeline público)

// ❌ NO construir la URL del tweet manualmente sin verificar el username actual
// El username puede cambiar — siempre obtenerlo via v2.me()
```
