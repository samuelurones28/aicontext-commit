const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { getRecentCommits, getStagedDiff } = require('../dist/git')

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'aicontext-commit-test-'))

  runGit(['init'], repo)
  runGit(['config', 'user.email', 'test@example.com'], repo)
  runGit(['config', 'user.name', 'Test User'], repo)

  return repo
}

function withCwd(cwd, callback) {
  const previous = process.cwd()
  process.chdir(cwd)
  try {
    return callback()
  } finally {
    process.chdir(previous)
  }
}

test('getStagedDiff returns the cached diff and rejects empty staged changes', () => {
  const repo = makeRepo()

  withCwd(repo, () => {
    assert.throws(
      () => getStagedDiff(),
      /No hay cambios staged/
    )

    fs.writeFileSync(path.join(repo, 'README.md'), '# Test\n')
    runGit(['add', 'README.md'], repo)

    const diff = getStagedDiff()

    assert.match(diff, /diff --git/)
    assert.match(diff, /\+# Test/)
  })
})

test('getStagedDiff reports git context errors with an actionable code', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aicontext-commit-no-repo-'))

  withCwd(directory, () => {
    assert.throws(
      () => getStagedDiff(),
      error => {
        assert.equal(error.code, 'GIT_DIFF_FAILED')
        assert.match(error.message, /diff staged/)
        assert.ok(error.details.some(detail => detail.includes('repositorio git')))
        return true
      }
    )
  })
})

test('getRecentCommits returns the latest commits using the requested limit', () => {
  const repo = makeRepo()

  withCwd(repo, () => {
    fs.writeFileSync(path.join(repo, 'one.txt'), 'one\n')
    runGit(['add', 'one.txt'], repo)
    runGit(['commit', '-m', 'feat: first commit'], repo)

    fs.writeFileSync(path.join(repo, 'two.txt'), 'two\n')
    runGit(['add', 'two.txt'], repo)
    runGit(['commit', '-m', 'fix: second commit'], repo)

    const commits = getRecentCommits(1)

    assert.match(commits, /fix: second commit/)
    assert.doesNotMatch(commits, /feat: first commit/)
  })
})
