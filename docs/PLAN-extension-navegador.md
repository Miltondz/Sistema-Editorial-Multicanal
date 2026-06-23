# Plan de trabajo — Extensión de navegador para SuperheroesInColor

> Documento ejecutable. Cada contrato TypeScript es implementable directamente por Sonnet.
> Convención: **[CONVEX]** = backend Convex · **[EXT]** = extensión Chrome/Firefox.
> Stack confirmado del repo: Convex + `@convex-dev/auth` (Password provider), `convex/http.ts` con `httpRouter`, `convex/catalog.ts` con `upsertCharacter`/`upsertCreator` (dedup cvId→name).

---

## 1. Visión general y decisiones de arquitectura

### Objetivo
Extensión Chrome/Firefox que, en **cualquier página web** (no solo Comic Vine, Marvel, DC, Wikipedia o Fandom — también blogs, wikis, sitios de noticias, etc.), **extrae** datos de personaje/creador usando IA, los **coteja** contra el catálogo Convex, **decide** una acción (crear/actualizar/complementar/omitir), **sube la imagen** a Convex Storage y **muestra** el resultado en el popup — todo con un clic de confirmación humana.

### Estrategia de extracción (nuevo — clave del diseño)

```
CUALQUIER PÁGINA
       │
       ▼
[EXT] Content Script
  1. Captura texto visible (innerText, hasta ~8000 chars)
  2. Meta tags OG + JSON-LD + title + URL
  3. URL candidata de imagen principal
       │
       ▼ EXTRACT_REQUEST (page snapshot)
[SW] Background
       │
       ├─► Per-site extractor (si coincide host conocido)
       │     Extracción rápida sin costo de tokens
       │     Resultado: ExtractedHint (parcial)
       │
       └─► POST /ext/v1/extract  (HTTP Action → Claude)
             Recibe snapshot + hint opcional
             Claude devuelve ExtractedCharacter | ExtractedCreator | null
             Detecta tipo de página, extrae todos los campos, normaliza
             (funciona en CUALQUIER URL)
```

**Regla**: el per-site extractor es una *optimización* para sitios conocidos (más rápido, sin tokens). Siempre hay un path IA que funciona como fallback universal. En sitios desconocidos, solo IA.

### Topología completa

```
┌─────────────────┐  page snapshot   ┌──────────────────────┐  chrome.runtime  ┌──────────────┐
│ Content Script  │ ──────────────► │ Background SW         │ ◄─── messages ──►│ Popup (UI)   │
│ (cualquier URL) │  (text+meta+img) │ (orquestador)         │                  │ diff+confirm │
└─────────────────┘                  └──────────┬────────────┘                  └──────────────┘
                                                 │ fetch HTTPS (JWT)
                                                 ▼
                                    ┌────────────────────────────────┐
                                    │ Convex HTTP Actions /ext/v1/*  │
                                    │ convex/httpExt.ts              │
                                    │  ├ /extract  → Claude AI       │
                                    │  ├ /search/* → catalog queries │
                                    │  ├ /upsert/* → internal mut.   │
                                    │  └ /image/*  → ctx.storage     │
                                    └────────────────────────────────┘
```

### Decisiones clave
- **Manifest V3.** Obligatorio Chrome; Firefox soporta MV3.
- **Background = Service Worker** — efímero, stateless; estado en `chrome.storage.local`.
- **Auth = JWT** emitido por `/ext/v1/auth/login` (Password provider existente). Nunca API keys en el bundle.
- **Convex expuesto vía HTTP Actions REST** — no cliente WebSocket (el SW MV3 duerme y corta el socket).
- **AI = Claude (`claude-haiku-4-5` por defecto, configurable)** vía `ANTHROPIC_API_KEY` que ya existe en el dashboard Convex. La extensión no llama a Anthropic directamente.
- **Popup vanilla TS** — sin React. ~3-5 vistas, estado simple. Criterio de escalado a Preact: >6 vistas o formularios complejos reactivos.
- **`diversityTags` nunca se autocompletan por IA** — la IA puede *sugerir* tags pero siempre requieren confirmación humana explícita en el popup antes de guardar.

---

## 2. Contratos TypeScript estrictos

> Archivo compartido: `extension/src/shared/contracts.ts`. **[EXT]** salvo donde se indique **[CONVEX]**.

### 2.1 Snapshot de página (content script → background)

```typescript
/** Todo lo que el content script captura de la página activa. */
export interface PageSnapshot {
  url:        string
  title:      string
  /** innerText del body, truncado a 8000 chars (tokens manageable). */
  textContent: string
  /** JSON-LD objects encontrados (<script type="application/ld+json">). */
  jsonLd:     unknown[]
  /** Open Graph + meta tags relevantes. */
  meta: {
    description?: string
    ogTitle?:     string
    ogDescription?: string
    ogImage?:     string
    ogType?:      string
    ogUrl?:       string
    twitterTitle?: string
  }
  /** Candidatas a imagen principal, ordenadas por probabilidad. */
  imageUrls:  string[]
}
```

### 2.2 Datos extraídos de la página

```typescript
/** Sitio de origen; 'generic' para cualquier URL no reconocida. */
export type SourceSite =
  | 'comicvine'
  | 'marvel'
  | 'dc'
  | 'wikipedia'
  | 'fandom'
  | 'generic'         // cualquier blog/wiki/sitio de noticias

/** Tipo de entidad detectada en la página. */
export type PageKind = 'character' | 'creator' | 'unknown'

/** Procedencia de cada campo extraído. */
export type FieldProvenance = 'json-ld' | 'opengraph' | 'meta' | 'dom' | 'url' | 'ai'

/** Resultado rápido de detección (antes de extraer todo). */
export interface PageDetection {
  site:         SourceSite
  kind:         PageKind
  cvId?:        number           // si está en la URL de Comic Vine
  canonicalUrl: string
  confidence:   number           // 0..1
}

/** Lo que la extensión extrae de una página de PERSONAJE.
 *  Todos los campos opcionales; el extractor (per-site o IA) llena lo que encuentra. */
export interface ExtractedCharacter {
  kind:             'character'
  site:             SourceSite
  sourceUrl:        string
  name:             string                  // único requerido
  aliases?:         string[]
  realName?:        string
  deck?:            string
  publisher?:       string
  powers?:          string[]
  firstAppearance?: string
  universe?:        string
  mantleId?:        string                  // identidad canónica: "Batman", "Green Lantern"
  versionType?:     'original' | 'legacy' | 'alternate_universe' | 'future' | 'what_if'
  cvId?:            number
  cvUrl?:           string
  wikiUrl?:         string
  imageUrl?:        string
  /** Sugeridos por IA; NO se guardan sin confirmación humana. */
  suggestedDiversityTags?: string[]
  provenance:       Partial<Record<
    keyof Omit<ExtractedCharacter, 'kind' | 'provenance'>,
    FieldProvenance
  >>
}

/** Lo que la extensión extrae de una página de CREADOR. */
export interface ExtractedCreator {
  kind:         'creator'
  site:         SourceSite
  sourceUrl:    string
  name:         string
  aliases?:     string[]
  roles?:       string[]         // writer|artist|colorist|cover_artist|letterer|editor
  deck?:        string
  nationality?: string
  birthYear?:   number
  cvId?:        number
  cvUrl?:       string
  wikiUrl?:     string
  imageUrl?:    string
  /** Sugeridos por IA; NO se guardan sin confirmación humana. */
  suggestedDiversityTags?: string[]
  provenance:   Partial<Record<
    keyof Omit<ExtractedCreator, 'kind' | 'provenance'>,
    FieldProvenance
  >>
}

export type Extracted = ExtractedCharacter | ExtractedCreator

/** Hint parcial producido por un per-site extractor (antes de llamar a la IA). */
export type ExtractedHint = Partial<Omit<ExtractedCharacter, 'kind' | 'provenance'>>
                          | Partial<Omit<ExtractedCreator,   'kind' | 'provenance'>>
```

### 2.3 Contrato de extracción IA **[CONVEX]**

```typescript
/** Body enviado a POST /ext/v1/extract [CONVEX]. */
export interface AIExtractRequest {
  snapshot:  PageSnapshot
  /** Hint del per-site extractor, si existe (mejora la precisión del prompt). */
  hint?:     ExtractedHint
  /** Forzar tipo si el usuario lo seleccionó manualmente. */
  forceKind?: PageKind
}

/** Respuesta de /ext/v1/extract. */
export interface AIExtractResponse {
  extracted:    Extracted | null
  /** Null si la IA no pudo determinar el tipo. */
  kind:         PageKind
  /** Confianza 0..1 de la extracción IA. */
  confidence:   number
  /** Tokens consumidos (para mostrar en dev mode / logging). */
  tokensUsed:   number
  /** Texto de razonamiento interno de la IA (para debugging; no se muestra al usuario). */
  reasoning?:   string
}
```

### 2.4 Prompt del extractor IA **[CONVEX]** (`convex/actions/extractor.ts`)

```typescript
// El prompt se construye así (simplificado para el contrato):
const SYSTEM_PROMPT = `
Eres un extractor de datos de cómics. Analiza el contenido de la página y extrae información
estructurada sobre UN personaje de cómic o UN creador (escritor/artista/etc.).

Reglas:
- Si la página no es sobre un personaje o creador de cómics, devuelve null.
- Devuelve SOLO JSON válido, sin texto adicional.
- Para "kind": "character" si es un personaje ficticio, "creator" si es una persona real
  que trabaja en la industria.
- "name": nombre canónico (no alias).
- "universe": solo si se menciona explícitamente (Earth-616, Prime Earth, etc.).
- "versionType": "original"|"legacy"|"alternate_universe"|"future"|"what_if"
  — solo si hay evidencia clara.
- "suggestedDiversityTags": array de ["black","latino","asian","indigenous","arab","woman"]
  — SOLO si hay evidencia explícita en el texto. Si hay duda, omitir.
- Todos los campos son opcionales excepto "name" y "kind".
- "powers": array de poderes/habilidades, máximo 8, frases cortas.
- "deck": descripción de 1-2 oraciones, en español o inglés según el texto fuente.
`

export interface ExtractPromptInput {
  systemPrompt: string
  userContent:  string   // snapshot.textContent + meta serializado + hint si existe
  model:        string   // 'claude-haiku-4-5' por defecto
  maxTokens:    number   // 800
}
```

### 2.5 Resultado de cotejo contra catálogo

```typescript
export interface CatalogRow {
  _id:           string
  name:          string
  aliases:       string[]
  diversityTags: string[]
  cvId?:         number
  deck?:         string
  coverUrl?:     string
  storageId?:    string
  needsReview?:  boolean
  sources:       string[]
  roles?:        string[]
  [k: string]:   unknown
}

export type MatchMethod = 'cvId' | 'exact-name' | 'alias' | 'fuzzy' | 'none'

export interface CatalogMatch {
  kind:       PageKind
  method:     MatchMethod
  existing?:  CatalogRow
  candidates: CatalogRow[]   // para desambiguación humana en fuzzy
  confidence: number
}
```

### 2.6 Decisión de upsert

```typescript
export type UpsertAction =
  | 'create'      // no existe → insertar
  | 'complement'  // existe pero faltan campos → patch aditivo
  | 'update'      // existe y proponemos sobrescribir con mejor dato
  | 'skip'        // existe y está completo / sin mejora

export interface FieldChange {
  field:    string
  oldValue: unknown
  newValue: unknown
  reason:   'missing' | 'enrich' | 'override'
  source:   FieldProvenance
}

export interface UpsertDecision {
  action:    UpsertAction
  kind:      PageKind
  targetId?: string
  changes:   FieldChange[]
  imageUrl?: string
  /** Tags que el humano DEBE revisar antes de confirmar. */
  pendingDiversityTags: string[]
  summary:   string
}
```

### 2.7 Mensajería interna (background ↔ content ↔ popup)

```typescript
export type ExtensionMessage =
  | { type: 'SNAPSHOT_REQUEST';  tabId: number }
  | { type: 'SNAPSHOT_RESULT';   snapshot: PageSnapshot; detection: PageDetection }
  | { type: 'EXTRACT_REQUEST';   snapshot: PageSnapshot; hint?: ExtractedHint }
  | { type: 'EXTRACT_RESULT';    response: AIExtractResponse }
  | { type: 'FETCH_IMAGE_REQUEST'; url: string }
  | { type: 'FETCH_IMAGE_RESULT';  ok: boolean; dataUrl?: string; error?: string }
  | { type: 'ANALYZE_REQUEST';   data: Extracted }
  | { type: 'ANALYZE_RESULT';    match: CatalogMatch; decision: UpsertDecision }
  | { type: 'COMMIT_REQUEST';    decision: UpsertDecision; data: Extracted; imageDataUrl?: string }
  | { type: 'COMMIT_RESULT';     ok: boolean; targetId?: string; error?: string }
  | { type: 'AUTH_LOGIN';        email: string; password: string }
  | { type: 'AUTH_RESULT';       ok: boolean; error?: string }
  | { type: 'AUTH_STATUS' }
  | { type: 'AUTH_STATUS_RESULT'; loggedIn: boolean; email?: string }

export type MessageResponse<T = unknown> =
  | { ok: true;  value: T }
  | { ok: false; error: string }
```

### 2.8 Endpoints HTTP Actions

```typescript
export interface ConvexEndpoint { method: 'POST' | 'GET'; path: string }

export const ENDPOINTS = {
  login:           { method: 'POST', path: '/ext/v1/auth/login' },
  extract:         { method: 'POST', path: '/ext/v1/extract' },        // ← NUEVO (IA)
  searchCharacter: { method: 'POST', path: '/ext/v1/search/character' },
  searchCreator:   { method: 'POST', path: '/ext/v1/search/creator' },
  upsertCharacter: { method: 'POST', path: '/ext/v1/upsert/character' },
  upsertCreator:   { method: 'POST', path: '/ext/v1/upsert/creator' },
  uploadImage:     { method: 'POST', path: '/ext/v1/image/upload' },
  ingestUrl:       { method: 'POST', path: '/ext/v1/image/ingest-url' },
} as const satisfies Record<string, ConvexEndpoint>
```

---

## 3. Fases de desarrollo (cada una shippable)

### Fase 1 — Scaffold MV3 + popup + detección + snapshot **[EXT]**
**Entregable:** extensión instalable que abre popup, muestra el tipo de página detectado y el snapshot capturado.
- `manifest.json` MV3, permisos: `activeTab`, `storage`, `scripting`.
- Build con `esbuild` — 3 bundles: `background`, `content`, `popup`.
- Content script: `detectPage(): PageDetection` + `captureSnapshot(): PageSnapshot`.
- `PageSnapshot` incluye: title, URL, innerText[:8000], jsonLd[], meta{}, imageUrls[].
- Popup llama `SNAPSHOT_REQUEST` y muestra detection + preview del snapshot.
- **Done si:** instala en Chrome y Firefox; en cualquier URL muestra title+kind; typecheck verde.

### Fase 2 — Extractor IA universal + extractores per-site como hints **[CONVEX]+[EXT]**
**Entregable:** desde cualquier página, Claude extrae un `Extracted` correcto.

**[CONVEX]** `convex/actions/extractor.ts`:
- Recibe `AIExtractRequest` (snapshot + hint opcional).
- Construye prompt con `systemPrompt` (§2.4) + contenido de la página serializado.
- Llama `anthropic.messages.create({ model: 'claude-haiku-4-5', max_tokens: 800 })`.
- Parsea JSON de la respuesta → valida contra shape de `ExtractedCharacter | ExtractedCreator`.
- Devuelve `AIExtractResponse` con `extracted`, `confidence`, `tokensUsed`.
- Fallback si parse falla: intenta `jsonrepair` (ya en el proyecto) → si falla, `extracted: null`.

**[EXT]** Per-site extractors (opcionales, para sitios conocidos):
- `SiteExtractor` interface: `match(url): boolean; extract(doc, snapshot): ExtractedHint`.
- Sitios: `comicvine`, `marvel`, `dc`, `wikipedia`, `fandom`.
- Output: `ExtractedHint` (parcial) — cvId de URL, og:image, nombre de infobox. Se envía como `hint` al endpoint `/ext/v1/extract` para mejorar precisión sin reemplazar la IA.
- En sitios no reconocidos: hint vacío, IA trabaja solo con el snapshot.

**Done si:** en 10 URLs variadas (blogs, wikis, sitios en inglés y español) Claude devuelve `Extracted` correcto; `tokensUsed` < 500 por llamada en promedio; falsos positivos < 20%.

### Fase 3 — Integración Convex: auth + search + decide **[CONVEX]+[EXT]**
**Entregable:** login real + cotejo contra catálogo + `UpsertDecision` calculada.
- **[CONVEX]** `convex/httpExt.ts`: endpoints de §5 (login, search, upsert) con JWT auth.
- **[CONVEX]** `registerExtRoutes(http)` en `convex/http.ts`.
- **[EXT]** `apiClient.ts`: `fetch` con `Authorization: Bearer`, auto-refresh si 401.
- **[EXT]** `pipeline.ts`: `analyze(extracted) → { match, decision }` — llama search, corre `decide()`.
- **[EXT]** `decide.ts`: `decide(extracted, match): UpsertDecision` — lógica create/complement/update/skip + `FieldChange[]` diff.
- **Done si:** login funciona; search devuelve match por cvId y por nombre; decision calculada; sin commit aún.

### Fase 4 — Imagen: download + upload a Convex Storage **[CONVEX]+[EXT]**
**Entregable:** imagen de la página termina en `_storage` y se referencia en la fila del catálogo.
- **[EXT]** `image.ts` en content script: `fetchImageAsDataUrl(url)` en contexto de página (evita CORS).
- **[CONVEX]** `/ext/v1/image/upload`: recibe binario, `ctx.storage.store(blob)`, devuelve `storageId`.
- **[CONVEX]** `/ext/v1/image/ingest-url`: server-side fetch → store (fallback CORS).
- **[EXT]** Los endpoints upsert reciben `storageId` ya generado (no el binario).
- Validaciones: max 5 MB, solo MIME `image/*`.
- **Done si:** confirmar en popup sube imagen y la fila del catálogo tiene `storageId`; fallback ingest-url funciona en al menos un caso CORS.

### Fase 5 — UX del popup: diff + tags + confirmar **[EXT]**
**Entregable:** flujo humano completo: extraer → revisar → tags → confirmar.
- Estados del popup: `idle → detecting → extracting (spinner) → reviewing → committing → done / error`.
- Panel de **diff** mostrando `FieldChange[]` (old → new + badge de provenance, badge `ai` para campos de IA).
- **Panel de `diversityTags`**: chips de los `suggestedDiversityTags` de la IA + toggle manual. Requiere confirmación explícita (nunca autoguardado silencioso).
- Selector de `roles` (para creadores).
- Desambiguación de `candidates` si fuzzy (lista de alternativas con botón "Este es").
- Botón **Confirmar** habilitado solo si el humano revisó los tags → `COMMIT_REQUEST`.
- **Done si:** flujo completo en 3 URLs reales de sitios distintos (incluyendo 1 blog genérico); `needsReview` = true cuando los tags quedan vacíos; errores se muestran con mensaje claro.

---

## 4. Decisiones técnicas justificadas

### 4.1 Manifest V3 → obligatorio
Chrome deprecó MV2. Firefox soporta MV3. No hay opción real para un proyecto nuevo.

### 4.2 IA como extractor primario (no per-site)
- **Por qué**: per-site extractors se rompen con cada rediseño del DOM; hay miles de sitios de cómics posibles (blogs, wikis, etc.). La IA es más resiliente y funciona en cualquier URL.
- **Por qué no solo IA**: costo de tokens + latencia. Per-site extractors (comicvine, marvel, etc.) son rápidos, gratuitos y muy precisos para esos dominios. Se usan como `hint` para que la IA sea más precisa.
- **Modelo**: `claude-haiku-4-5` — más barato y rápido para extracción estructurada. Configurable via variable de entorno `EXT_CLAUDE_MODEL`.
- **Límite de tokens**: `max_tokens: 800` en output + `~1500` en input = ~$0.0005/extracción a precios de Haiku.

### 4.3 Auth JWT via HTTP Action
- Login email+password → mismo `@convex-dev/auth` Password provider del CMS.
- JWT corta vida (1h) + refresh token. Guardado en `chrome.storage.local` (no `sync` — no propagar secretos entre dispositivos).
- HTTP Actions verifican JWT, resuelven `userId`. Rate-limit por userId.
- Cero API keys en el bundle de la extensión.

### 4.4 `diversityTags` — confirmación humana obligatoria
- La IA puede *sugerir* tags (`suggestedDiversityTags`) basándose en el texto.
- El popup muestra los chips como "sugeridos" (distintos visualmente).
- El usuario debe hacer clic en cada tag sugerido para confirmar o descartar.
- Si no se confirma ningún tag: `needsReview: true` al guardar.
- Razón: riesgo de bias o error de la IA en una clasificación sensible.

### 4.5 Service Worker vs Web Worker
MV3 background = SW. Sin elección. El SW es stateless y se duerme. Mitigaciones:
- Todo el estado en `chrome.storage.local`.
- Pasos del pipeline son idempotentes y reiniciables desde el popup.
- El SW no hace nada costoso al despertar; solo despacha mensajes a los HTTP Actions.

### 4.6 CORS de imágenes — dos niveles
1. **Content script** (contexto de página): `fetch(imageUrl)` — evita CORS si la imagen es del mismo origen o CDN permisiva. Devuelve `dataUrl` al SW.
2. **Server-side** (`/ext/v1/image/ingest-url`): si falla, Convex descarga la imagen (sin CORS). Más lento pero universal.

### 4.7 Popup vanilla TS (no React)
~5 vistas, máquina de estados simple. React añade ~130KB min+gz al bundle por cero valor real aquí. Criterio de escalado a Preact (3KB): más de 6 vistas o formularios con validación reactiva compleja.

---

## 5. HTTP Actions a crear en Convex **[CONVEX]**

> Nuevo archivo `convex/httpExt.ts`. Exporta `registerExtRoutes(http: HttpRouter): void`.
> Se llama en `convex/http.ts` tras `auth.addHttpRoutes(http)`.
> Todas (excepto login) requieren `Authorization: Bearer <token>`.
> Responden `Access-Control-Allow-Origin: *` + manejan `OPTIONS` preflight (origin `chrome-extension://...`).

### 5.1 `POST /ext/v1/auth/login`
```
Body     : { "email": string, "password": string }
200      : { "token": string, "expiresAt": number, "email": string }
401      : { "error": "invalid_credentials" }
```

### 5.2 `POST /ext/v1/extract`  ← **NUEVO (IA)**
```
Body     : AIExtractRequest
             { snapshot: PageSnapshot, hint?: ExtractedHint, forceKind?: PageKind }
200      : AIExtractResponse
             { extracted: Extracted|null, kind: PageKind, confidence: number, tokensUsed: number }
422      : { "error": "parse_failed", "raw": string }
429      : { "error": "rate_limited" }
```
Impl: llama `ctx.runAction(internal.extractor.extractFromPage, { snapshot, hint, forceKind })` que hace la llamada a Anthropic. El resultado se loguea con `userId` + `tokensUsed` para monitoring de costos.

### 5.3 `POST /ext/v1/search/character`
```
Body     : { "q": string, "cvId"?: number }
200      : { "rows": CatalogRow[] }
```

### 5.4 `POST /ext/v1/search/creator`
```
Body     : { "q": string, "cvId"?: number }
200      : { "rows": CatalogRow[] }
```

### 5.5 `POST /ext/v1/upsert/character`
```
Body     : ExtractedCharacter + { "storageId"?: string, "diversityTags": string[] }
             (diversityTags = los confirmados por el humano, no los suggestedDiversityTags)
200      : { "id": string, "action": UpsertAction }
```
Impl: `ctx.runMutation(internal.catalog.upsertCharacter, { ...body, sources: ['extension'], needsReview: body.diversityTags.length === 0 })`.

### 5.6 `POST /ext/v1/upsert/creator`
```
Body     : ExtractedCreator + { "storageId"?: string, "diversityTags": string[] }
200      : { "id": string, "action": UpsertAction }
```

### 5.7 `POST /ext/v1/image/upload`
```
Body     : binary (Content-Type: image/*) + ?ext=png|jpg
200      : { "storageId": string }
413      : { "error": "too_large" }    // > 5 MB
```

### 5.8 `POST /ext/v1/image/ingest-url`  (fallback CORS)
```
Body     : { "url": string }
200      : { "storageId": string }
502      : { "error": "fetch_failed" }
```

---

## 6. Estructura de archivos

```
extension/
├─ manifest.json
├─ package.json
├─ tsconfig.json
├─ build.mjs                          # esbuild: 3 entrypoints → dist/
├─ dist/                              # output (gitignored)
└─ src/
   ├─ shared/
   │  ├─ contracts.ts                 # §2 — todos los tipos/interfaces
   │  ├─ endpoints.ts                 # ENDPOINTS + base URL Convex
   │  └─ messaging.ts                 # sendMessage<T> tipado, helpers
   ├─ background/
   │  ├─ index.ts                     # SW: router de ExtensionMessage
   │  ├─ apiClient.ts                 # fetch + JWT auth + auto-refresh
   │  ├─ pipeline.ts                  # analyze(): extract → search → decide
   │  └─ decide.ts                    # decide(extracted, match): UpsertDecision
   ├─ content/
   │  ├─ index.ts                     # entry: detectPage + captureSnapshot + dispatch
   │  ├─ detect.ts                    # detectPage(): PageDetection
   │  ├─ snapshot.ts                  # captureSnapshot(): PageSnapshot
   │  ├─ image.ts                     # fetchImageAsDataUrl() en contexto de página
   │  └─ extractors/                  # per-site hints (opcionales)
   │     ├─ types.ts                  # SiteExtractor interface
   │     ├─ jsonld.ts                 # helpers JSON-LD / OG / meta
   │     ├─ comicvine.ts              # cvId de URL, og:image
   │     ├─ marvel.ts                 # __NEXT_DATA__ + og
   │     ├─ dc.ts                     # og + DOM infobox
   │     ├─ wikipedia.ts              # .infobox + JSON-LD
   │     └─ fandom.ts                 # .portable-infobox + JSON-LD
   └─ popup/
      ├─ index.html
      ├─ index.ts                     # máquina de estados: idle→detecting→extracting→reviewing→done
      ├─ views/
      │  ├─ login.ts
      │  ├─ detecting.ts
      │  ├─ review.ts                 # diff de FieldChange[] + panel de tags
      │  ├─ tagsPanel.ts              # chips sugeridos + confirmación humana
      │  └─ done.ts
      └─ styles.css

convex/
├─ httpExt.ts                         # [NUEVO] registerExtRoutes — HTTP Actions §5
├─ http.ts                            # [EDIT] añadir registerExtRoutes(http)
├─ catalog.ts                         # [reuse] upsertCharacter/upsertCreator/search
└─ actions/
   └─ extractor.ts                    # [NUEVO] extractFromPage — llama Claude, parsea JSON

test/
└─ extension/
   ├─ extractors/                     # tests unitarios de per-site extractors
   │  └─ fixtures/                    # HTML estático descargado de cada sitio
   └─ decide.test.ts                  # tests de lógica create/complement/update/skip
```

---

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| IA alucina datos (nombre, powers) | Datos incorrectos en catálogo | Popup muestra provenance `ai` en badge; revisión humana antes de confirmar; `needsReview: true` para entradas de la extensión |
| IA clasifica mal (character vs creator) | Entrada en tabla equivocada | Popup permite al usuario cambiar el `kind` antes de confirmar; botón "Es personaje / Es creador" |
| `diversityTags` mal sugeridos | Sesgo o error sensible | NUNCA autoguardado; siempre confirmación explícita por chip; guardar vacío con `needsReview: true` |
| Costo de tokens excesivo | Costo Anthropic | Haiku = ~$0.0005/extracción; per-site hint reduce prompt; rate-limit por userId; logging de tokensUsed |
| SW MV3 se duerme a mitad | Pierde estado | SW stateless; estado en `chrome.storage.local`; pasos idempotentes |
| CORS bloquea imágenes | No sube imagen | Fallback server-side `ingest-url` (§5.8) |
| Claude no devuelve JSON válido | Parse falla | `jsonrepair` como primer fallback; si falla → `extracted: null` + mensaje al usuario |
| Sitios con anti-scraping (Cloudflare) | `textContent` bloqueado | El content script corre en contexto de página (no fetch externo) → no aplica el bloqueo |
| DOM pesado, innerText > 8000 chars | Tokens excesivos | Truncar a 8000 chars en `captureSnapshot`; priorizar primer 30% del documento donde está la info principal |
| Token JWT robado de `storage.local` | Acceso no autorizado | Vida corta (1h) + refresh; scope mínimo (solo catálogo); revocar via tabla `extTokens` |
| Dedup incorrecto (mismo nombre, distinto universo) | Merge erróneo | Priorizar `cvId`; en fuzzy mostrar `candidates` y exigir desambiguación; mostrar `universe` en la lista de candidatos |
| Rate-limit de Convex HTTP Actions | Fallo silencioso | `429` explícito; exponential backoff en `apiClient.ts`; rate-limit por userId server-side |
| Imágenes enormes a Storage | Costo/latencia | Validar `Content-Length` + `size` del blob en `/image/upload`; rechazar > 5 MB |
| Firefox vs Chrome API diffs | Builds distintos | `webextension-polyfill` (`browser.*`); un solo manifest MV3 compatible |

---

## 8. Orden de implementación recomendado para Sonnet

```
Paso 1  extension/ scaffold: manifest.json, build.mjs (esbuild), tsconfig.json
        contracts.ts (§2 literal), endpoints.ts
        → typecheck verde, extensión instalable vacía

Paso 2  content/detect.ts + content/snapshot.ts
        popup/index básico: muestra PageDetection en pantalla
        → Done: en cualquier URL muestra title + kind

Paso 3  convex/actions/extractor.ts: extractFromPage() con Claude
        convex/httpExt.ts: POST /ext/v1/extract (sin auth aún)
        → Done: llamar al endpoint con un snapshot real devuelve Extracted

Paso 4  convex/httpExt.ts: auth login + todos los endpoints §5
        convex/http.ts: registerExtRoutes
        background/apiClient.ts + pipeline.ts + decide.ts
        → Done: login real, search, decision calculada

Paso 5  Per-site extractors (hints, opcional) — comicvine primero
        Tests con fixtures HTML

Paso 6  Imagen upload + ingest-url (Fase 4)

Paso 7  Popup UX completa: diff + tagsPanel + confirmar (Fase 5)
```

Cada paso compila, pasa typecheck y tiene criterio de "Done" explícito antes de avanzar al siguiente.
