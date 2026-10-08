import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { CliError, messageFromUnknown } from './errors'
import { AI_API_KEY_NAMES, readConfigValue, redactSecrets } from './security'

export type AIProvider = 'anthropic' | 'openai' | 'ollama'

type ProviderCredentials = {
  provider: AIProvider
  apiKey: string
}

export type GenerateOptions = {
  // Cache the prompt so later regenerations of the same prompt are billed at a fraction.
  cachePrompt?: boolean
}

const AI_REQUEST_TIMEOUT_MS = 30_000
// Three one-line messages fit comfortably; a low cap keeps runs cheap and fast.
const MAX_OUTPUT_TOKENS = 200
// Models whose thinking cannot be turned off need room to think before answering.
const MAX_OUTPUT_TOKENS_WITH_THINKING = 2_000
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434'

// Small, fast models: commit messages don't need a large model or reasoning.
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-6-luna',
  ollama: 'qwen2.5-coder:7b'
}

export function resolveModel(provider: AIProvider): string {
  return readConfigValue('ACC_MODEL') ?? DEFAULT_MODELS[provider]
}

function detectProvider(): ProviderCredentials {
  // Explicit opt-in for a local model: free and nothing leaves the machine.
  if (readConfigValue('ACC_PROVIDER')?.toLowerCase() === 'ollama') {
    return { provider: 'ollama', apiKey: 'ollama' }
  }

  const anthropicApiKey = readConfigValue(AI_API_KEY_NAMES[0])
  if (anthropicApiKey) return { provider: 'anthropic', apiKey: anthropicApiKey }

  const openaiApiKey = readConfigValue(AI_API_KEY_NAMES[1])
  if (openaiApiKey) return { provider: 'openai', apiKey: openaiApiKey }

  // Without any API key, a configured Ollama host is enough.
  if (readConfigValue('OLLAMA_HOST')) return { provider: 'ollama', apiKey: 'ollama' }

  throw new CliError({
    code: 'MISSING_API_KEY',
    message: 'No AI API key found.',
    details: [
      'Set ANTHROPIC_API_KEY or OPENAI_API_KEY as an environment variable,',
      'or set ACC_PROVIDER=ollama to use a free local model.'
    ]
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

export function buildOllamaChatCompletionRequest(prompt: string, model: string = DEFAULT_MODELS.ollama) {
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user' as const, content: prompt }]
  }
}

// Haiku 5.x can switch thinking off; Opus/Sonnet 5.5 and Fable cannot, so they get the lowest effort.
function anthropicReasoningConfig(model: string) {
  if (/^claude-haiku-5/.test(model)) {
    return { max_tokens: MAX_OUTPUT_TOKENS, thinking: { type: 'disabled' as const } }
  }
  if (/^claude-(?:opus-5-5|sonnet-5-5|fable)/.test(model)) {
    return { max_tokens: MAX_OUTPUT_TOKENS_WITH_THINKING, output_config: { effort: 'low' as const } }
  }
  return { max_tokens: MAX_OUTPUT_TOKENS }
}

export function buildAnthropicMessageRequest(prompt: string, model: string = DEFAULT_MODELS.anthropic, options: GenerateOptions = {}) {
  return {
    model,
    ...anthropicReasoningConfig(model),
    ...(options.cachePrompt ? { cache_control: { type: 'ephemeral' as const } } : {}),
    messages: [{ role: 'user' as const, content: prompt }]
  }
}

function resolveOllamaBaseUrl(): string {
  const host = readConfigValue('OLLAMA_HOST') ?? DEFAULT_OLLAMA_HOST
  const withScheme = /^https?:\/\//.test(host) ? host : `http://${host}`
  return `${withScheme.replace(/\/+$/, '')}/v1`
}

export async function generateCommitMessages(prompt: string, options: GenerateOptions = {}): Promise<string[]> {
  const { provider, apiKey } = detectProvider()
  const model = resolveModel(provider)

  let rawText = ''

  try {
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS })
      const response = await client.messages.create(buildAnthropicMessageRequest(prompt, model, options))
      const block = response.content.find(contentBlock => contentBlock.type === 'text')
      if (!block) {
        throw new CliError({
          code: 'UNEXPECTED_RESPONSE',
          message: 'Anthropic returned a response with no usable text.'
        })
      }
      rawText = block.text

    } else if (provider === 'ollama') {
      const client = new OpenAI({ apiKey, baseURL: resolveOllamaBaseUrl(), timeout: AI_REQUEST_TIMEOUT_MS })
      const response = await client.chat.completions.create(buildOllamaChatCompletionRequest(prompt, model))
      rawText = response.choices[0]?.message?.content ?? ''

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
        provider === 'ollama'
          ? `Make sure Ollama is running and the model is installed (ollama pull ${model}).`
          : 'Check your connection, the API key, and the provider status.',
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
