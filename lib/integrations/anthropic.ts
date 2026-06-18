import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT_BASE =
  'Eres un asistente editorial especializado en cómics y cultura pop con perspectiva de diversidad racial, étnica y de género. Ayudas a gestionar el catálogo editorial de SuperheroesInColor. Responde siempre en español. Sé conciso y preciso. Cuando debas generar JSON, devuelve únicamente JSON válido sin texto adicional ni bloques de código markdown.'

export { SYSTEM_PROMPT_BASE }

export async function complete(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2000
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('Anthropic API devolvió respuesta sin bloque de texto')
  }
  return block.text
}

export function parseJsonSafe<T>(text: string): T {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned) as T
}
