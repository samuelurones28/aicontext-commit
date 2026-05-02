const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildOpenAIChatCompletionRequest,
  generateCommitMessages,
  parseCommitSuggestions
} = require('../dist/ai')

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

  assert.equal(request.model, 'gpt-5.4-mini')
  assert.equal(request.max_completion_tokens, 1024)
  assert.equal(Object.hasOwn(request, 'max_tokens'), false)
  assert.deepEqual(request.messages, [{ role: 'user', content: 'prompt' }])
})

test('generateCommitMessages reports missing provider configuration clearly', async () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY
  const previousOpenAiKey = process.env.OPENAI_API_KEY

  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY

  try {
    await assert.rejects(
      () => generateCommitMessages('prompt'),
      error => {
        assert.equal(error.code, 'MISSING_API_KEY')
        assert.match(error.message, /API key/)
        assert.deepEqual(error.details, [
          'Set ANTHROPIC_API_KEY or OPENAI_API_KEY as an environment variable.'
        ])
        return true
      }
    )
  } finally {
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey

    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousOpenAiKey
  }
})
