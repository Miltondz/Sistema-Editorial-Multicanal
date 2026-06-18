import OpenAI from 'openai'

const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite'

// ── System prompt ─────────────────────────────────────────────────────────────
// Used as base context for all AI calls. Injected as the "system" role message.

export const SYSTEM_PROMPT_BASE = `You are an editorial assistant for SuperheroesInColor, a long-running blog dedicated to racial, ethnic, cultural, and gender diversity in comics, graphic novels, manga, and their adaptations (film, TV, cosplay).

Your role is to help catalog, describe, and promote content that centers underrepresented creators and characters.

LANGUAGE AND TONE RULES — follow these strictly:
- All output must be in English, regardless of the language of the input.
- Be specific: name the actual identities represented (e.g., "Black Panther is a Black African king", not "a diverse hero"). Specificity is respectful; vagueness is not.
- Use identity-affirming language. Prefer "Black creator", "Latina writer", "Indigenous artist", "queer superhero" over generic phrases like "diverse" or "minority" when the specific identity is known.
- Do not use "minority" as a noun. Use "underrepresented communities", "marginalized groups", or the specific identity instead.
- Avoid tokenizing language: do not frame representation as a novelty or exception (e.g., avoid "the first Black [X]" framing unless it is genuinely historically significant and sourced).
- Celebrate without being preachy or performative. The voice is enthusiastic and curatorial, not activist-lecture.
- When identity is uncertain or unknown, do not assume or invent — omit or note as "unknown".
- Intersectionality matters: a creator can be a Black woman, a queer Latinx artist, etc. — acknowledge multiple identities when they are known and relevant.
- Output JSON exactly as specified. No markdown fences, no extra commentary, no translations.`

// ── API client ────────────────────────────────────────────────────────────────

export async function complete(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2000
): Promise<string> {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
      'X-Title': 'SuperheroesInColor CMS',
    },
  })

  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('OpenRouter returned empty response')
  return text
}

export function parseJsonSafe<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned) as T
}
