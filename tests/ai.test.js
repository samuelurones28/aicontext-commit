const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  buildAnthropicMessageRequest,
  buildOllamaChatCompletionRequest,
  buildOpenAIChatCompletionRequest,
  generateCommitMessages,
  parseCommitSuggestions,
  resolveModel
} = require('../dist/ai')

async function withCwd(cwd, callback) {
  const previous = process.cwd()
  process.chdir(cwd)
  try {
    return await callback()
  } finally {
    process.chdir(previous)
  }
}

test('parseCommitSuggestions extracts exactly the first three numbered suggestions', () => {
  const result = parseCommitSuggestions(`
Intro text that should be ignored
1. feat(cli): add commit picker
2. fix(git): handle empty staged diff
3. docs(readme): add setup instructions
4. chore: ignore extra model output
`)

  assert.deepEqual(result, [
    'feat(cli): add commit picker',
    'fix(git): handle empty staged diff',
    'docs(readme): add setup instructions'
  ])
})

test('parseCommitSuggestions ignores non-numbered lines', () => {
  const result = parseCommitSuggestions(`
- feat(cli): wrong format
1. feat(cli): valid suggestion
Notes:
2. fix(ai): parse model output
`)

  assert.deepEqual(result, [
    'feat(cli): valid suggestion',
    'fix(ai): parse model output'
  ])
})

test('buildOpenAIChatCompletionRequest uses the current token limit parameter', () => {
  const request = buildOpenAIChatCompletionRequest('prompt')

  assert.equal(request.model, 'gpt-6-luna')
  assert.equal(request.max_completion_tokens, 200)
  assert.equal(request.reasoning_effort, 'none')
  assert.equal(Object.hasOwn(request, 'max_tokens'), false)
  assert.deepEqual(request.messages, [{ role: 'user', content: 'prompt' }])
})

test('buildOpenAIChatCompletionRequest accepts a model override', () => {
  assert.equal(buildOpenAIChatCompletionRequest('prompt', 'gpt-5.4-nano').model, 'gpt-5.4-nano')
})

test('resolveModel uses ACC_MODEL when set and per-provider defaults otherwise', () => {
  const previous = process.env.ACC_MODEL
  try {
    delete process.env.ACC_MODEL
    assert.equal(resolveModel('anthropic'), 'claude-haiku-5-5')
    assert.equal(resolveModel('openai'), 'gpt-6-luna')
    assert.equal(resolveModel('ollama'), 'qwen2.5-coder:7b')

    process.env.ACC_MODEL = 'claude-sonnet-5-5'
    assert.equal(resolveModel('anthropic'), 'claude-sonnet-5-5')
  } finally {
    if (previous === undefined) delete process.env.ACC_MODEL
    else process.env.ACC_MODEL = previous
  }
})

test('generateCommitMessages reports missing provider configuration clearly', async () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY
  const previousOpenAiKey = process.env.OPENAI_API_KEY
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aicontext-commit-no-env-'))

  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY

  try {
    await withCwd(directory, async () => {
      await assert.rejects(
        () => generateCommitMessages('prompt'),
        error => {
          assert.equal(error.code, 'MISSING_API_KEY')
          assert.match(error.message, /API key/)
          assert.match(error.details.join(' '), /ANTHROPIC_API_KEY or OPENAI_API_KEY/)
          assert.match(error.details.join(' '), /ACC_PROVIDER=ollama/)
          return true
        }
      )
    })
  } finally {
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey

    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousOpenAiKey
  }
})

test('buildAnthropicMessageRequest disables thinking on Haiku and caches only when asked', () => {
  const request = buildAnthropicMessageRequest('prompt')

  assert.equal(request.model, 'claude-haiku-5-5')
  assert.equal(request.max_tokens, 200)
  assert.deepEqual(request.thinking, { type: 'disabled' })
  assert.equal(Object.hasOwn(request, 'cache_control'), false)

  const cached = buildAnthropicMessageRequest('prompt', 'claude-haiku-5-5', { cachePrompt: true })
  assert.deepEqual(cached.cache_control, { type: 'ephemeral' })
})

test('buildAnthropicMessageRequest uses low effort on models whose thinking cannot be disabled', () => {
  const request = buildAnthropicMessageRequest('prompt', 'claude-opus-5-5')

  assert.equal(Object.hasOwn(request, 'thinking'), false)
  assert.deepEqual(request.output_config, { effort: 'low' })
  assert.ok(request.max_tokens > 200)
})

test('buildOllamaChatCompletionRequest omits OpenAI-only reasoning options', () => {
  const request = buildOllamaChatCompletionRequest('prompt')

  assert.equal(request.model, 'qwen2.5-coder:7b')
  assert.equal(Object.hasOwn(request, 'reasoning_effort'), false)
})
