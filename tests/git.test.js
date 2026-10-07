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
      /No staged changes found/
    )

    fs.writeFileSync(path.join(repo, 'README.md'), '# Test\n')
    runGit(['add', 'README.md'], repo)

    const diff = getStagedDiff()

    assert.match(diff, /diff --git/)
    assert.match(diff, /\+# Test/)
  })
})

test('getStagedDiff reports non-git directories before reading the staged diff', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aicontext-commit-no-repo-'))

  withCwd(directory, () => {
    assert.throws(
      () => getStagedDiff(),
      error => {
        assert.equal(error.code, 'NOT_GIT_REPOSITORY')
        assert.match(error.message, /git repository/)
        assert.ok(error.details.some(detail => detail.includes('staged changes')))
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

test('getStagedDiff summarizes lockfiles instead of sending their content', () => {
  const repo = makeRepo()

  withCwd(repo, () => {
    fs.writeFileSync(path.join(repo, 'index.js'), 'console.log(1)\n')
    fs.writeFileSync(path.join(repo, 'package-lock.json'), '{"lockfileVersion": 3}\n')
    runGit(['add', '.'], repo)

    const diff = getStagedDiff()

    assert.match(diff, /\+console\.log\(1\)/)
    assert.match(diff, /Lockfile changes \(content omitted\)/)
    assert.match(diff, /package-lock\.json \| 1 \+/)
    assert.doesNotMatch(diff, /lockfileVersion/)
  })
})

test('getStagedDiff still works when only a lockfile is staged', () => {
  const repo = makeRepo()

  withCwd(repo, () => {
    fs.writeFileSync(path.join(repo, 'yarn.lock'), 'dep@1.0.0\n')
    runGit(['add', '.'], repo)

    assert.match(getStagedDiff(), /yarn\.lock/)
  })
})

test('getStagedDiff sees the whole repo when run from a subdirectory', () => {
  const repo = makeRepo()
  fs.mkdirSync(path.join(repo, 'sub'))

  fs.writeFileSync(path.join(repo, 'root.txt'), 'root\n')
  runGit(['add', '.'], repo)

  withCwd(path.join(repo, 'sub'), () => {
    assert.match(getStagedDiff(), /\+root/)
  })
})

test('getRecentCommits returns subjects only, without hashes or merges', () => {
  const repo = makeRepo()

  withCwd(repo, () => {
    fs.writeFileSync(path.join(repo, 'one.txt'), 'one\n')
    runGit(['add', 'one.txt'], repo)
    runGit(['commit', '-m', 'feat: first commit'], repo)

    assert.equal(getRecentCommits(5).trim(), 'feat: first commit')
  })
})
