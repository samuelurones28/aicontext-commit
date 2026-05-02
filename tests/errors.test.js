const assert = require('node:assert/strict')
const test = require('node:test')

const { CliError, formatCliError, isPromptCancelError, messageFromUnknown } = require('../dist/errors')

test('formatCliError includes message, code and details', () => {
  const output = formatCliError(new CliError({
    code: 'NO_STAGED_CHANGES',
    message: 'No hay cambios staged.',
    details: ['Usa git add antes de ejecutar acc.']
  }))

  assert.match(output, /Error: No hay cambios staged\./)
  assert.match(output, /Código: NO_STAGED_CHANGES/)
  assert.match(output, /Usa git add/)
})

test('formatCliError normalizes unexpected errors', () => {
  const output = formatCliError(new Error('Falló algo interno'))

  assert.match(output, /Falló algo interno/)
  assert.match(output, /Código: UNEXPECTED_ERROR/)
})

test('isPromptCancelError recognizes inquirer cancellation', () => {
  const error = new Error('User force closed the prompt with 0 null')
  error.name = 'ExitPromptError'

  assert.equal(isPromptCancelError(error), true)
})

test('messageFromUnknown normalizes non-error values', () => {
  assert.equal(messageFromUnknown('falló'), 'falló')
  assert.equal(messageFromUnknown({}), 'Error desconocido')
})
