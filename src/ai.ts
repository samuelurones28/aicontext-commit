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
// Three one-line messages fit comfortably; a low cap keeps runs cheap and fast.
const MAX_OUTPUT_TOKENS = 200

// Small, fast models: commit messages don't need a large model or reasoning.
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-6-luna'
}

export function resolveModel(provider: AIProvider): string {
  return readConfigValue('ACC_MODEL') ?? DEFAULT_MODELS[provider]
}

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

export function buildOpenAIChatCompletionRequest(prompt: string, model: string = DEFAULT_MODELS.openai) {
  return {
    model,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    // Skip reasoning: it adds latency and bills hidden output tokens for no gain here.
    // 'none' is newer than the SDK's ReasoningEffort type, hence the cast.
    reasoning_effort: 'none' as unknown as 'low',
    messages: [{ role: 'user' as const, content: prompt }]
  }
}

export async function generateCommitMessages(prompt: string): Promise<string[]> {
  const { provider, apiKey } = detectProvider()
  const model = resolveModel(provider)

  let rawText = ''

  try {
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS })
      const response = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
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
      const response = await client.chat.completions.create(buildOpenAIChatCompletionRequest(prompt, model))
      rawText = response.choices[0]?.message?.content ?? ''
    }
  } catch (error: unknown) {
    if (error instanceof CliError) throw error

    throw new CliError({
      code: 'AI_PROVIDER_ERROR',
      message: `Could not generate suggestions with ${provider} (${model}).`,
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
