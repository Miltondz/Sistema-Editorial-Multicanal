/* eslint-disable @typescript-eslint/no-explicit-any */
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
  const params: Record<string, unknown> = { limit, reblog_info: false, notes_info: false }
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
  const client = createTumblrClient()
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
      payload = {
        type: 'photo',
        // Legacy API source must be a single string URL.
        // Multi-photo requires base64 data upload — not supported here; use first image.
        source: imageUrls[0],
        caption: params.caption ?? '',
        tags: params.tags.join(','),
      }
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

  // createLegacyPost uses the legacy REST API v2 format (type/body/caption/source/tags)
  // createPost (v5 default) uses NPF format which has a completely different schema
  const response = await client.createLegacyPost(params.blogName, payload)
  const postId = String(response?.id ?? response?.Id ?? '')
  if (!postId) throw new Error(`Tumblr no devolvió ID del post. Respuesta: ${JSON.stringify(response)}`)
  const blogHost = params.blogName.includes('.') ? params.blogName : `${params.blogName}.tumblr.com`
  const postUrl = `https://${blogHost}/post/${postId}`
  return { id: postId, url: postUrl }
}

export function selectPostType(
  hasImages: boolean,
  hasBuyLink: boolean
): 'photo' | 'link' | 'text' {
  if (hasImages) return 'photo'
  if (hasBuyLink) return 'link'
  return 'text'
}
