// Pure functions — no "use node", safe to import in client components and server actions

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
