/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, randomBytes } from 'crypto'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tumblrLib: any = require('tumblr.js')

function createTumblrClient() {
  return tumblrLib.createClient({
    consumer_key:    process.env.TUMBLR_CONSUMER_KEY!,
    consumer_secret: process.env.TUMBLR_CONSUMER_SECRET!,
    token:           process.env.TUMBLR_OAUTH_TOKEN!,
    token_secret:    process.env.TUMBLR_OAUTH_TOKEN_SECRET!,
  })
}

// ── Raw OAuth 1.0a POST (bypasses tumblr.js so we see real error bodies) ────

// RFC 5849: encode everything except ALPHA / DIGIT / "-" / "." / "_" / "~"
// encodeURIComponent misses: ! * ' ( )
function oauthEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/\*/g, '%2A')
    .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

function oauthSign(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string,
): string {
  const enc = oauthEncode
  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        String(Math.floor(Date.now() / 1000)),
    oauth_token:            token,
    oauth_version:          '1.0',
  }
  // Include body params in signature only for form-encoded content
  const allParams = { ...oauthParams, ...bodyParams }
  const sortedStr = Object.entries(allParams)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join('&')
  const baseStr = `${method}&${enc(url)}&${enc(sortedStr)}`
  const signingKey = `${enc(consumerSecret)}&${enc(tokenSecret)}`
  const sig = createHmac('sha1', signingKey).update(baseStr).digest('base64')
  const headerParams = { ...oauthParams, oauth_signature: sig }
  return 'OAuth ' + Object.entries(headerParams)
    .map(([k, v]) => `${k}="${enc(v)}"`)
    .join(', ')
}

function tumblrCredentials() {
  return {
    consumerKey:    process.env.TUMBLR_CONSUMER_KEY!,
    consumerSecret: process.env.TUMBLR_CONSUMER_SECRET!,
    token:          process.env.TUMBLR_OAUTH_TOKEN!,
    tokenSecret:    process.env.TUMBLR_OAUTH_TOKEN_SECRET!,
  }
}

async function tumblrRequest(blogName: string, body: string | FormData, sigFields: Record<string, string>): Promise<any> {
  const { consumerKey, consumerSecret, token, tokenSecret } = tumblrCredentials()
  const url = `https://api.tumblr.com/v2/blog/${blogName}/post`
  const isFormEncoded = typeof body === 'string'
  // Form-encoded: ALL body params in sig. Multipart: NO body in sig (RFC 5849 §3.4.1.3).
  const authHeader = oauthSign('POST', url, isFormEncoded ? sigFields : {}, consumerKey, consumerSecret, token, tokenSecret)
  const headers: Record<string, string> = { Authorization: authHeader }
  if (isFormEncoded) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  const res = await fetch(url, { method: 'POST', headers, body })
  const json = await res.json() as any
  if (!res.ok) throw new Error(`Tumblr ${res.status}: ${JSON.stringify(json).slice(0, 800)}`)
  return json
}

// Form-encoded POST (text / link posts)
async function tumblrLegacyPost(blogName: string, fields: Record<string, string>): Promise<any> {
  const body = Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return tumblrRequest(blogName, body, fields)
}

// Multipart POST (photo posts with binary image data)
async function tumblrLegacyPostPhoto(
  blogName: string,
  textFields: Record<string, string>,
  imageBuffers: Array<{ data: ArrayBuffer; mimeType: string }>,
): Promise<any> {
  const form = new FormData()
  for (const [k, v] of Object.entries(textFields)) form.append(k, v)
  for (let i = 0; i < imageBuffers.length; i++) {
    const { data, mimeType } = imageBuffers[i]
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg'
    form.append(`data[${i}]`, new Blob([data], { type: mimeType }), `image${i}.${ext}`)
  }
  return tumblrRequest(blogName, form, {})
}

// ── Import types ────────────────────────────────────────────────────────────

export interface TumblrPost {
  id: string
  type: 'text' | 'photo' | 'link' | 'quote' | 'video' | 'audio' | 'chat'
  timestamp: number     // Unix seconds
  slug: string
  tags: string[]
  post_url: string
  photos?: Array<{ original_size: { url: string; width: number; height: number } }>
  body?: string         // text posts
  caption?: string      // photo / video posts
  url?: string          // link posts
  title?: string        // link / text posts
  description?: string  // link posts
  // Present on reblogs — undefined/null on original posts
  reblogged_from_id?:   string | null
  reblogged_root_id?:   string | null
  reblogged_from_name?: string | null
}

const TUMBLR_PAGE_SIZE = 20

/** Single-page fetch using `before` timestamp cursor (ms epoch).
 *  Tumblr API accepts `before` in Unix seconds; we convert internally.
 *  Returns posts (newest-first within page) and the blog total post count. */
export async function fetchOnePage(
  blogName: string,
  { beforeMs, limit = TUMBLR_PAGE_SIZE }: { beforeMs?: number; limit?: number }
): Promise<{ posts: TumblrPost[]; totalPosts: number }> {
  const client = createTumblrClient()
  const params: Record<string, unknown> = { limit, reblog_info: true, notes_info: false }
  if (beforeMs !== undefined) params.before = Math.floor(beforeMs / 1000) // API expects Unix seconds
  const response = await client.blogPosts(blogName, params)
  return {
    posts:      (response.posts ?? []) as TumblrPost[],
    totalPosts: Number(response.blog?.total_posts ?? response.total_posts ?? 0),
  }
}

/** Fetch blog info + oldest post using offset = total-1.
 *  Two API calls. Returns total count and oldest post timestamp in ms. */
export async function fetchBlogInfo(
  blogName: string
): Promise<{ totalPosts: number; newestTs?: number; oldestTs?: number }> {
  const client = createTumblrClient()
  const first = await client.blogPosts(blogName, { limit: 1, reblog_info: false, notes_info: false })
  const totalPosts = Number(first.blog?.total_posts ?? first.total_posts ?? 0)
  const newestPost = ((first.posts ?? []) as TumblrPost[])[0]
  const newestTs = newestPost ? newestPost.timestamp * 1000 : undefined
  if (totalPosts <= 1) return { totalPosts, newestTs, oldestTs: newestTs }
  const last = await client.blogPosts(blogName, {
    limit: 1,
    offset: Math.max(0, totalPosts - 1),
    reblog_info: false,
    notes_info: false,
  })
  const oldestPost = ((last.posts ?? []) as TumblrPost[])[0]
  return {
    totalPosts,
    newestTs,
    oldestTs: oldestPost ? oldestPost.timestamp * 1000 : undefined,
  }
}

/** Legacy single-action full fetch — kept for backwards compat. */
export async function fetchAllPosts(
  blogName: string,
  onPage: (posts: TumblrPost[]) => Promise<void>
): Promise<void> {
  const client = createTumblrClient()
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const response = await client.blogPosts(blogName, {
      limit: TUMBLR_PAGE_SIZE,
      offset,
      reblog_info: false,
      notes_info: false,
    })

    const posts = (response.posts ?? []) as TumblrPost[]

    if (posts.length === 0) { hasMore = false; break }

    await onPage(posts)
    offset += posts.length

    if (posts.length === TUMBLR_PAGE_SIZE) {
      await new Promise(resolve => setTimeout(resolve, 500))
    } else {
      hasMore = false
    }
  }
}

export function normalizeTumblrPost(post: TumblrPost): {
  title: string
  summary?: string
  contentType: 'comic'
  sourcePlatform: 'tumblr'
  contentOrigin: 'imported'
  sourcePostId: string
  sourcePostUrl: string
  sourceDate: number
  buyLink?: string
  coverImageUrl?: string
} {
  const rawHtml = post.caption ?? post.body ?? post.title ?? post.description ?? ''
  const rawText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const title = (rawText.slice(0, 100) || `Tumblr post ${post.id}`).trim()
  const summary = rawText.slice(0, 500) || undefined
  const coverImageUrl = post.photos?.[0]?.original_size?.url ?? undefined

  return {
    title,
    summary,
    contentType: 'comic',
    sourcePlatform: 'tumblr',
    contentOrigin: 'imported',
    sourcePostId: post.id,
    sourcePostUrl: post.post_url,
    sourceDate: post.timestamp * 1000,
    buyLink: post.type === 'link' ? post.url ?? undefined : undefined,
    coverImageUrl,
  }
}

export interface TumblrPublishParams {
  blogName: string
  type: 'photo' | 'text' | 'link'
  caption?: string
  imageUrls?: string[]
  title?: string
  body?: string
  linkUrl?: string
  linkTitle?: string
  linkDescription?: string
  tags: string[]
}

export async function publishPost(
  params: TumblrPublishParams
): Promise<{ id: string; url: string }> {
  let payload: Record<string, unknown>

  if (params.type === 'photo') {
    const imageUrls = (params.imageUrls ?? []).filter(Boolean)
    if (imageUrls.length === 0) {
      // Fallback to text post when no usable image URLs
      payload = {
        type: 'text',
        title: params.caption?.split('\n')[0]?.slice(0, 100) ?? '',
        body: params.caption ?? '',
        tags: params.tags.join(','),
      }
    } else {
      // Fetch images as binary and send via multipart/form-data
      // base64 in form-encoded body → Tumblr detects as text/plain → 400
      const UA = 'SuperheroesInColor-CMS/1.0 (miltond.diaz@gmail.com)'
      const imageBuffers = await Promise.all(
        imageUrls.slice(0, 10).map(async url => {
          const res = await fetch(url, { headers: { 'User-Agent': UA } })
          if (!res.ok) throw new Error(`Image fetch failed ${res.status}: ${url.slice(0, 120)}`)
          const ct = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
          if (!ct.startsWith('image/')) throw new Error(`Not an image: "${ct}" from ${url.slice(0, 120)}`)
          return { data: await res.arrayBuffer(), mimeType: ct }
        })
      )
      const json = await tumblrLegacyPostPhoto(
        params.blogName,
        { type: 'photo', caption: params.caption ?? '', tags: params.tags.join(',') },
        imageBuffers,
      )
      const postId = String(json?.response?.id ?? json?.id ?? '')
      if (!postId) throw new Error(`Tumblr no devolvió ID. Respuesta: ${JSON.stringify(json)}`)
      const blogHost = params.blogName.includes('.') ? params.blogName : `${params.blogName}.tumblr.com`
      return { id: postId, url: `https://${blogHost}/post/${postId}` }
    }
  } else if (params.type === 'text') {
    payload = {
      type: 'text',
      title: params.title ?? '',
      body: params.body ?? '',
      tags: params.tags.join(','),
    }
  } else {
    payload = {
      type: 'link',
      url: params.linkUrl ?? '',
      title: params.linkTitle ?? '',
      description: params.linkDescription ?? '',
      tags: params.tags.join(','),
    }
  }

  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload)) fields[k] = String(v)

  const json = await tumblrLegacyPost(params.blogName, fields)
  const postId = String(json?.response?.id ?? json?.id ?? '')
  if (!postId) throw new Error(`Tumblr no devolvió ID del post. Respuesta: ${JSON.stringify(json)}`)
  const blogHost = params.blogName.includes('.') ? params.blogName : `${params.blogName}.tumblr.com`
  return { id: postId, url: `https://${blogHost}/post/${postId}` }
}

export function selectPostType(
  hasImages: boolean,
  hasBuyLink: boolean
): 'photo' | 'link' | 'text' {
  if (hasImages) return 'photo'
  if (hasBuyLink) return 'link'
  return 'text'
}
