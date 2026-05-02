const assert = require('node:assert/strict')
const test = require('node:test')

const { CliError, formatCliError, isPromptCancelError, messageFromUnknown } = require('../dist/errors')

test('formatCliError includes message, code and details', () => {
  const output = formatCliError(new CliError({
    code: 'NO_STAGED_CHANGES',
    message: 'No staged changes found.',
    details: ['Use git add before running acc.']
  }))

  assert.match(output, /Error: No staged changes found\./)
  assert.match(output, /Code: NO_STAGED_CHANGES/)
  assert.match(output, /Use git add/)
})

test('formatCliError normalizes unexpected errors', () => {
  const output = formatCliError(new Error('Something failed internally'))

  assert.match(output, /Something failed internally/)
  assert.match(output, /Code: UNEXPECTED_ERROR/)
})

test('isPromptCancelError recognizes inquirer cancellation', () => {
  const error = new Error('User force closed the prompt with 0 null')
  error.name = 'ExitPromptError'

  assert.equal(isPromptCancelError(error), true)
})

test('messageFromUnknown normalizes non-error values', () => {
  assert.equal(messageFromUnknown('failed'), 'failed')
  assert.equal(messageFromUnknown({}), 'Unknown error')
})
