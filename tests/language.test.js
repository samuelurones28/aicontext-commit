const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { parseCommitLanguage, resolveCommitLanguage } = require('../dist/language')
const bin = path.resolve(__dirname, '../bin/index.js')

test('language options accept short, long, and equals forms and normalize codes', () => {
  assert.equal(parseCommitLanguage(' ES '), 'es')
  assert.equal(resolveCommitLanguage(['-l', 'en']), 'en')
  assert.equal(resolveCommitLanguage(['--language', 'auto']), 'auto')
  assert.equal(resolveCommitLanguage(['--language=ca']), 'ca')
})

test('invalid or missing languages fail clearly before reading git or calling AI', () => {
  for (const args of [['--language'], ['-l', '--help'], ['--language='], ['--language', 'invalid']]) {
    assert.throws(() => resolveCommitLanguage(args), { code: 'INVALID_LANGUAGE' })
  }
  const result = spawnSync(process.execPath, [bin, '--language', 'invalid'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /INVALID_LANGUAGE/)
  assert.doesNotMatch(result.stdout, /Reading staged changes|Generating suggestions/)
})

test('language configuration follows CLI, environment, then project .env precedence', () => {
  const cwd = process.cwd()
  const previous = process.env.ACC_LANGUAGE
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-language-'))
  try {
    process.chdir(directory)
    delete process.env.ACC_LANGUAGE
    assert.equal(resolveCommitLanguage([]), undefined)
    fs.writeFileSync('.env', 'ACC_LANGUAGE=es\n')
    assert.equal(resolveCommitLanguage([]), 'es')
    assert.equal(process.env.ACC_LANGUAGE, undefined)
    process.env.ACC_LANGUAGE = 'fr'
    assert.equal(resolveCommitLanguage([]), 'fr')
    assert.equal(resolveCommitLanguage(['-l', 'en']), 'en')
    process.env.ACC_LANGUAGE = 'invalid'
    assert.equal(resolveCommitLanguage(['-l', 'auto']), 'auto')
    assert.throws(() => resolveCommitLanguage([]), { code: 'INVALID_LANGUAGE' })
  } finally {
    process.chdir(cwd)
    if (previous === undefined) delete process.env.ACC_LANGUAGE
    else process.env.ACC_LANGUAGE = previous
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('CLI help documents language selection without requiring staged changes', () => {
  const help = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })
  assert.match(help, /--language <code>/)
  assert.match(help, /ACC_LANGUAGE/)
})
