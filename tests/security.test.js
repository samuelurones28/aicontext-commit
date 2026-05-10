const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  readConfigValue,
  redactSecrets,
  sanitizeEnvForGit
} = require('../dist/security')

function withCwd(cwd, callback) {
  const previous = process.cwd()
  process.chdir(cwd)
  try {
    return callback()
  } finally {
    process.chdir(previous)
  }
}

test('redactSecrets removes common secret shapes while preserving context', () => {
  const result = redactSecrets(`
OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz
Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456
-----BEGIN PRIVATE KEY-----
super-secret-material
-----END PRIVATE KEY-----
`)

  assert.equal(result.redactionCount, 3)
  assert.doesNotMatch(result.text, /sk-proj-/)
  assert.doesNotMatch(result.text, /abcdefghijklmnopqrstuvwxyz123456/)
  assert.doesNotMatch(result.text, /super-secret-material/)
  assert.match(result.text, /OPENAI_API_KEY=\[REDACTED\]/)
  assert.match(result.text, /Authorization: Bearer \[REDACTED\]/)
})

test('sanitizeEnvForGit strips API keys and other secret-looking environment values', () => {
  const sanitized = sanitizeEnvForGit({
    PATH: '/usr/bin',
    HOME: '/tmp/home',
    OPENAI_API_KEY: 'sk-secret',
    GITHUB_TOKEN: 'ghp_secret',
    DATABASE_PASSWORD: 'secret'
  })

  assert.deepEqual(sanitized, {
    PATH: '/usr/bin',
    HOME: '/tmp/home'
  })
})

test('readConfigValue reads .env without mutating process.env', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aicontext-commit-env-'))
  fs.writeFileSync(path.join(directory, '.env'), 'ANTHROPIC_API_KEY=sk-ant-test\n')

  withCwd(directory, () => {
    const previous = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    try {
      assert.equal(readConfigValue('ANTHROPIC_API_KEY'), 'sk-ant-test')
      assert.equal(process.env.ANTHROPIC_API_KEY, undefined)
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previous
    }
  })
})
