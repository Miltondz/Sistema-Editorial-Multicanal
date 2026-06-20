// Pure functions — no "use node", safe to import in client components and server actions
// ponytail: buildTumblrPayload/buildXPayload moved here from convex/actions/publisher.ts so vitest can import them without Convex runtime

export const TUMBLR_FOOTER =
  '<p>[SuperheroesInColor&nbsp;<b><a href="https://linktr.ee/HeroesInColor">linktr.ee</a></b>&nbsp;/&nbsp;<a href="https://www.facebook.com/superheroesincolor/">FB</a>&nbsp;/ IG/&nbsp;<a href="https://twitter.com/HeroesInColor00"><b>Twitter</b></a>&nbsp;/&nbsp;<a href="https://www.twitch.tv/superheroesincolor">Twitch</a>&nbsp;/&nbsp;<b><a href="https://www.paypal.me/heroesincolor?locale.x=en_US">Support</a></b>]</p>'

export function buildFullTumblrCaption(headline: string, bodyText: string): string {
  return [`<h2>${headline}</h2>`, bodyText, TUMBLR_FOOTER].filter(Boolean).join('\n')
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

export interface XAssembly {
  text: string
  length: number
  truncated: boolean
}

export function assembleXTweet(variant: {
  headline?: string
  bodyText?: string
}): XAssembly {
  const CTA      = 'linktr.ee/HeroesInColor'
  const headline = stripHtml(variant.headline ?? '').trim()
  const overhead = headline.length + 4 + CTA.length
  const maxBody  = Math.max(0, 280 - overhead - 4)
  let   body     = stripHtml(variant.bodyText ?? '').trim()
  const truncated = body.length > maxBody
  if (truncated) body = body.slice(0, maxBody - 3) + '...'
  const parts = [headline, body, CTA].filter(Boolean)
  const text  = parts.join('\n\n')
  return { text, length: text.length, truncated }
}

// ── Tumblr / X payload builders ───────────────────────────────────────────
// Kept pure so they can be unit-tested without the Convex runtime.

import { selectPostType } from '../integrations/tumblr'

export interface TumblrPayload {
  blogName: string
  type: 'photo' | 'link' | 'text'
  caption?: string
  body?: string
  imageUrls?: string[]
  linkUrl?: string
  linkTitle?: string
  linkDescription?: string
  tags: string[]
}

export function buildTumblrPayload(
  variant: { headline?: string; bodyText?: string; ctaText?: string },
  item: { contentType: string; representationTags: string[]; themeTags: string[]; buyLink?: string; coverImageUrl?: string },
  mediaAssets: Array<{ publicUrl: string }>
): TumblrPayload {
  const effectiveAssets = mediaAssets.length > 0
    ? mediaAssets
    : item.coverImageUrl
      ? [{ publicUrl: item.coverImageUrl }]
      : []
  const hasImages = effectiveAssets.length > 0
  const postType  = selectPostType(hasImages, !!item.buyLink)

  const headline    = variant.headline ?? ''
  const bodyText    = variant.bodyText ?? ''
  const fullCaption = buildFullTumblrCaption(headline, bodyText)

  const variantTags = variant.ctaText
    ? variant.ctaText.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    : []
  const tags = [
    ...variantTags,
    ...(item.representationTags ?? []),
    ...(item.themeTags ?? []),
    item.contentType,
    'superherosincolor',
  ].filter((tag, i, a) => a.indexOf(tag) === i).slice(0, 30)

  return {
    blogName:        process.env.TUMBLR_BLOG_NAME!,
    type:            postType,
    caption:         postType === 'photo' ? fullCaption : undefined,
    body:            postType === 'text'  ? fullCaption : undefined,
    imageUrls:       postType === 'photo' ? effectiveAssets.map(a => a.publicUrl).slice(0, 1) : undefined,
    linkUrl:         postType === 'link'  ? item.buyLink ?? undefined : undefined,
    linkTitle:       postType === 'link'  ? headline : undefined,
    linkDescription: postType === 'link'  ? `${bodyText}\n${TUMBLR_FOOTER}` : undefined,
    tags,
  }
}

export interface XPayload {
  text: string
  imageUrls: string[]
}

export function buildXPayload(
  variant: { headline?: string; bodyText?: string; ctaText?: string },
  _item: { buyLink?: string },
  mediaAssets: Array<{ publicUrl: string }>
): XPayload {
  const { text } = assembleXTweet(variant)
  return {
    text,
    imageUrls: mediaAssets.map(a => a.publicUrl).slice(0, 4),
  }
}
