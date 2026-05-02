import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { CliError, messageFromUnknown } from './errors'

export type AIProvider = 'anthropic' | 'openai'

function detectProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  throw new CliError({
    code: 'MISSING_API_KEY',
    message: 'No se encontró una API key de IA.',
    details: ['Define ANTHROPIC_API_KEY u OPENAI_API_KEY como variable de entorno.']
  })
}

export function parseCommitSuggestions(text: string): string[] {
  return text
    .split('\n')
    .filter(line => /^\d+\./.test(line.trim()))
    .map(line => line.replace(/^\d+\.\s*/, '').trim())
    .filter(line => line.length > 0)
    .slice(0, 3)
}

export async function generateCommitMessages(prompt: string): Promise<string[]> {
  const provider = detectProvider()

  let rawText = ''

  try {
    if (provider === 'anthropic') {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
      const block = response.content[0]
      if (block?.type !== 'text') {
        throw new CliError({
          code: 'UNEXPECTED_RESPONSE',
          message: 'Anthropic devolvió una respuesta sin texto utilizable.'
        })
      }
      rawText = block.text

    } else {
      const client = new OpenAI()
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
      rawText = response.choices[0]?.message?.content ?? ''
    }
  } catch (error: unknown) {
    if (error instanceof CliError) throw error

    throw new CliError({
      code: 'AI_PROVIDER_ERROR',
      message: `No se pudieron generar sugerencias con ${provider}.`,
      details: [
        'Revisa tu conexión, la API key y el estado del proveedor.',
        messageFromUnknown(error)
      ],
      cause: error
    })
  }

  const suggestions = parseCommitSuggestions(rawText)

  if (suggestions.length !== 3) {
    throw new CliError({
      code: 'AI_PARSE_ERROR',
      message: 'No se pudieron parsear exactamente 3 sugerencias.',
      details: [
        'Regenera las sugerencias o escribe el mensaje manualmente.',
        `Respuesta del modelo: ${truncate(rawText)}`
      ]
    })
  }

  return suggestions
}

function truncate(text: string, maxLength = 500): string {
  if (!text.trim()) return '(vacía)'
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
