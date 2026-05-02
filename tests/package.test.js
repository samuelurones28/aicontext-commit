const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

test('build output exposes the configured CLI entrypoint', () => {
  const binPath = path.join(root, 'bin', 'index.js')
  const distPath = path.join(root, 'dist', 'index.js')

  assert.equal(fs.existsSync(binPath), true)
  assert.equal(fs.existsSync(distPath), true)
  assert.match(fs.readFileSync(binPath, 'utf-8'), /require\('\.\.\/dist\/index\.js'\)/)
})

test('npm pack dry run includes the CLI wrapper and compiled files', () => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf-8'
  })
  const [pack] = JSON.parse(output)
  const files = pack.files.map(file => file.path)

  assert.ok(files.includes('bin/index.js'))
  assert.ok(files.includes('dist/index.js'))
  assert.ok(files.includes('dist/ai.js'))
  assert.ok(files.includes('package.json'))
})
