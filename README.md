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

### Investigación y asistencia IA
- **Investigación de cómics diversidad** — dos modos complementarios:
  - *AI search*: GPT-4o-search encuentra cómics reales por rango de fechas y tags de diversidad (`black`, `latino`, `asian`, `indigenous`, `arab`); reparación automática de JSON malformado vía `jsonrepair`
  - *Character search*: consolida 1500+ personajes de Wikipedia + worldofblackheroes.com, prioriza 60+ personajes prominentes, busca en Comic Vine sus series y enriquece con poderes / primera aparición / portadas
- **Extracción automática** de metadatos (título, tipo, personajes, creadores, tags) desde el texto del post original
- **Sugerencia de etiquetas** de representación y temáticas
- **Generación de variantes** de publicación por canal (Claude)

### Media assets
- Subida de imágenes a Convex Storage con extracción de dimensiones en cliente (`window.Image`)
- Gestión de imagen principal, alt text editable inline, previsualización con dimensiones
- Límite de 500 KB por imagen

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
| Testing | Vitest |

---

## Arquitectura

```
app/
  (dashboard)/
    page.tsx              ← Dashboard con sparklines y acceso rápido
    catalog/              ← Listado, filtros, creación y edición de ítems
    planner/              ← Calendario de publicaciones
    analytics/            ← Métricas y rendimiento
    special-dates/        ← Fechas especiales y aniversarios

components/
  editor/
    ContentEditor.tsx     ← Editor principal de ítems con secciones colapsables
    VariantPanel.tsx      ← Panel de variantes por canal con preview y lint
    AuditTimeline.tsx     ← Timeline de auditoría lazy
  catalog/                ← Tabla, filtros y badges del catálogo

convex/
  schema.ts               ← Definición completa del esquema de base de datos
  contentItems.ts         ← CRUD de ítems, búsqueda, bulk ops, sparklines
  contentVariants.ts      ← Variantes por canal
  mediaAssets.ts          ← Gestión de assets con Convex Storage
  scheduleSlots.ts        ← Slots del planner
  auditEvents.ts          ← Registro de auditoría
  actions/
    publisher.ts          ← Publicación a Tumblr y X, retry de slots fallidos
    ai.ts                 ← Generación y extracción con IA
    importer.ts           ← Importación desde Tumblr
    comicvine.ts          ← Acciones públicas que exponen el cliente Comic Vine al frontend
    comicsResearch.ts     ← Búsqueda de cómics: AI search (GPT-4o-search) + character-first (Wikipedia+CV)

lib/
  integrations/
    comicvine.ts          ← Cliente Comic Vine API (search, character, volume, person, issue)
  comicsResearch.ts       ← Parser de respuestas AI con jsonrepair + estrategias de fallback
  comicsResearch.types.ts ← Tipos SearchParams / ComicsResearchResponse
  preview/
    payloads.ts           ← Funciones puras: assembleXTweet, buildFullTumblrCaption, buildTumblrPayload, buildXPayload
    payloads.test.ts      ← 29 tests
  quality/
    variantLint.ts        ← Linter de variantes (frases prohibidas, promos, autorreferencias)
    variantLint.test.ts   ← 15 tests
    similarity.ts         ← Similitud Jaccard para detección de duplicados
    similarity.test.ts    ← 17 tests
  contentFilters.ts       ← VALID_TRANSITIONS y applySecondary (puras, extraídas de Convex para testing)
  contentFilters.test.ts  ← 24 tests
  specialDates.ts         ← Búsqueda de fechas especiales vía Perplexity
  specialDates.test.ts    ← 23 tests
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

---

## Licencia

Proyecto privado — todos los derechos reservados.
