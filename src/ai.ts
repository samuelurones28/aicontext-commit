import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { CliError, messageFromUnknown } from './errors'
import { AI_API_KEY_NAMES, readConfigValue, redactSecrets } from './security'

export type AIProvider = 'anthropic' | 'openai'

type ProviderCredentials = {
  provider: AIProvider
  apiKey: string
}

const AI_REQUEST_TIMEOUT_MS = 30_000

function detectProvider(): ProviderCredentials {
  const anthropicApiKey = readConfigValue(AI_API_KEY_NAMES[0])
  if (anthropicApiKey) return { provider: 'anthropic', apiKey: anthropicApiKey }

  const openaiApiKey = readConfigValue(AI_API_KEY_NAMES[1])
  if (openaiApiKey) return { provider: 'openai', apiKey: openaiApiKey }

  throw new CliError({
    code: 'MISSING_API_KEY',
    message: 'No AI API key found.',
    details: ['Set ANTHROPIC_API_KEY or OPENAI_API_KEY as an environment variable.']
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

export function buildOpenAIChatCompletionRequest(prompt: string) {
  return {
    model: 'gpt-5.4-mini',
    max_completion_tokens: 1024,
    messages: [{ role: 'user' as const, content: prompt }]
  }
}

export async function generateCommitMessages(prompt: string): Promise<string[]> {
  const { provider, apiKey } = detectProvider()

  let rawText = ''

  try {
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS })
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
      const block = response.content[0]
      if (block?.type !== 'text') {
        throw new CliError({
          code: 'UNEXPECTED_RESPONSE',
          message: 'Anthropic returned a response with no usable text.'
        })
      }
      rawText = block.text

    } else {
      const client = new OpenAI({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS })
      const response = await client.chat.completions.create(buildOpenAIChatCompletionRequest(prompt))
      rawText = response.choices[0]?.message?.content ?? ''
    }
  } catch (error: unknown) {
    if (error instanceof CliError) throw error

    throw new CliError({
      code: 'AI_PROVIDER_ERROR',
      message: `Could not generate suggestions with ${provider}.`,
      details: [
        'Check your connection, the API key, and the provider status.',
        redactSecrets(messageFromUnknown(error)).text
      ],
      cause: error
    })
  }

  const suggestions = parseCommitSuggestions(rawText)

  if (suggestions.length !== 3) {
    const redactedResponse = redactSecrets(rawText).text
    throw new CliError({
      code: 'AI_PARSE_ERROR',
      message: 'Failed to parse exactly 3 suggestions.',
      details: [
        'Regenerate the suggestions or write the message manually.',
        process.env.DEBUG
          ? `Model response: ${truncate(redactedResponse)}`
          : 'Set DEBUG=1 to inspect the redacted raw model response.'
      ]
    })
  }

  return suggestions
}

function truncate(text: string, maxLength = 500): string {
  if (!text.trim()) return '(empty)'
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
