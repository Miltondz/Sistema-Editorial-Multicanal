# Sistema Editorial Multicanal — SuperheroesInColor CMS

CMS editorial construido para gestionar y publicar contenido sobre superhéroes de color en múltiples plataformas sociales. Diseñado para un flujo de trabajo completo: desde la importación y curaduría hasta la publicación automatizada en Tumblr y X (Twitter).

---

## Características principales

### Gestión de contenido
- **Catálogo unificado** con búsqueda full-text, filtros combinados (tipo, estado, origen, plataforma) y paginación reactiva
- **9 tipos de contenido**: cómic, libro, autor, cosplay, artículo, poster, película, personaje, colección
- **Flujo editorial estructurado**: `borrador → investigando → en revisión → aprobado → publicado`
- **Acciones en bulk**: aprobar, cambiar clase evergreen, marcar prioridad, eliminar
- **Detección de duplicados** en tiempo real usando similitud Jaccard sobre tokens del título
- **Metadatos editoriales**: prioridad, clase evergreen, grupo de fatiga temática, etiquetas de representación y temáticas, creadores con rol

### Variantes de publicación por canal
- Variantes independientes para **Tumblr** (HTML con caption y footer de marca) y **X** (tweet ensamblado automáticamente con límite de 280 caracteres)
- Vista previa en tiempo real del texto final antes de publicar
- **Linter de calidad** que detecta frases prohibidas, promos futuras y lenguaje autorreferencial en el texto de cada variante
- Contador de caracteres exacto para X con indicador de truncado

### Planner y calendario
- Calendario de slots por fecha, canal y franja horaria (mañana / tarde / noche)
- Generación automática del calendario basada en scores de cada ítem
- **Reintentar publicaciones fallidas** directamente desde la UI del planner
- Creación de slots a partir de fechas especiales

### Publicación automatizada
- Publicación directa a **Tumblr** vía API (fotos + caption HTML)
- Publicación a **X** vía Twitter API v2 (tweet de texto + imagen adjunta)
- Reintentos automáticos con scheduler de Convex (`ctx.scheduler.runAfter`)
- Log completo de cada publicación: payload enviado, respuesta, URL externa, conteo de reintentos

### Importación
- Import de posts históricos desde **Tumblr** con descarga de imágenes a Convex Storage
- Deduplicación por hash canónico del post original
- Todos los ítems importados entran en estado `in_review` con `needsReview=true` — sin excepciones

### Catálogo de diversidad

Base de datos curada de personajes y creadores diversos del mundo de los cómics.

#### Personajes (`catalogCharacters`)
- **+1,300 personajes** clasificados por tags de diversidad: `black`, `latino`, `asian`, `indigenous`, `arab`
- **Fuentes de ingesta**: worldofblackheroes.com, Wikipedia (listas de superhéroes indigenas, musulmanes, etc.), Comic Vine API, listas curadas manuales (DC Blog, CBR, Image Comics)
- **Ingestas específicas por comunidad**:
  - Héroes Native American (DC Blog + lista CV ryonslaught #13232)
  - Héroes musulmanes (Marvel Fandom, Sideshow, Geekscovery + lista curada)
  - Versiones diversas de personajes icónicos (Batman Jace Fox, Jo Mullein GL, etc.)
- **Enriquecimiento Comic Vine**: deck, nombre real, primera aparición, editorial, portada, cvUrl
- **Tracking de mantles / versiones**: `mantleId`, `versionType` (original/legacy/alternate_universe/future/what_if), `universe`, `legacyIndex` para múltiples versiones del mismo personaje
- **Auditoría de calidad de datos**: corrección de tags incorrectos (Batman original ≠ black, etc.)

#### Creadores (`catalogCreators`)
- **84+ creadores negros** del mundo de los cómics con enriquecimiento de Wikipedia
- **Fuentes**: Wikipedia Category:African-American_comics_writers (API paginada), Image Comics blog, CBR
- Datos por creador: deck (extracto Wikipedia), foto (thumbnail Wikipedia), wikiUrl, roles auto-detectados (writer/artist/colorist/editor/letterer), nacionalidad, año de nacimiento, obras notables

#### Sistema de revisión (`needsReview`)
- Flag `needsReview: true` automático para entradas con tags pero sin contexto (deck/realName/universe)
- **1,157 entradas** marcadas en batch inicial para revisión humana
- Badge ámbar `! revisar` en cards de personajes y creadores
- Botón ✓ en hover para marcar como revisado
- Filtro `! Revisar (N)` en la UI de ambas páginas

#### Página de detalle de creadores (`/creators/[id]`)
- Foto, tags, roles, nacionalidad, año de nacimiento
- Descripción (deck), alias, obras notables (CV IDs)
- Alerta de revisión + botón "Marcar revisado"
- Edición inline con ImageUpload

### Investigación y asistencia IA
- **Investigación de cómics diversidad** — dos modos complementarios:
  - *AI search*: GPT-4o-search encuentra cómics reales por rango de fechas y tags de diversidad; reparación automática de JSON malformado vía `jsonrepair`
  - *Character search*: consolida 1,300+ personajes del catálogo, prioriza 60+ personajes prominentes, busca en Comic Vine sus series y enriquece con poderes / primera aparición / portadas
- **Extracción automática** de metadatos (título, tipo, personajes, creadores, tags) desde el texto del post original
- **Sugerencia de etiquetas** de representación y temáticas
- **Generación de variantes** de publicación por canal (Claude)

### Media assets
- Subida de imágenes a Convex Storage con extracción de dimensiones en cliente (`window.Image`)
- Gestión de imagen principal, alt text editable inline, previsualización con dimensiones
- Límite de 500 KB por imagen
- Imágenes propias en catálogo de personajes y creadores (toman prioridad sobre coverUrl de CV)

### Scoring y analytics
- **Scores por canal** (click, engagement, reblog, evergreen) + `reuseScore` compuesto
- Reglas de scoring configurables por canal en base de datos
- Dashboard con sparklines de publicaciones / aprobaciones / creaciones por día
- Métricas de performance: impresiones, engagements, likes, reposts, tasa de engagement

### Fechas especiales
- Calendario de aniversarios y eventos únicos con relevanceScore
- Enriquecimiento automático con datos históricos vía Perplexity Search
- Ideas de contenido generadas con IA para cada fecha

### Auditoría
- Registro inmutable de todos los eventos de negocio: creación, actualización, aprobación, publicación, eliminación, etc.
- Timeline de auditoría colapsable por ítem en la vista de edición
- Carga lazy del historial (no carga hasta que el usuario lo abre)

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Estilos | Tailwind CSS |
| Backend / DB | [Convex](https://convex.dev) (queries, mutations, actions, storage, scheduler) |
| Autenticación | `@convex-dev/auth` |
| Rich text | Tiptap |
| IA | Anthropic Claude (`@anthropic-ai/sdk`), OpenAI (`openai`), OpenRouter |
| Publicación | `tumblr.js` (Tumblr API), `twitter-api-v2` (X API v2) |
| Enriquecimiento | Comic Vine API, Wikipedia REST API + Category API |
| Testing | Vitest |

---

## Arquitectura

```
app/
  (dashboard)/
    page.tsx                ← Dashboard con sparklines y acceso rápido
    catalog/                ← Listado, filtros, creación y edición de ítems
    planner/                ← Calendario de publicaciones
    analytics/              ← Métricas y rendimiento
    special-dates/          ← Fechas especiales y aniversarios
    characters/
      page.tsx              ← Catálogo de personajes diversos (filtros, needsReview, imágenes)
    creators/
      page.tsx              ← Catálogo de creadores (filtros, needsReview, link a detalle)
      [id]/
        page.tsx            ← Detalle de creador: foto, deck, roles, edición inline

components/
  editor/
    ContentEditor.tsx       ← Editor principal de ítems con secciones colapsables
    VariantPanel.tsx        ← Panel de variantes por canal con preview y lint
    AuditTimeline.tsx       ← Timeline de auditoría lazy
  dashboard/
    ImageUpload.tsx         ← Subida de imágenes a Convex Storage
  catalog/                  ← Tabla, filtros y badges del catálogo

convex/
  schema.ts                 ← Definición completa del esquema de base de datos
  catalog.ts                ← Queries/mutations del catálogo: upsert, search, needsReview, stats
  contentItems.ts           ← CRUD de ítems, búsqueda, bulk ops, sparklines
  contentVariants.ts        ← Variantes por canal
  mediaAssets.ts            ← Gestión de assets con Convex Storage
  scheduleSlots.ts          ← Slots del planner
  auditEvents.ts            ← Registro de auditoría
  actions/
    publisher.ts            ← Publicación a Tumblr y X, retry de slots fallidos
    ai.ts                   ← Generación y extracción con IA
    importer.ts             ← Importación desde Tumblr
    comicvine.ts            ← Acciones públicas que exponen el cliente Comic Vine al frontend
    comicsResearch.ts       ← Búsqueda de cómics: AI search + character-first (Wikipedia+CV)
    catalogIngestion.ts     ← Pipeline de ingesta: scrape fuentes → upsert → enriquecimiento
                              Ingestas disponibles:
                                ingestFromWorldOfBlackHeroes
                                ingestFromWikipedia
                                enrichUnenrichedCharacters (CV batch)
                                enrichUnenrichedCreators (CV batch)
                                fixDiverseBatmanData / fixResearchedSuspiciousTags
                                addJoMulleinGreenLanterns / addRowanKent
                                addBlindspotAndFixFlashback
                                ingestNativeAmericanHeroes
                                ingestMuslimHeroes
                                ingestBlackCreators
                                markAllNeedsReview

lib/
  integrations/
    comicvine.ts            ← Cliente Comic Vine API (search, character, volume, person, issue)
  comicsResearch.ts         ← Parser de respuestas AI con jsonrepair + estrategias de fallback
  comicsResearch.types.ts   ← Tipos SearchParams / ComicsResearchResponse
  preview/
    payloads.ts             ← Funciones puras: assembleXTweet, buildFullTumblrCaption, etc.
    payloads.test.ts        ← 29 tests
  quality/
    variantLint.ts          ← Linter de variantes (frases prohibidas, promos, autorreferencias)
    variantLint.test.ts     ← 15 tests
    similarity.ts           ← Similitud Jaccard para detección de duplicados
    similarity.test.ts      ← 17 tests
  contentFilters.ts         ← VALID_TRANSITIONS y applySecondary
  contentFilters.test.ts    ← 24 tests
  specialDates.ts           ← Búsqueda de fechas especiales vía Perplexity
  specialDates.test.ts      ← 23 tests
```

---

## Modelos de datos

| Tabla | Descripción |
|-------|-------------|
| `contentItems` | Ítem editorial central con metadatos, origen, estado y tags |
| `contentVariants` | Variante de publicación por canal, versionada con estado propio |
| `mediaAssets` | Imágenes vinculadas a ítems, almacenadas en Convex Storage |
| `scheduleSlots` | Slots del calendario con estado de publicación |
| `channelScores` | Scores de reutilización por canal para cada ítem |
| `publicationLog` | Log inmutable de cada intento de publicación |
| `performanceMetrics` | Métricas de engagement sincronizadas post-publicación |
| `auditEvents` | Eventos de auditoría de todos los cambios de negocio |
| `specialDates` | Fechas editoriales especiales con enriquecimiento IA |
| `importJobs` | Trabajos de importación con progreso y estado |
| `scoringRules` | Reglas de scoring configurables por canal |
| `comicsResearch` | Sesiones de búsqueda de cómics con resultados y estado |
| `comicsResearchItems` | Resultados individuales por sesión con metadatos y JSON original |
| `catalogCharacters` | 1,300+ personajes diversos: tags, CV id, mantle/universe, needsReview, poderes, portada |
| `catalogCreators` | 84+ creadores: roles, tags, Wikipedia deck/foto, CV data, needsReview |

### Campos clave de `catalogCharacters`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `diversityTags` | `string[]` | `['black','latino','asian','indigenous','arab']` |
| `mantleId` | `string?` | Identidad canónica: `"Batman"`, `"Robin"`, `"Green Lantern"` |
| `versionType` | `string?` | `original` / `legacy` / `alternate_universe` / `future` / `what_if` |
| `universe` | `string?` | `Earth-616`, `Prime Earth`, `Earth-2`, `Far Sector`, etc. |
| `legacyIndex` | `number?` | Orden de sucesión (1 = primer portador) |
| `needsReview` | `boolean?` | Requiere verificación humana de tags/contexto |
| `sources` | `string[]` | `worldofblackheroes` / `wikipedia` / `comicvine` / `manual` |
| `cvEnrichedAt` | `number?` | Unix ms — null = no enriquecido aún |

---

## Desarrollo local

### Requisitos

- Node.js 18+
- Cuenta en [Convex](https://convex.dev) (gratuita para desarrollo)
- API keys de Tumblr, X, Anthropic (opcionales según features a usar)

### Instalación

```bash
npm install
```

### Variables de entorno

Las API keys se configuran **únicamente** en el Dashboard de Convex como environment variables del deployment. Nunca se guardan en archivos del repositorio.

Variables necesarias en el Dashboard de Convex:

```
TUMBLR_CONSUMER_KEY
TUMBLR_CONSUMER_SECRET
TUMBLR_OAUTH_TOKEN
TUMBLR_OAUTH_TOKEN_SECRET
TUMBLR_BLOG_NAME
X_API_KEY
X_API_SECRET
X_ACCESS_TOKEN
X_ACCESS_TOKEN_SECRET
ANTHROPIC_API_KEY
OPENAI_API_KEY
PERPLEXITY_API_KEY
COMICVINE_API_KEY
OPENROUTER_API_KEY
```

### Iniciar en desarrollo

```bash
npm run dev
```

Arranca en paralelo el servidor de Next.js y el watcher de Convex (`npx convex dev`).

### Tests

```bash
npm test
```

**108 tests, 5 archivos** — cobertura de las rutas de mayor riesgo:

| Archivo | Tests | Qué cubre |
|---------|-------|-----------|
| `lib/preview/payloads.test.ts` | 29 | Payload builders Tumblr/X: routing foto/link/texto, fallback `coverImageUrl`, dedup de tags, cap 30, tweet 280 chars |
| `lib/quality/variantLint.test.ts` | 15 | Linter: frases prohibidas, promos futuras, autorreferencias, stripping HTML |
| `lib/quality/similarity.test.ts` | 17 | Jaccard: casos vacíos, mayúsculas, puntuación, tokens cortos; `findDuplicateCandidates` threshold/orden/cap |
| `lib/contentFilters.test.ts` | 24 | `VALID_TRANSITIONS` (máquina de estados editorial) + `applySecondary` (stacking de filtros Convex) |
| `lib/specialDates.test.ts` | 23 | `searchSpecialDates`, `parseResults`, validación y limpieza de resultados IA |

---

## Invariantes de negocio

- `contentOrigin` es inmutable una vez establecido en la creación
- `sourcePlatform` es inmutable
- `enrichedManually` solo puede pasar de `false` a `true`, nunca al revés
- Todo ítem importado entra con `needsReview=true` y `status='in_review'`
- Ninguna variante se publica sin aprobación humana explícita
- Todos los eventos de negocio se registran en `auditEvents`
- Los slots con `locked=true` no son modificados por la regeneración automática del calendario
- Las API keys solo viven en el Dashboard de Convex, nunca en archivos del repositorio
- `COMICVINE_API_KEY` solo en Convex Dashboard — nunca en archivos del repositorio

---

## Licencia

Proyecto privado — todos los derechos reservados.
