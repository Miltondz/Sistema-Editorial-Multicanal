import { TwitterApi, type SendTweetV2Params } from 'twitter-api-v2'

type MediaIdTuple =
  | [string]
  | [string, string]
  | [string, string, string]
  | [string, string, string, string]

function createXClient() {
  return new TwitterApi({
    appKey:       process.env.X_API_KEY!,
    appSecret:    process.env.X_API_SECRET!,
    accessToken:  process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  })
}

export interface XPublishParams {
  text: string
  imageUrls?: string[]
}

export async function publishTweet(
  params: XPublishParams
): Promise<{ id: string; url: string }> {
  const client = createXClient().readWrite
  const mediaIds: string[] = []

  if (params.imageUrls && params.imageUrls.length > 0) {
    for (const url of params.imageUrls.slice(0, 4)) {
      const imageResponse = await fetch(url)
      const imageBuffer = await imageResponse.arrayBuffer()
      const mimeType = imageResponse.headers.get('content-type') ?? 'image/jpeg'
      const mediaId = await client.v1.uploadMedia(Buffer.from(imageBuffer), { mimeType })
      mediaIds.push(mediaId)
    }
  }

  const tweetPayload: SendTweetV2Params = { text: params.text }

  if (mediaIds.length > 0) {
    tweetPayload.media = { media_ids: mediaIds as unknown as MediaIdTuple }
  }

  const response = await client.v2.tweet(tweetPayload)
  const tweetId = response.data.id
  const me = await client.v2.me()
  const tweetUrl = `https://x.com/${me.data.username}/status/${tweetId}`
  return { id: tweetId, url: tweetUrl }
}

export interface XExportTweet {
  tweet: {
    id: string
    full_text: string
    created_at: string
    entities?: {
      urls?: Array<{ url: string; expanded_url: string; display_url: string }>
      media?: Array<{ media_url_https: string; type: 'photo' | 'video' | 'animated_gif' }>
    }
    in_reply_to_status_id?: string
    retweeted_status_id?: string
  }
}

export function normalizeTweetToContentItem(tweet: XExportTweet['tweet']): {
  title: string
  summary: string
  contentType: 'comic'
  sourcePlatform: 'x'
  contentOrigin: 'imported'
  sourcePostId: string
  sourcePostUrl: string
  sourceDate: number
  buyLink?: string
} {
  let text = tweet.full_text
  if (tweet.entities?.urls) {
    for (const u of tweet.entities.urls) {
      text = text.replace(u.url, u.expanded_url)
    }
  }

  const buyLink = tweet.entities?.urls?.find(
    u =>
      !u.expanded_url.includes('t.co/') &&
      !u.expanded_url.includes('twitter.com') &&
      !u.expanded_url.includes('x.com')
  )?.expanded_url

  return {
    title: text.slice(0, 100).trim(),
    summary: text,
    contentType: 'comic',   // provisional — for editorial review
    sourcePlatform: 'x',
    contentOrigin: 'imported',
    sourcePostId: tweet.id,
    sourcePostUrl: `https://x.com/i/status/${tweet.id}`,
    sourceDate: new Date(tweet.created_at).getTime(),
    buyLink,
  }
}

export function parseTweetExport(fileContent: string): XExportTweet['tweet'][] {
  const jsonContent = fileContent
    .replace(/^window\.YTD\.tweet\.part\d+\s*=\s*/, '')
    .trim()
  const raw: XExportTweet[] = JSON.parse(jsonContent)
  return raw
    .map(item => item.tweet)
    .filter(tweet => {
      if (tweet.in_reply_to_status_id) return false
      if (tweet.full_text.startsWith('RT @')) return false
      return true
    })
}
